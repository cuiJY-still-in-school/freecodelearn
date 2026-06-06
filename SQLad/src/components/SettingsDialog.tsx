import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemSecondaryAction,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import KeyIcon from "@mui/icons-material/Key";
import CloseIcon from "@mui/icons-material/Close";
import HubIcon from "@mui/icons-material/Hub";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { CredentialInfo, ProviderConfig, ProviderInfo, ProviderProtocol, WebhookStatus } from "../api/types";
import { useSettings } from "../store";

const PROTOCOLS: { value: ProviderProtocol; label: string; baseHint: string }[] = [
  { value: "openai", label: "OpenAI / 兼容", baseHint: "https://api.openai.com" },
  { value: "anthropic", label: "Anthropic", baseHint: "https://api.anthropic.com" },
  { value: "ollama", label: "Ollama 本地", baseHint: "http://127.0.0.1:11434" },
];

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reload = useSettings((s) => s.loadSettings);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [dataDir, setDataDir] = useState("");
  const [whStatus, setWhStatus] = useState<WebhookStatus | null>(null);
  const [editing, setEditing] = useState<ProviderConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<CredentialInfo[]>([]);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  async function refresh() {
    setProviders(await api.listAiProviders());
    try { setWhStatus(await api.webhookStatus()); } catch { /* */ }
    try { setCreds(await api.listCredentials()); } catch { /* */ }
    await reload();
  }
  useEffect(() => { if (open) { void refresh(); void api.dataDir().then(setDataDir); } }, [open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pr: 6 }}>
        设置
        <IconButton onClick={onClose} size="small" sx={{ position: "absolute", right: 12, top: 14 }}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {/* AI 大脑 */}
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
              <Typography variant="overline" color="text.secondary">AI 大脑</Typography>
              <Button startIcon={<AddIcon />} size="small" onClick={() => setEditing({ id: `p-${Date.now().toString(36)}`, name: "", protocol: "openai", base_url: "", api_key: "", model: "" })}>添加</Button>
            </Stack>
            <List dense sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}>
              {providers.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>还没配 AI。点「添加」。</Typography>}
              {providers.map(p => (
                <ListItemButton key={p.id} onClick={async () => { await api.setDefaultProvider(p.id); await refresh(); }} sx={{ pr: 16 }}>
                  <Box sx={{ mr: 1, color: p.is_default ? "primary.main" : "text.disabled" }}>{p.is_default ? <CheckCircleIcon fontSize="small" /> : <RadioButtonUncheckedIcon fontSize="small" />}</Box>
                  <ListItemText primary={p.name} secondary={`${p.protocol} · ${p.model || "—"}`} />
                  <ListItemSecondaryAction>
                    <IconButton size="small" onClick={async () => { const s = await api.getSettings(); const f = s.providers.find(x => x.id === p.id); if (f) setEditing(f); }}><EditOutlinedIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => { if (confirm(`删除？`)) { void api.deleteProvider(p.id).then(refresh); } }}><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </ListItemSecondaryAction>
                </ListItemButton>
              ))}
            </List>
          </Box>

          {/* 已连接 */}
          {creds.length > 0 && <Box>
            <Typography variant="overline" color="text.secondary"><KeyIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: "middle" }} />已连接 ({creds.length})</Typography>
            <List dense sx={{ border: 1, borderColor: "divider", borderRadius: 1, mt: 0.5 }}>
              {creds.map(c => (
                <ListItemButton key={c.name} disableRipple sx={{ pr: 12 }}>
                  <KeyIcon sx={{ fontSize: 16, mr: 1, color: "primary.main" }} />
                  <ListItemText primary={c.name} secondary={c.hint || c.scheme} />
                  <ListItemSecondaryAction>
                    <IconButton size="small" onClick={async () => { if (confirm(`断开？`)) { await api.deleteCredential(c.name); await refresh(); } }}><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </ListItemSecondaryAction>
                </ListItemButton>
              ))}
            </List>
          </Box>}

          {/* Webhook */}
          {whStatus && <Box>
            <Typography variant="overline" color="text.secondary"><HubIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: "middle" }} />接收外部数据</Typography>
            <Box sx={{ fontFamily: "ui-monospace, monospace", fontSize: 12, mt: 0.5, bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", px: 1.5, py: 0.6, borderRadius: 1, userSelect: "all", position: "relative" }}>
              curl -X POST {whStatus.url}/table_name -d {'{"key":"value"}'}
              <IconButton size="small" sx={{ position: "absolute", right: 2, top: 2 }} onClick={() => navigator.clipboard?.writeText(`curl -X POST ${whStatus.url}/YOUR_TABLE -d '{"key":"value"}'`).catch(() => {})}><ContentCopyIcon sx={{ fontSize: 14 }} /></IconButton>
            </Box>
          </Box>}

          {/* 数据目录 */}
          <Box>
            <Typography variant="overline" color="text.secondary">数据目录</Typography>
            <Box sx={{ fontFamily: "ui-monospace, monospace", fontSize: 12, mt: 0.5, wordBreak: "break-all" }}>{dataDir || "—"}</Box>
          </Box>
        </Stack>
      </DialogContent>

      {/* Provider edit dialog nested */}
      {editing && (
        <Dialog open={!!editing} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
          <DialogTitle>{editing.id ? "编辑 AI" : "添加 AI"}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              <TextField size="small" label="名字" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} autoFocus />
              <TextField size="small" label="协议" select value={editing.protocol} onChange={e => setEditing({ ...editing, protocol: e.target.value as ProviderProtocol })}>{PROTOCOLS.map(p => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}</TextField>
              <TextField size="small" label="地址" value={editing.base_url} onChange={e => setEditing({ ...editing, base_url: e.target.value })} />
              <TextField size="small" label="API Key" type="password" value={editing.api_key} onChange={e => setEditing({ ...editing, api_key: e.target.value })} />
              <TextField size="small" label="模型" value={editing.model} onChange={e => setEditing({ ...editing, model: e.target.value })} />
              {error && <Alert severity="error">{error}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditing(null)}>取消</Button>
            <Button variant="contained" onClick={async () => { if (!editing) return; try { await api.upsertProvider(editing); setEditing(null); await refresh(); } catch (e) { setError(String(e)); } }}>保存</Button>
          </DialogActions>
        </Dialog>
      )}
    </Dialog>
  );
}
