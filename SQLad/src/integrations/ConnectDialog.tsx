import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { api } from "../api/client";
import { useUi } from "../store";
import type { ServiceCatalogEntry } from "./catalog";

type Tab = "paste" | "ai" | "raw";

export function ConnectDialog({
  service,
  open,
  onClose,
  onDone,
}: {
  service: ServiceCatalogEntry | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const setView = useUi((s) => s.setView);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [tab, setTab] = useState<Tab>("paste");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [scheme, setScheme] = useState<string>("bearer");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) {
      setTab("paste");
      setToken("");
      setShowToken(false);
      setErr(null);
      setDone(false);
    }
    if (open && service) setScheme(service.scheme);
  }, [open, service]);

  if (!service) return null;

  async function openTokenPage() {
    if (!service) return;
    try {
      await invoke("invoke_tool", {
        cmd: { name: "open_url", arguments: { url: service.tokenUrl } },
      });
    } catch {
      window.open(service.tokenUrl, "_blank");
    }
  }

  async function save() {
    if (!service) return;
    if (!token.trim()) {
      setErr("请粘贴 token");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.saveCredential(
        service.id,
        token.trim(),
        service.defaultHint,
        scheme
      );
      setDone(true);
      onDone();
      // Hold the success state for a beat so the user sees the ✓.
      setTimeout(() => onClose(), 900);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function askAi() {
    // Open chat with the service-specific seed prompt copied; the user just
    // hits Enter. We can't auto-send (would require touching ChatPanel
    // internals), so the practical move is to push the seed into the chat
    // history's draft via localStorage signal — simplest: just direct user.
    setView("chat");
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pr: 6 }}>
        <Stack direction="row" alignItems="center" spacing={1.2}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              display: "grid",
              placeItems: "center",
              bgcolor: service.color,
              color: "#fff",
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            {service.icon}
          </Box>
          <Stack sx={{ minWidth: 0 }}>
            <Typography fontWeight={600}>连接到 {service.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {service.blurb}
            </Typography>
          </Stack>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {done ? (
          <Stack alignItems="center" spacing={1} sx={{ py: 4 }}>
            <CheckCircleOutlineIcon
              color="success"
              sx={{ fontSize: 48 }}
            />
            <Typography fontWeight={600}>已连接</Typography>
            <Typography variant="body2" color="text.secondary">
              AI 现在可以用 credential='{service.id}' 调 {service.name} 的接口了
            </Typography>
          </Stack>
        ) : (
          <>
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v as Tab)}
              variant="fullWidth"
              sx={{ mb: 1.5 }}
            >
              <Tab value="paste" label="① 我去拿一个 token" />
              <Tab value="ai" label="② 让 AI 帮我" />
              <Tab value="raw" label="③ 我已经有 token" />
            </Tabs>

            {tab === "paste" && (
              <Stack spacing={2}>
                <Button
                  variant="contained"
                  startIcon={<OpenInNewIcon />}
                  onClick={() => void openTokenPage()}
                >
                  打开 {service.name} Token 页面
                </Button>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 1,
                    bgcolor: isDark
                      ? "rgba(255,255,255,0.03)"
                      : "rgba(0,0,0,0.03)",
                    border: 1,
                    borderColor: "divider",
                    fontSize: 13,
                    lineHeight: 1.8,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {service.howTo}
                </Box>
                <TextField
                  size="small"
                  label="把 token 粘到这"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  type={showToken ? "text" : "password"}
                  fullWidth
                  InputProps={{
                    endAdornment: (
                      <IconButton
                        size="small"
                        onClick={() => setShowToken((v) => !v)}
                      >
                        {showToken ? (
                          <VisibilityOffIcon fontSize="small" />
                        ) : (
                          <VisibilityIcon fontSize="small" />
                        )}
                      </IconButton>
                    ),
                  }}
                />
              </Stack>
            )}

            {tab === "ai" && (
              <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary">
                  打开 AI 对话，让助手一步步带你拿 token、保存、验证连接。它会用
                  open_url 自动打开浏览器，并在拿到 token 后帮你存进凭证库。
                </Typography>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 1,
                    bgcolor: isDark
                      ? "rgba(59,130,246,0.06)"
                      : "rgba(59,130,246,0.04)",
                    border: 1,
                    borderColor: "primary.main",
                    fontSize: 13,
                    fontStyle: "italic",
                  }}
                >
                  AI 会这样开始：「{service.aiSeed.slice(0, 90)}…」
                </Box>
                <Button
                  variant="contained"
                  startIcon={<ChatBubbleOutlineIcon />}
                  onClick={askAi}
                >
                  打开 AI 对话
                </Button>
                <Alert severity="info" sx={{ fontSize: 12.5 }}>
                  AI 走 OAuth Device Flow 需要服务支持，且通常要求注册一个 OAuth
                  App（要 client_id）。如果服务不支持或太麻烦，回到「①」用 token 方式更稳。
                </Alert>
              </Stack>
            )}

            {tab === "raw" && (
              <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary">
                  已经有 token 了？直接粘进来即可。
                </Typography>
                <TextField
                  size="small"
                  label="Token / API Key"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  type={showToken ? "text" : "password"}
                  fullWidth
                  InputProps={{
                    endAdornment: (
                      <IconButton
                        size="small"
                        onClick={() => setShowToken((v) => !v)}
                      >
                        {showToken ? (
                          <VisibilityOffIcon fontSize="small" />
                        ) : (
                          <VisibilityIcon fontSize="small" />
                        )}
                      </IconButton>
                    ),
                  }}
                />
                <TextField
                  select
                  size="small"
                  label="注入方式（一般不用改）"
                  value={scheme}
                  onChange={(e) => setScheme(e.target.value)}
                >
                  <MenuItem value="bearer">Bearer Token</MenuItem>
                  <MenuItem value="header:X-API-Key">X-API-Key 头</MenuItem>
                  <MenuItem value="header:x-api-key">x-api-key 头（Anthropic）</MenuItem>
                  <MenuItem value="query:api_key">URL 查询串 ?api_key=</MenuItem>
                </TextField>
              </Stack>
            )}
            {err && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {err}
              </Alert>
            )}
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                可以让 AI 帮我做这些：
              </Typography>
              <Stack
                direction="row"
                spacing={0.6}
                sx={{ mt: 0.5, flexWrap: "wrap", gap: 0.6 }}
              >
                {service.capabilities.map((c) => (
                  <Chip
                    key={c}
                    size="small"
                    label={c}
                    sx={{ height: 22, fontSize: 11.5 }}
                  />
                ))}
              </Stack>
              {service.aiHints && service.aiHints.length > 0 && (
                <Box sx={{ mt: 1.4 }}>
                  <Typography variant="caption" color="text.secondary">
                    一键 prompt（点 chip 复制到 AI 对话）：
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={0.6}
                    sx={{ mt: 0.5, flexWrap: "wrap", gap: 0.6 }}
                  >
                    {service.aiHints.map((h, i) => (
                      <Chip
                        key={i}
                        size="small"
                        color="primary"
                        variant="outlined"
                        label={h.label}
                        onClick={() => {
                          try {
                            navigator.clipboard.writeText(h.prompt);
                          } catch {
                            /* ignore */
                          }
                        }}
                        sx={{ height: 22, fontSize: 11.5, cursor: "pointer" }}
                      />
                    ))}
                  </Stack>
                </Box>
              )}
            </Box>
          </>
        )}
      </DialogContent>
      {!done && (
        <DialogActions>
          <Button onClick={onClose}>取消</Button>
          {(tab === "paste" || tab === "raw") && (
            <Button
              variant="contained"
              onClick={() => void save()}
              disabled={busy || !token.trim()}
            >
              保存连接
            </Button>
          )}
        </DialogActions>
      )}
    </Dialog>
  );
}
