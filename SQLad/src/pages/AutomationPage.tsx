import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import AutoModeIcon from "@mui/icons-material/AutoMode";
import PreviewIcon from "@mui/icons-material/Visibility";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Trigger } from "../api/types";
import { runTriggerOnce } from "../hooks/useScheduler";
import { TEMPLATES, type AutomationTemplate } from "../automation/templates";

const STATUS_LABEL: Record<string, string> = {
  fired: "已触发",
  no_change: "无事发生",
  running: "运行中",
  error: "出错",
};

const STATUS_COLOR: Record<
  string,
  "default" | "primary" | "success" | "error" | "warning"
> = {
  fired: "primary",
  no_change: "default",
  running: "warning",
  error: "error",
};

function tsToString(ts?: number | null): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString();
}

function minutesLabel(secs: number): string {
  if (secs === 0) return "手动";
  if (secs < 60) return `${secs} 秒`;
  if (secs < 3600) return `${Math.round(secs / 60)} 分钟`;
  if (secs < 86400) return `${Math.round(secs / 3600)} 小时`;
  return `${Math.round(secs / 86400)} 天`;
}

export function AutomationPage() {
  const [list, setList] = useState<Trigger[]>([]);
  const [editing, setEditing] = useState<Trigger | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [picker, setPicker] = useState(false);
  const [templateFill, setTemplateFill] =
    useState<AutomationTemplate | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  async function refresh() {
    try {
      setList(await api.listTriggers());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function toggleEnabled(t: Trigger, on: boolean) {
    await api.saveTrigger({ ...t, enabled: on });
    await refresh();
  }

  async function runNow(t: Trigger) {
    setBusy((b) => ({ ...b, [t.id]: true }));
    try {
      await runTriggerOnce(t);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy((b) => ({ ...b, [t.id]: false }));
    }
  }

  async function preview(t: Trigger) {
    setBusy((b) => ({ ...b, [t.id]: true }));
    try {
      const r = await api.evaluateTrigger(t.id);
      alert(
        `条件预览：返回 ${r.row_count} 行\n列：${r.columns.join(", ")}\n` +
          r.rows.slice(0, 5).map((row) =>
            r.columns.map((c, j) => `${c}=${row[j]}`).join(", ")
          ).join("\n") +
          (r.row_count > 5 ? `\n… 还有 ${r.row_count - 5} 行` : "")
      );
      await refresh();
    } catch (e) {
      alert(`预览失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy((b) => ({ ...b, [t.id]: false }));
    }
  }

  async function remove(t: Trigger) {
    if (!confirm(`删掉「${t.name}」？`)) return;
    await api.deleteTrigger(t.id);
    await refresh();
  }

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) {
      setError("名字不能为空");
      return;
    }
    try {
      await api.saveTrigger({ ...editing, name: editing.name.trim() });
      setEditing(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Stack sx={{ height: "100%", overflow: "auto", p: 3 }} spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1.2}>
        <AutoModeIcon color="primary" />
        <Typography variant="h6">自动化</Typography>
        <Typography variant="caption" color="text.secondary">
          满足条件时让 AI 自动做事。先挑一个模板。
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="刷新">
          <IconButton size="small" onClick={() => void refresh()}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          size="small"
          onClick={() => setPicker(true)}
        >
          从模板新建
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 0 }}>
        {list.length === 0 && (
          <Stack alignItems="center" spacing={1} sx={{ p: 4 }}>
            <AutoModeIcon
              sx={{ fontSize: 36, color: "text.disabled" }}
            />
            <Typography variant="body2" color="text.secondary">
              还没有自动化任务。
            </Typography>
            <Button
              size="small"
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setPicker(true)}
            >
              从模板新建一个
            </Button>
          </Stack>
        )}
        <List dense>
          {list.map((t, i) => (
            <Box key={t.id}>
              {i > 0 && <Divider />}
              <ListItemButton
                disableRipple
                sx={{ alignItems: "flex-start", py: 1.4, gap: 1 }}
              >
                <Switch
                  size="small"
                  checked={t.enabled}
                  onChange={(_, v) => void toggleEnabled(t, v)}
                  sx={{ mt: -0.5 }}
                />
                <ListItemText
                  primary={
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      sx={{ flexWrap: "wrap" }}
                    >
                      <Typography fontWeight={600}>{t.name}</Typography>
                      <Chip
                        size="small"
                        label={minutesLabel(t.interval_secs)}
                        sx={{ height: 18, fontSize: 11 }}
                      />
                      {t.last_status && (
                        <Chip
                          size="small"
                          color={STATUS_COLOR[t.last_status] ?? "default"}
                          variant="outlined"
                          label={
                            (STATUS_LABEL[t.last_status] ?? t.last_status) +
                            (t.last_fired_rows != null
                              ? ` · ${t.last_fired_rows} 行`
                              : "")
                          }
                          sx={{ height: 18, fontSize: 11 }}
                        />
                      )}
                      <Typography variant="caption" color="text.secondary">
                        上次：{tsToString(t.last_run_at)}
                      </Typography>
                    </Stack>
                  }
                  secondary={
                    <Stack spacing={0.4} sx={{ mt: 0.4 }}>
                      <Box
                        sx={{
                          fontSize: 12.5,
                          color: "text.secondary",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        <strong>什么时候：</strong>
                        <Box
                          component="span"
                          sx={{
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                            fontSize: 12,
                            ml: 0.5,
                          }}
                        >
                          {t.condition_sql}
                        </Box>
                      </Box>
                      <Box
                        sx={{
                          fontSize: 12.5,
                          color: "text.secondary",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        <strong>做什么：</strong> {t.action_prompt}
                      </Box>
                      {t.last_error && (
                        <Typography
                          variant="caption"
                          color="error.main"
                          sx={{ mt: 0.3 }}
                        >
                          上次错误：{t.last_error}
                        </Typography>
                      )}
                    </Stack>
                  }
                  secondaryTypographyProps={{ component: "div" }}
                />
                <Stack direction="row" spacing={0.4}>
                  <Tooltip title="预览条件（只看 SQL 结果，不调 AI）">
                    <span>
                      <IconButton
                        size="small"
                        disabled={!!busy[t.id]}
                        onClick={() => void preview(t)}
                      >
                        <PreviewIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="立即运行一次">
                    <span>
                      <IconButton
                        size="small"
                        disabled={!!busy[t.id]}
                        onClick={() => void runNow(t)}
                      >
                        {busy[t.id] ? (
                          <CircularProgress size={14} />
                        ) : (
                          <PlayArrowIcon fontSize="small" />
                        )}
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="编辑">
                    <IconButton
                      size="small"
                      onClick={() => {
                        setIsNew(false);
                        setEditing(t);
                      }}
                    >
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => void remove(t)}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </ListItemButton>
            </Box>
          ))}
        </List>
      </Paper>

      {/* Template picker */}
      <Dialog
        open={picker}
        onClose={() => setPicker(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>从模板新建</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            挑一个最像你想做的事，下一步只用填几个空。
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 1.5,
            }}
          >
            {TEMPLATES.map((t) => (
              <Paper
                key={t.id}
                variant="outlined"
                onClick={() => {
                  setTemplateFill(t);
                  setPicker(false);
                }}
                sx={{
                  p: 1.6,
                  cursor: "pointer",
                  transition: "transform .15s, border-color .15s",
                  "&:hover": {
                    transform: "translateY(-1px)",
                    borderColor: "primary.main",
                  },
                }}
              >
                <Stack direction="row" spacing={1.2} alignItems="flex-start">
                  <Box sx={{ fontSize: 22, lineHeight: 1 }}>{t.icon}</Box>
                  <Stack spacing={0.3} sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={600} sx={{ fontSize: 14 }}>
                      {t.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t.blurb}
                    </Typography>
                  </Stack>
                </Stack>
              </Paper>
            ))}
            <Paper
              variant="outlined"
              onClick={() => {
                setIsNew(true);
                setEditing({
                  id: `trigger-${Date.now().toString(36)}`,
                  name: "",
                  enabled: true,
                  interval_secs: 0,
                  condition_sql: "SELECT 1",
                  action_prompt: "",
                });
                setPicker(false);
              }}
              sx={{
                p: 1.6,
                cursor: "pointer",
                borderStyle: "dashed",
                "&:hover": { borderColor: "primary.main" },
                bgcolor: isDark
                  ? "rgba(255,255,255,0.02)"
                  : "rgba(0,0,0,0.02)",
              }}
            >
              <Typography fontWeight={600} sx={{ fontSize: 14 }}>
                ⚙ 从零自定义
              </Typography>
              <Typography variant="caption" color="text.secondary">
                直接写 SQL 和让 AI 做的事
              </Typography>
            </Paper>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPicker(false)}>取消</Button>
        </DialogActions>
      </Dialog>

      {/* Template fill-in */}
      <TemplateFillDialog
        template={templateFill}
        onClose={() => setTemplateFill(null)}
        onCreate={async (built) => {
          try {
            const trigger: Trigger = {
              id: `trigger-${Date.now().toString(36)}`,
              ...built,
            };
            await api.saveTrigger(trigger);
            setTemplateFill(null);
            await refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      />

      {/* Custom editor */}
      <TriggerDialog
        open={!!editing}
        value={editing}
        isNew={isNew}
        onChange={setEditing}
        onClose={() => setEditing(null)}
        onSave={() => void save()}
      />
    </Stack>
  );
}

function TemplateFillDialog({
  template,
  onClose,
  onCreate,
}: {
  template: AutomationTemplate | null;
  onClose: () => void;
  onCreate: (built: Omit<Trigger, "id">) => Promise<void> | void;
}) {
  const [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!template) {
      setFields({});
      return;
    }
    const defaults: Record<string, string> = {};
    template.fields.forEach((f) => (defaults[f.key] = f.default ?? ""));
    setFields(defaults);
  }, [template]);

  if (!template) return null;
  const missing = template.fields.filter(
    (f) => !f.default && !fields[f.key]?.trim() && f.helper !== "（可选）" && !f.key.includes("optional")
  );

  return (
    <Dialog open={!!template} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1.2}>
          <Box sx={{ fontSize: 24, lineHeight: 1 }}>{template.icon}</Box>
          <Stack>
            <Typography fontWeight={600}>{template.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {template.blurb}
            </Typography>
          </Stack>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {template.fields.map((f) => (
            <TextField
              key={f.key}
              size="small"
              label={f.label}
              type={f.type === "number" ? "number" : "text"}
              multiline={f.type === "textarea"}
              minRows={f.type === "textarea" ? 3 : undefined}
              placeholder={f.placeholder}
              helperText={f.helper}
              value={fields[f.key] ?? ""}
              onChange={(e) =>
                setFields({ ...fields, [f.key]: e.target.value })
              }
            />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button
          variant="contained"
          disabled={missing.length > 0}
          onClick={() => {
            const built = template.build(fields);
            void onCreate(built);
          }}
        >
          创建
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function TriggerDialog({
  open,
  value,
  isNew,
  onChange,
  onClose,
  onSave,
}: {
  open: boolean;
  value: Trigger | null;
  isNew: boolean;
  onChange: (t: Trigger) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!value) return null;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{isNew ? "自定义新触发器" : "编辑触发器"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            size="small"
            label="名字"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            autoFocus
          />
          <Stack direction="row" spacing={2}>
            <TextField
              size="small"
              label="每多少分钟跑一次（0 = 只在我点运行时跑）"
              type="number"
              value={Math.round(value.interval_secs / 60)}
              onChange={(e) =>
                onChange({
                  ...value,
                  interval_secs: Math.max(0, Number(e.target.value) || 0) * 60,
                })
              }
              sx={{ width: 280 }}
              inputProps={{ min: 0 }}
            />
            <Stack direction="row" alignItems="center" spacing={1}>
              <Switch
                size="small"
                checked={value.enabled}
                onChange={(_, v) => onChange({ ...value, enabled: v })}
              />
              <Typography variant="body2">启用</Typography>
            </Stack>
          </Stack>
          <TextField
            size="small"
            label="什么时候触发（SQL；返回至少 1 行就触发）"
            value={value.condition_sql}
            onChange={(e) =>
              onChange({ ...value, condition_sql: e.target.value })
            }
            multiline
            minRows={3}
            helperText="写一条 SELECT，返回的行会作为 matched_rows 传给 AI"
            InputProps={{
              sx: {
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 13,
              },
            }}
          />
          <TextField
            size="small"
            label="做什么（用大白话告诉 AI）"
            value={value.action_prompt}
            onChange={(e) =>
              onChange({ ...value, action_prompt: e.target.value })
            }
            multiline
            minRows={4}
            placeholder="示例：把 matched_rows 里的每条放到 issues 表，缺的列用 fetch_url 补全。"
            helperText="AI 能用 query / create_table / insert_rows / update_cell / fetch_url 等工具。"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={onSave}>
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
}
