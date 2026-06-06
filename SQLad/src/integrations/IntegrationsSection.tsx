import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import KeyIcon from "@mui/icons-material/Key";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { CredentialInfo } from "../api/types";
import {
  CATEGORY_LABEL,
  type ServiceCatalogEntry,
  type ServiceCategory,
} from "./catalog";
import { ConnectDialog } from "./ConnectDialog";
import { useCatalog } from "./useCatalog";

const CATEGORY_ORDER: ServiceCategory[] = [
  "messaging",
  "ai",
  "dev",
  "productivity",
  "data",
  "other",
];

export function IntegrationsSection() {
  const { catalog, modCount, reload: reloadMods } = useCatalog();
  const [credentials, setCredentials] = useState<CredentialInfo[]>([]);
  const [connect, setConnect] = useState<ServiceCatalogEntry | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [search, setSearch] = useState("");
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  async function refreshCreds() {
    setCredentials(await api.listCredentials());
  }
  useEffect(() => {
    void refreshCreds();
  }, []);

  async function disconnect(name: string) {
    if (!confirm(`断开「${name}」连接？AI 之后将无法用这个名字认证。`)) return;
    await api.deleteCredential(name);
    await refreshCreds();
  }

  const connectedIds = new Set(credentials.map((c) => c.name));
  const customCreds = credentials.filter(
    (c) => !catalog.some((s) => s.id === c.name)
  );

  // Search filter
  const searchLower = search.trim().toLowerCase();
  const filteredCatalog = useMemo(() => {
    if (!searchLower) return catalog;
    return catalog.filter(
      (s) =>
        s.name.toLowerCase().includes(searchLower) ||
        s.id.toLowerCase().includes(searchLower) ||
        s.blurb.toLowerCase().includes(searchLower) ||
        s.capabilities.some((c) => c.toLowerCase().includes(searchLower))
    );
  }, [catalog, searchLower]);

  // Group catalog by category in the canonical order.
  const byCategory = new Map<ServiceCategory, ServiceCatalogEntry[]>();
  for (const s of filteredCatalog) {
    const k = (s.category ?? "other") as ServiceCategory;
    if (!byCategory.has(k)) byCategory.set(k, []);
    byCategory.get(k)!.push(s);
  }

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 0 }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2, py: 1.4 }}
        >
          <Box>
            <Typography variant="overline" color="text.secondary">
              <KeyIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: "middle" }} />
              连接 / Integrations
              {modCount > 0 && (
                <Chip
                  size="small"
                  label={`含 ${modCount} 个 mod`}
                  sx={{ ml: 1, height: 18, fontSize: 11 }}
                />
              )}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              点一张卡接入服务。AI 之后能直接帮你发消息 / 查 / 写这些服务的数据。
            </Typography>
          </Box>
          <Button
            startIcon={<AddIcon />}
            size="small"
            variant="outlined"
            onClick={() => setManualOpen(true)}
          >
            自定义
          </Button>
        </Stack>
        <Box sx={{ px: 2, pb: 1 }}>
          <TextField
            size="small"
            placeholder="搜索服务…（通讯 / GitHub / AI / Notion …）"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>

        {search && filteredCatalog.length === 0 && (
          <Box sx={{ px: 2, py: 2, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              没找到匹配「{search}」的服务。试试别的关键词？
            </Typography>
          </Box>
        )}

        {CATEGORY_ORDER.map((cat) => {
          const items = byCategory.get(cat) ?? [];
          if (items.length === 0) return null;
          return (
            <Box key={cat}>
              <Box
                sx={{
                  px: 2,
                  py: 0.6,
                  borderTop: 1,
                  borderColor: "divider",
                  bgcolor: isDark
                    ? "rgba(255,255,255,0.02)"
                    : "rgba(0,0,0,0.02)",
                }}
              >
                <Typography variant="overline" color="text.secondary">
                  {CATEGORY_LABEL[cat]}（{items.length}）
                </Typography>
              </Box>
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: 1.2,
                }}
              >
                {items.map((s) => {
                  const connected = connectedIds.has(s.id);
                  return (
                    <Paper
                      key={s.id}
                      variant="outlined"
                      onClick={() => setConnect(s)}
                      sx={{
                        p: 1.3,
                        cursor: "pointer",
                        transition: "transform .15s, border-color .15s",
                        borderColor: connected ? "success.main" : "divider",
                        "&:hover": {
                          transform: "translateY(-1px)",
                          borderColor: "primary.main",
                        },
                        position: "relative",
                      }}
                    >
                      <Stack direction="row" spacing={1.2} alignItems="center">
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: 1.2,
                            display: "grid",
                            placeItems: "center",
                            bgcolor: s.color,
                            color: "#fff",
                            fontWeight: 700,
                            fontSize: 13,
                            flexShrink: 0,
                          }}
                        >
                          {s.icon}
                        </Box>
                        <Stack sx={{ minWidth: 0, flex: 1 }}>
                          <Stack
                            direction="row"
                            spacing={0.5}
                            alignItems="center"
                            sx={{ minWidth: 0 }}
                          >
                            <Typography
                              fontWeight={600}
                              noWrap
                              sx={{ fontSize: 13.5 }}
                            >
                              {s.name}
                            </Typography>
                            {connected && (
                              <CheckCircleIcon
                                sx={{ fontSize: 13, color: "success.main" }}
                              />
                            )}
                            {s.source === "mod" && (
                              <Tooltip title={s.modPath}>
                                <ExtensionOutlinedIcon
                                  sx={{
                                    fontSize: 12,
                                    color: "primary.main",
                                  }}
                                />
                              </Tooltip>
                            )}
                          </Stack>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            noWrap
                          >
                            {s.blurb}
                          </Typography>
                        </Stack>
                        {connected && (
                          <Tooltip title="断开连接">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                void disconnect(s.id);
                              }}
                            >
                              <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </Paper>
                  );
                })}
              </Box>
            </Box>
          );
        })}

        {customCreds.length > 0 && (
          <>
            <Box
              sx={{
                borderTop: 1,
                borderColor: "divider",
                bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                px: 2,
                py: 0.6,
              }}
            >
              <Typography variant="overline" color="text.secondary">
                自定义凭证（不属于已知服务）
              </Typography>
            </Box>
            <Box sx={{ px: 2, pb: 2, pt: 1 }}>
              <Stack spacing={1}>
                {customCreds.map((c) => (
                  <Stack
                    key={c.name}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{
                      p: 1,
                      border: 1,
                      borderColor: "divider",
                      borderRadius: 1,
                    }}
                  >
                    <KeyIcon sx={{ fontSize: 16, color: "primary.main" }} />
                    <Typography fontWeight={500} sx={{ fontSize: 13 }}>
                      {c.name}
                    </Typography>
                    <Chip
                      size="small"
                      label={c.scheme}
                      sx={{ height: 18, fontSize: 11 }}
                    />
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ flex: 1, minWidth: 0 }}
                      noWrap
                    >
                      {c.hint || "—"}
                    </Typography>
                    <Tooltip title="断开">
                      <IconButton
                        size="small"
                        onClick={() => void disconnect(c.name)}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </>
        )}
      </Paper>

      <ModsPanel onReload={() => void reloadMods()} modCount={modCount} />

      <ConnectDialog
        service={connect}
        open={!!connect}
        onClose={() => setConnect(null)}
        onDone={() => void refreshCreds()}
      />

      <ConnectDialog
        service={
          manualOpen
            ? ({
                id: "custom",
                name: "自定义",
                blurb: "任意 API 的 token / api key",
                icon: "?",
                color: "#6366f1",
                tokenUrl: "https://example.com",
                scheme: "bearer",
                category: "other",
                capabilities: ["调任意 HTTP API"],
                howTo:
                  "1. 起一个名字（如 'my-service'）\n2. 粘贴你已经有的 token\n3. 选注入方式（一般 Bearer）\n4. 保存",
                aiSeed:
                  "我已加了自定义凭证，可以用 fetch_url credential='<名字>' 调对应 API",
                defaultHint: "自定义凭证",
              } as ServiceCatalogEntry)
            : null
        }
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onDone={() => void refreshCreds()}
      />
    </Stack>
  );
}

function ModsPanel({
  onReload,
  modCount,
}: {
  onReload: () => void;
  modCount: number;
}) {
  const [dir, setDir] = useState("");
  const [installUrl, setInstallUrl] = useState("");
  const [installing, setInstalling] = useState(false);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  useEffect(() => {
    void api.modsDir().then(setDir);
  }, []);

  async function installFromUrl() {
    const url = installUrl.trim();
    if (!url || !dir) return;
    setInstalling(true);
    try {
      const fileName = await api.fetchAndSaveMod(url, dir);
      setInstallUrl("");
      await onReload();
      alert(`已安装：${fileName}`);
    } catch (e) {
      alert(
        `安装失败：${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setInstalling(false);
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1 }}
      >
        <Stack>
          <Typography variant="overline" color="text.secondary">
            <ExtensionOutlinedIcon
              sx={{ fontSize: 14, mr: 0.5, verticalAlign: "middle" }}
            />
            服务 Mods · 已加载 {modCount}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            把 <code>.json</code> 文件丢进下面目录，或贴一个 URL 一键安装。
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Tooltip title="重新加载">
            <IconButton size="small" onClick={onReload}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            size="small"
            variant="outlined"
            startIcon={<FolderOpenIcon />}
            onClick={async () => {
              if (dir) {
                try { await api.openPath(dir); } catch { /* ignore */ }
              }
            }}
            disabled={!dir}
          >
            打开目录
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <TextField
          size="small"
          placeholder="贴一个 mod JSON 的 URL，回车安装…"
          value={installUrl}
          onChange={(e) => setInstallUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void installFromUrl();
          }}
          fullWidth
          disabled={installing}
          slotProps={{
            input: {
              sx: { fontFamily: "ui-monospace, monospace", fontSize: 12.5 },
            },
          }}
        />
        <Button
          size="small"
          variant="contained"
          onClick={() => void installFromUrl()}
          disabled={!installUrl.trim() || installing}
        >
          {installing ? "…" : "安装"}
        </Button>
      </Stack>

      <Divider sx={{ mb: 1 }} />
      <Box
        sx={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12,
          color: "text.secondary",
          p: 1.2,
          borderRadius: 1,
          bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
          wordBreak: "break-all",
        }}
      >
        {dir || "（加载中…）"}
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 1 }}
      >
        最小 mod 例子（保存为 <code>my-service.json</code> 放进上面目录）：
      </Typography>
      <Box
        component="pre"
        sx={{
          fontFamily: "ui-monospace, monospace",
          fontSize: 11.5,
          p: 1.2,
          mt: 0.5,
          mb: 0,
          borderRadius: 1,
          border: 1,
          borderColor: "divider",
          overflowX: "auto",
        }}
      >
        {`{
  "id": "linear",
  "name": "Linear",
  "blurb": "issue tracker",
  "icon": "LN",
  "color": "#5e6ad2",
  "category": "dev",
  "tokenUrl": "https://linear.app/settings/api",
  "scheme": "header:Authorization",
  "capabilities": ["拉 issue", "建 issue"],
  "howTo": "1. 在 Linear 设置里建一个 PAT\\n2. 粘贴",
  "aiSeed": "我刚连上 Linear，先 query 一下 viewer。",
  "defaultHint": "Linear PAT",
  "aiHints": [
    { "label": "拉我的 issues",
      "prompt": "fetch_url credential='linear' POST https://api.linear.app/graphql, body={query:'{ viewer { assignedIssues { nodes { id title state{name} } } } }'}" }
  ]
}`}
      </Box>
    </Paper>
  );
}
