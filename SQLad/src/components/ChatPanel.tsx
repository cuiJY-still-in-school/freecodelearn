import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import BoltIcon from "@mui/icons-material/Bolt";
import SearchIcon from "@mui/icons-material/Search";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import type {
  ChatMessage,
  ProviderInfo,
  ToolCall,
  ToolSpec,
} from "../api/types";
import { ResultTable } from "./ResultTable";

function isQueryResult(
  v: unknown
): v is { columns: string[]; rows: unknown[][]; row_count: number; executed?: string | null } {
  return (
    !!v &&
    typeof v === "object" &&
    Array.isArray((v as { columns?: unknown }).columns)
  );
}

export interface LocalTool {
  spec: ToolSpec;
  /** Invoked when the AI calls this tool. Return value is sent back as tool result. */
  invoke: (args: unknown) => Promise<unknown> | unknown;
}

export interface ChatPanelProps {
  /** Title shown at the top. */
  title?: string;
  /** Optional system context appended after the base system prompt
   *  (e.g. "你当前正在看 sales 表，schema 是 ..."). */
  contextHint?: string;
  /** Extra tools the AI can call. These are checked before the backend tools. */
  localTools?: LocalTool[];
  /** Compact mode: smaller paddings for side-dock use. */
  compact?: boolean;
  storageKey?: string;
  onOpenSettings?: () => void;
}

const baseSystem = (extra?: string): ChatMessage => ({
  role: "system",
  content:
    "你是 SQLad，一个会管数据的助手。用户跟你说人话，你用工具完成。" +
    "你有能力：建表、插数据、查询、调外部 API、OAuth 登录、定时自动化、接收 webhook、改视图（排序/图表/卡片/Markdown）。" +
    "但你不需要告诉用户这些名词。用户说「帮我记个账」你就建表插数据。用户说「把 GitHub 的 issue 拉下来」你就 fetch_url + create_table + insert_rows 一气呵成。" +
    "用户说「发到群里」你就找 webhook 或消息 API 发。用户说「每小时检查一次」你就建 trigger。" +
    "用户说「画个图」「做个看板」「写个报告」你就调前端视图工具。" +
    "说话像同事，别像文档。回复短，直接给结果。拿到的 token 立刻存起来（save_credential），永不复述。" +
    (extra ? "\n" + extra : ""),
});

export function ChatPanel({
  title = "AI 对话",
  contextHint,
  localTools = [],
  compact = false,
  storageKey,
  onOpenSettings,
}: ChatPanelProps) {
  // Tools from backend (registered Rust tools)
  const [backendTools, setBackendTools] = useState<ToolSpec[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  // Health: null = unknown, "ok" = reachable, error string otherwise.
  const [health, setHealth] = useState<"ok" | null | string>(null);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as ChatMessage[];
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {
        /* ignore */
      }
    }
    const sys = baseSystem(contextHint);
    const welcome: ChatMessage = {
      role: "assistant",
      content: contextHint
        ? "你好！我看到当前表了。试试点下面的 chip 或者直接告诉我你想怎么查看 / 处理这些数据。"
        : "你好！我是 SQLad。跟我说人话就行——建表、导数据、画图、连外部服务，都是我的事。试试点下面的 chip 或者直接输入。",
    };
    return [sys, welcome];
  });
  const [pending, setPending] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchIdx, setSearchIdx] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visible = messages.filter((m) => m.role !== "system");
  // Filter visible messages when searching.
  const filtered = useMemo(() => {
    if (!search.trim()) return visible;
    const s = search.toLowerCase();
    return visible.filter((m) => m.content.toLowerCase().includes(s));
  }, [visible, search]);

  useEffect(() => {
    void api.listTools().then(setBackendTools);
    void api.listAiProviders().then(setProviders);
  }, []);

  // Silent health check — only on the main ChatPanel (not per-table docks).
  useEffect(() => {
    if (compact) { setHealth(null); return; } // skip in table dock
    let cancelled = false;
    const active = providers.find((p) => p.is_default);
    if (!active) { setHealth(null); return; }
    setHealth(null);
    (async () => {
      try {
        const settings = await api.getSettings();
        const full = settings.providers.find((p) => p.id === active.id);
        if (!full) return;
        await api.testProvider(full);
        if (!cancelled) setHealth("ok");
      } catch {
        if (!cancelled) setHealth("silent"); // don't show error for health check
      }
    })();
    return () => { cancelled = true; };
  }, [providers, compact]);

  // Refresh the system message if contextHint changes (e.g. user switched tables).
  useEffect(() => {
    setMessages((prev) => {
      const next = [...prev];
      if (next[0]?.role === "system") {
        next[0] = baseSystem(contextHint);
      } else {
        next.unshift(baseSystem(contextHint));
      }
      return next;
    });
  }, [contextHint]);

  useEffect(() => {
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(messages));
      } catch {
        /* ignore */
      }
    }
  }, [messages, storageKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, pending]);

  const activeProvider = providers.find((p) => p.is_default);
  const tools = useMemo<ToolSpec[]>(
    () => [...localTools.map((t) => t.spec), ...backendTools],
    [localTools, backendTools]
  );
  const localToolMap = useMemo(() => {
    const m = new Map<string, LocalTool>();
    localTools.forEach((t) => m.set(t.spec.name, t));
    return m;
  }, [localTools]);

  const runToolCall = useCallback(
    async (call: ToolCall): Promise<ChatMessage> => {
      try {
        const local = localToolMap.get(call.name);
        const result = local
          ? await local.invoke(call.arguments)
          : await api.invokeTool(call.name, call.arguments);
        return {
          role: "tool",
          content: JSON.stringify(result ?? { ok: true }),
          tool_call_id: call.id,
        };
      } catch (e) {
        return {
          role: "tool",
          content: JSON.stringify({
            error: e instanceof Error ? e.message : String(e),
          }),
          tool_call_id: call.id,
        };
      }
    },
    [localToolMap]
  );

  async function runTurn(history: ChatMessage[]) {
    setPending(true);
    let working = [...history];
    try {
      for (let round = 0; round < 5; round++) {
        const reply = await api.chat(
          { messages: working, tools, temperature: 0.2 },
          activeProvider?.id
        );
        const msg = reply.message;
        setMessages((prev) => [...prev, msg]);
        working = [...working, msg];

        const calls = msg.tool_calls ?? [];
        if (calls.length === 0) break;

        for (const call of calls) {
          const toolMsg = await runToolCall(call);
          setMessages((prev) => [...prev, toolMsg]);
          working = [...working, toolMsg];
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    setError(null);
    setInput("");
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    await runTurn([...messages, userMsg]);
  }

  function reset() {
    const sys = baseSystem(contextHint);
    const welcome: ChatMessage = {
      role: "assistant",
      content: contextHint
        ? "你好！我看到当前表了。试试点下面的 chip 或者直接告诉我你想怎么查看 / 处理这些数据。"
        : "你好！我是 SQLad。跟我说人话就行——建表、导数据、画图、连外部服务，都是我的事。试试点下面的 chip 或者直接输入。",
    };
    setMessages([sys, welcome]);
    if (storageKey) localStorage.removeItem(storageKey);
  }

  // Loop search index.
  const boundedIndex = searchIdx % Math.max(1, filtered.length);
  const pad = compact ? 1.5 : 3;

  return (
    <Stack sx={{ height: "100%", minWidth: 0 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: pad, py: 1.2, borderBottom: 1, borderColor: "divider" }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
          <BoltIcon fontSize="small" color="primary" />
          <Typography fontWeight={600} noWrap>
            {title}
          </Typography>
          <Chip
            size="small"
            variant="outlined"
            label={
              activeProvider
                ? `${activeProvider.name}${compact ? "" : ` · ${activeProvider.model}`}`
                : "⚙ 配个 AI"
            }
            color={!activeProvider ? "warning" : "default"}
            onClick={(e) => { if (!activeProvider) { onOpenSettings?.(); return; } setMenuAnchor(e.currentTarget); }}
            sx={{ height: 22, fontSize: 11, cursor: "pointer" }}
          />
          <Menu
            anchorEl={menuAnchor}
            open={!!menuAnchor}
            onClose={() => setMenuAnchor(null)}
          >
            {providers.length === 0 ? (
              <MenuItem onClick={() => { setMenuAnchor(null); onOpenSettings?.(); }} sx={{ color: "primary.main" }}>
                ⚙ 打开设置配一个 AI
              </MenuItem>
            ) : (
              <>{providers.map((p) => (
                <MenuItem
                  key={p.id}
                  selected={p.is_default}
                  onClick={async () => {
                    setMenuAnchor(null);
                    await api.setDefaultProvider(p.id);
                    setProviders(await api.listAiProviders());
                  }}
                >
                  {p.name}{" "}
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {p.protocol} · {p.model}
                  </Typography>
                </MenuItem>
              ))}
              <MenuItem key="_add" onClick={() => { setMenuAnchor(null); onOpenSettings?.(); }} sx={{ color: "primary.main", fontSize: 13 }}>
                + 管理 AI 配置
              </MenuItem></>)}
            </Menu>
          </Stack>
        <Tooltip title="清空对话">
          <IconButton size="small" onClick={reset} disabled={pending}>
            <RestartAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="搜索对话 (Ctrl+F)">
          <IconButton
            size="small"
            onClick={() => {
              setSearchOpen((v) => !v);
              if (!searchOpen) setSearch("");
            }}
          >
            <SearchIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {searchOpen && (
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          sx={{ px: pad, py: 0.5, borderBottom: 1, borderColor: "divider" }}
        >
          <TextField
            size="small"
            variant="standard"
            placeholder="搜索对话…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSearchIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") setSearchIdx((i) => i + 1);
              if (e.key === "Escape") {
                setSearchOpen(false);
                setSearch("");
              }
            }}
            autoFocus
            InputProps={{ disableUnderline: true, sx: { fontSize: 13 } }}
            fullWidth
          />
          <Typography variant="caption" color="text.secondary">
            {search ? `${boundedIndex + 1}/${filtered.length}` : ""}
          </Typography>
          <Tooltip title="上一个">
            <span>
              <IconButton
                size="small"
                disabled={!search || filtered.length === 0}
                onClick={() => setSearchIdx((i) => Math.max(0, i - 1))}
              >
                <ArrowUpwardIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="下一个">
            <span>
              <IconButton
                size="small"
                disabled={!search || filtered.length === 0}
                onClick={() => setSearchIdx((i) => i + 1)}
              >
                <ArrowDownwardIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      )}

      <Box ref={scrollRef} sx={{ flex: 1, overflowY: "auto", px: pad, py: 1.5 }}>
        {/* Clickable quick-start chips — always visible */}
        {visible.length <= 1 && (
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.8, display: "block" }}>
              {contextHint ? "试试点击：" : "👋 你好！试试点击或自己输入："}
            </Typography>
            <Stack direction="row" spacing={0.6} sx={{ flexWrap: "wrap", gap: 0.6 }}>
              {(contextHint ? [
                "按 units 降序排",
                "只看 East 区域",
                "画个柱状图",
                "做个看板",
                "写个总结报告",
              ] : [
                "帮我建一张表",
                "导入 CSV",
                "建个学生表填8行",
                "画图",
                "连 GitHub",
              ]).map((label) => (
                <Chip
                  key={label}
                  size="small"
                  label={label}
                  variant="outlined"
                  onClick={() => { setInput(label); }}
                  sx={{ height: 26, fontSize: 12, cursor: "pointer", "&:hover": { borderColor: "primary.main", bgcolor: (t: any) => t.palette.mode === "dark" ? "rgba(59,130,246,0.12)" : "rgba(59,130,246,0.08)" } }}
                />
              ))}
            </Stack>
          </Box>
        )}

        {(search ? filtered : visible).map((m, i) => {
          const idx = visible.indexOf(m);
          const highlight = !!search && i === boundedIndex;
          return (
            <MessageBubble key={idx} msg={m} compact={compact} highlight={highlight} />
          );
        })}

        {pending && (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
            <CircularProgress size={14} />
            <Typography variant="body2" color="text.secondary">
              思考中…
            </Typography>
          </Stack>
        )}
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mx: pad, mb: 1 }}>
          {error}
        </Alert>
      )}

      {activeProvider && typeof health === "string" && health !== "ok" && health !== "silent" && (
        <Alert
          severity="error"
          variant="outlined"
          sx={{ mx: pad, mb: 1, fontSize: 12.5, py: 0.4 }}
          action={
            <Box
              component="button"
              onClick={() => onOpenSettings?.()}
              sx={{
                border: 0,
                bgcolor: "transparent",
                color: "inherit",
                fontFamily: "inherit",
                fontSize: 12.5,
                fontWeight: 600,
                px: 1,
                py: 0.2,
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              去配置
            </Box>
          }
        >
          连接 <strong>{activeProvider.name}</strong> 失败：
          {health.length > 80 ? health.slice(0, 80) + "…" : health}
        </Alert>
      )}

      <Box sx={{ p: 1.5, borderTop: 1, borderColor: "divider" }}>
        <Paper
          variant="outlined"
          sx={{ display: "flex", alignItems: "flex-end", px: 1.5, py: 0.5 }}
        >
          <TextField
            variant="standard"
            placeholder={compact ? "对当前表说点什么…" : "问点什么…（Enter 发送，Shift+Enter 换行）"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            multiline
            maxRows={compact ? 4 : 6}
            fullWidth
            InputProps={{
              disableUnderline: true,
              sx: { fontSize: 13.5, py: 0.5 },
            }}
          />
          <IconButton
            color="primary"
            onClick={() => void send()}
            disabled={!input.trim() || pending}
            size="small"
          >
            <SendRoundedIcon fontSize="small" />
          </IconButton>
        </Paper>
      </Box>
    </Stack>
  );
}


function summarizeToolResult(parsed: unknown): { label: string; severity: "ok" | "err" } | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.error === "string") {
    return { label: `失败：${o.error}`, severity: "err" };
  }
  // create_table → { ok, table, columns }
  if (o.ok && typeof o.table === "string" && typeof o.columns === "number") {
    return { label: `已建表 ${o.table}（${o.columns} 列）`, severity: "ok" };
  }
  // insert_rows → { ok, inserted, table }
  if (o.ok && typeof o.inserted === "number" && typeof o.table === "string") {
    return { label: `已插入 ${o.inserted} 行到 ${o.table}`, severity: "ok" };
  }
  // set_view / save_view / switch_view / delete_view
  if (o.ok && typeof o.view === "string") {
    return { label: `已更新视图：${o.view}`, severity: "ok" };
  }
  if (o.ok === true && Object.keys(o).length <= 2) {
    return { label: "已完成", severity: "ok" };
  }
  // list_tables → array
  if (Array.isArray(parsed)) {
    const arr = parsed as unknown[];
    if (arr.length === 0) return { label: "（无）", severity: "ok" };
    // list_views from frontend tool
    if (
      arr.every(
        (x) =>
          typeof x === "object" &&
          x &&
          typeof (x as Record<string, unknown>).name === "string"
      )
    ) {
      const names = (arr as Array<{ name: string }>).map((x) => x.name).join(" · ");
      return { label: `视图：${names}`, severity: "ok" };
    }
  }
  return null;
}

function MessageBubble({ msg, compact, highlight }: { msg: ChatMessage; compact: boolean; highlight?: boolean }) {
  if (msg.role === "tool") {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(msg.content);
    } catch {
      parsed = msg.content;
    }
    const summary = isQueryResult(parsed) ? null : summarizeToolResult(parsed);
    return (
      <Box sx={{ mt: 1.2 }}>
        {isQueryResult(parsed) ? (
          <>
            <Typography variant="caption" color="text.secondary">
              查询结果 · {parsed.row_count} 行
            </Typography>
            <Paper
              variant="outlined"
              sx={{
                mt: 0.4,
                p: 1.2,
                bgcolor: (t) =>
                  t.palette.mode === "dark"
                    ? "rgba(255,255,255,0.02)"
                    : "rgba(0,0,0,0.02)",
              }}
            >
              <ResultTable result={parsed} />
            </Paper>
          </>
        ) : summary ? (
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.8}
            sx={{
              px: 1.2,
              py: 0.6,
              borderRadius: 1.5,
              border: 1,
              borderColor:
                summary.severity === "ok" ? "success.main" : "error.main",
              color: summary.severity === "ok" ? "success.main" : "error.main",
              bgcolor: (t) =>
                summary.severity === "ok"
                  ? t.palette.mode === "dark"
                    ? "rgba(16,185,129,0.08)"
                    : "rgba(16,185,129,0.06)"
                  : t.palette.mode === "dark"
                    ? "rgba(239,68,68,0.10)"
                    : "rgba(239,68,68,0.07)",
              fontSize: 12.5,
            }}
          >
            <Box sx={{ fontWeight: 600 }}>
              {summary.severity === "ok" ? "✓" : "✗"}
            </Box>
            <Box sx={{ flex: 1 }}>{summary.label}</Box>
          </Stack>
        ) : (
          <>
            <Typography variant="caption" color="text.secondary">
              工具结果
            </Typography>
            <Paper
              variant="outlined"
              sx={{
                mt: 0.4,
                p: 1.2,
                bgcolor: (t) =>
                  t.palette.mode === "dark"
                    ? "rgba(255,255,255,0.02)"
                    : "rgba(0,0,0,0.02)",
              }}
            >
              <Box
                component="pre"
                sx={{
                  m: 0,
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 11.5,
                  maxHeight: 160,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {typeof parsed === "string"
                  ? parsed
                  : JSON.stringify(parsed, null, 2)}
              </Box>
            </Paper>
          </>
        )}
      </Box>
    );
  }

  const isUser = msg.role === "user";
  return (
    <Stack
      direction="row"
      justifyContent={isUser ? "flex-end" : "flex-start"}
      sx={{ mt: 1.2 }}
    >
      <Paper
        variant={isUser ? "elevation" : "outlined"}
        elevation={0}
        sx={{
          maxWidth: compact ? "92%" : "78%",
          ...(highlight
            ? { borderColor: "primary.main" as const, borderWidth: 2 as const }
            : {}),
          px: 1.5,
          py: 1,
          bgcolor: isUser ? "primary.main" : "background.paper",
          color: isUser ? "primary.contrastText" : "text.primary",
          borderRadius: 2,
          whiteSpace: "pre-wrap",
          fontSize: 13.5,
          lineHeight: 1.5,
        }}
      >
        {msg.content ||
          (msg.tool_calls?.length
            ? `调用工具：${msg.tool_calls.map((c) => c.name).join(", ")}`
            : "")}
        {msg.tool_calls && msg.tool_calls.length > 0 && (
          <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: "wrap" }}>
            {msg.tool_calls.map((c) => (
              <Chip
                key={c.id}
                size="small"
                label={c.name}
                sx={{
                  height: 18,
                  fontSize: 10.5,
                  bgcolor: "background.default",
                }}
              />
            ))}
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}
