import {
  Alert,
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import HistoryIcon from "@mui/icons-material/History";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { QueryResult } from "../api/types";
import { ResultTable } from "../components/ResultTable";
import { useData } from "../store";

const HISTORY_KEY = "sqlad.sql.history";
const HISTORY_MAX = 20;

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function saveHistory(list: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch {
    /* ignore */
  }
}

export function QueryPage() {
  const [sql, setSql] = useState(
    () =>
      localStorage.getItem("sqlad.sql.current") ||
      "SELECT name FROM sqlite_master WHERE type='table';"
  );
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>(() => loadHistory());
  const [histAnchor, setHistAnchor] = useState<HTMLElement | null>(null);
  const refresh = useData((s) => s.refreshTables);

  useEffect(() => {
    localStorage.setItem("sqlad.sql.current", sql);
  }, [sql]);

  async function run() {
    const text = sql.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.runQuery(text);
      setResult(r);
      // Push to history (dedupe + keep newest first).
      setHistory((prev) => {
        const next = [text, ...prev.filter((s) => s !== text)].slice(
          0,
          HISTORY_MAX
        );
        saveHistory(next);
        return next;
      });
      if (/^(create|drop|alter|insert|update|delete)/i.test(text)) {
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function shorten(s: string, n = 70): string {
    const oneLine = s.replace(/\s+/g, " ").trim();
    return oneLine.length > n ? oneLine.slice(0, n) + "…" : oneLine;
  }

  return (
    <Stack sx={{ height: "100%", p: 3 }} spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6">SQL 编辑器</Typography>
          <Typography variant="caption" color="text.secondary">
            Ctrl+Enter 执行
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Tooltip title={history.length > 0 ? "查询历史" : "（暂无历史）"}>
            <span>
              <IconButton
                size="small"
                disabled={history.length === 0}
                onClick={(e) => setHistAnchor(e.currentTarget)}
              >
                <HistoryIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Menu
            anchorEl={histAnchor}
            open={!!histAnchor}
            onClose={() => setHistAnchor(null)}
            slotProps={{ paper: { sx: { minWidth: 480, maxWidth: 720 } } }}
          >
            <Box
              sx={{
                px: 2,
                py: 0.8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: 1,
                borderColor: "divider",
              }}
            >
              <Typography variant="overline" color="text.secondary">
                最近 {history.length} 条
              </Typography>
              <Tooltip title="清空历史">
                <IconButton
                  size="small"
                  onClick={() => {
                    setHistory([]);
                    saveHistory([]);
                    setHistAnchor(null);
                  }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            {history.map((q, i) => (
              <MenuItem
                key={i}
                onClick={() => {
                  setSql(q);
                  setHistAnchor(null);
                }}
                sx={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 12.5,
                  py: 0.6,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {shorten(q)}
              </MenuItem>
            ))}
          </Menu>
          <Button
            variant="contained"
            startIcon={<PlayArrowRoundedIcon />}
            onClick={() => void run()}
            disabled={busy || !sql.trim()}
          >
            执行
          </Button>
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ p: 1 }}>
        <TextField
          multiline
          minRows={6}
          fullWidth
          variant="standard"
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
          InputProps={{
            disableUnderline: true,
            sx: {
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 13,
              p: 1,
            },
          }}
        />
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <Box sx={{ flex: 1, overflow: "auto" }}>
        {result && <ResultTable result={result} />}
      </Box>
    </Stack>
  );
}
