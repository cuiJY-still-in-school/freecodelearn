import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemSecondaryAction,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import KeyIcon from "@mui/icons-material/Key";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import HubIcon from "@mui/icons-material/Hub";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type {
  CredentialInfo,
  ProviderConfig,
  ProviderInfo,
  ProviderProtocol,
  WebhookStatus,
} from "../api/types";
import { useSettings } from "../store";

const PROTOCOLS: { value: ProviderProtocol; label: string; baseHint: string }[] = [
  { value: "openai", label: "OpenAI / 兼容", baseHint: "https://api.openai.com" },
  { value: "anthropic", label: "Anthropic", baseHint: "https://api.anthropic.com" },
  { value: "ollama", label: "Ollama 本地", baseHint: "http://127.0.0.1:11434" },
];

const blank: ProviderConfig = {
  id: "", name: "", protocol: "openai", base_url: "", api_key: "", model: "",
};

export function SettingsPage() {
  const reload = useSettings((s) => s.loadSettings);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [dataDir, setDataDir] = useState("");
  const [whStatus, setWhStatus] = useState<WebhookStatus | null>(null);
  const [editing, setEditing] = useState<ProviderConfig | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<CredentialInfo[]>([]);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  async function refresh() {
    const list = await api.listAiProviders();
    setProviders(list);
    try { setWhStatus(await api.webhookStatus()); } catch { /* ignore */ }
    try { setCreds(await api.listCredentials()); } catch { /* ignore */ }
    await reload();
  }

  useEffect(() => { void refresh(); void api.dataDir().then(setDataDir); }, []);

  async function removeCred(name: string) {
    if (!confirm(`断开「${name}」？`)) return;
    await api.deleteCredential(name);
    await refresh();
  }

  return (
    <Stack sx={{ height: "100%", overflow: "auto", p: 3 }} spacing={2.5}>
      <Typography variant="h6">设置</Typography>

      {/* AI 大脑 */}
      <Paper variant="outlined" sx={{ p: 0 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.4 }}>
          <Box>
            <Typography variant="overline" color="text.secondary">AI 大脑</Typography>
            <Typography variant="body2" color="text.secondary">配好 AI，它就能帮你做所有事。</Typography>
          </Box>
          <Button startIcon={<AddIcon />} onClick={() => { setEditing({ ...blank, id: `p-${Date.now().toString(36)}` }); setEditingIsNew(true); }} variant="contained" size="small">添加</Button>
        </Stack>
        <Divider />
        <List dense>
          {providers.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 2 }}>还没配 AI。点右上「添加」。</Typography>
          )}
          {providers.map((p) => (
            <ListItemButton key={p.id} onClick={async () => { await api.setDefaultProvider(p.id); await refresh(); }} sx={{ pr: 16 }}>
              <Box sx={{ mr: 1.5, color: p.is_default ? "primary.main" : "text.disabled" }}>
                {p.is_default ? <CheckCircleIcon fontSize="small" /> : <RadioButtonUncheckedIcon fontSize="small" />}
              </Box>
              <ListItemText
                primary={<Typography fontWeight={500}>{p.name}</Typography>}
                secondary={`${p.protocol} · ${p.model || "—"}`}
              />
              <ListItemSecondaryAction>
                <Tooltip title="编辑"><IconButton size="small" onClick={async () => { const s = await api.getSettings(); const f = s.providers.find(x => x.id === p.id); if (f) { setEditing(f); setEditingIsNew(false); } }}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="删除"><IconButton size="small" onClick={() => { if (confirm(`删除 "${p.name}"？`)) { void api.deleteProvider(p.id).then(refresh); } }}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
              </ListItemSecondaryAction>
            </ListItemButton>
          ))}
        </List>
      </Paper>

      <ProviderDialog open={!!editing} value={editing} isNew={editingIsNew} error={error} onChange={setEditing} onClose={() => { setEditing(null); setError(null); }} onSave={async () => { if (!editing) return; try { await api.upsertProvider(editing); setEditing(null); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }} />

      {/* 已连接的账号 */}
      {creds.length > 0 && (
        <Paper variant="outlined" sx={{ p: 0 }}>
          <Box sx={{ px: 2, py: 1.4 }}>
            <Typography variant="overline" color="text.secondary"><KeyIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: "middle" }} />已连接 {creds.length} 个服务</Typography>
            <Typography variant="body2" color="text.secondary">AI 能用这些名字调外部 API。去 AI 对话页让它帮你连更多。</Typography>
          </Box>
          <Divider />
          <List dense>
            {creds.map((c) => (
              <ListItemButton key={c.name} disableRipple sx={{ pr: 12 }}>
                <KeyIcon sx={{ fontSize: 16, mr: 1.2, color: "primary.main" }} />
                <ListItemText primary={c.name} secondary={c.hint || c.scheme} />
                <ListItemSecondaryAction>
                  <IconButton size="small" onClick={() => void removeCred(c.name)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </ListItemSecondaryAction>
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}

      {/* Webhook 地址 */}
      {whStatus && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <HubIcon sx={{ fontSize: 18, color: "success.main" }} />
            <Typography variant="overline" color="text.secondary">接收外部数据</Typography>
          </Stack>
          <Box sx={{ fontFamily: "ui-monospace, monospace", fontSize: 13, mt: 0.5, bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", px: 1.5, py: 0.6, borderRadius: 1, userSelect: "all" }}>
            curl -X POST {whStatus.url}/table_name -d {'{\"key\":\"value\"}'}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
            POST JSON 到 /table/:name 自动存数据。@你的开发者把 webhook URL 填到 Slack / Zapier / GitHub 里即可。
          </Typography>
        </Paper>
      )}

      {/* 数据目录 */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="overline" color="text.secondary">数据目录</Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
          <Box sx={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, flex: 1, wordBreak: "break-all" }}>{dataDir || "—"}</Box>
          <IconButton size="small" onClick={() => { navigator.clipboard?.writeText(dataDir).catch(() => {}); }}><ContentCopyIcon fontSize="small" /></IconButton>
        </Stack>
      </Paper>
    </Stack>
  );
}

function ProviderDialog({ open, value, isNew, error, onChange, onClose, onSave }: {
  open: boolean; value: ProviderConfig | null; isNew: boolean; error: string | null;
  onChange: (c: ProviderConfig) => void; onClose: () => void; onSave: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  useEffect(() => { if (!open) setTestResult(null); }, [open]);
  if (!value) return null;
  const meta = PROTOCOLS.find(p => p.value === value.protocol);
  const canTest = !!value.base_url && !!value.model && (value.protocol === "ollama" || !!value.api_key);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isNew ? "添加 AI" : "编辑 AI"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField size="small" label="名字" value={value.name} onChange={e => onChange({ ...value, name: e.target.value })} autoFocus />
          <TextField size="small" label="协议" select value={value.protocol} onChange={e => onChange({ ...value, protocol: e.target.value as ProviderProtocol })} helperText={meta?.baseHint}>
            {PROTOCOLS.map(p => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
          </TextField>
          <TextField size="small" label="地址" value={value.base_url} onChange={e => onChange({ ...value, base_url: e.target.value })} placeholder={meta?.baseHint} />
          <TextField size="small" label="API Key" type="password" value={value.api_key} onChange={e => onChange({ ...value, api_key: e.target.value })} helperText={value.protocol === "ollama" ? "Ollama 一般不需要" : ""} />
          <TextField size="small" label="模型" value={value.model} onChange={e => onChange({ ...value, model: e.target.value })} placeholder={value.protocol === "ollama" ? "llama3.2" : value.protocol === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o-mini"} />
          {testResult && <Alert severity={testResult.ok ? "success" : "error"}>{testResult.msg}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between", px: 3, pb: 2 }}>
        <Button onClick={async () => { if (!value) return; setTesting(true); setTestResult(null); try { const r = await api.testProvider(value); setTestResult({ ok: true, msg: r ? `✓ ${r.slice(0, 80)}` : "✓ 通了" }); } catch (e) { setTestResult({ ok: false, msg: e instanceof Error ? e.message : String(e) }); } finally { setTesting(false); } }} disabled={!canTest || testing} startIcon={testing ? <CircularProgress size={14} /> : <PlayCircleOutlineIcon />}>{testing ? "检测中…" : "测试连接"}</Button>
        <Stack direction="row" spacing={1}><Button onClick={onClose}>取消</Button><Button variant="contained" onClick={onSave}>保存</Button></Stack>
      </DialogActions>
    </Dialog>
  );
}
