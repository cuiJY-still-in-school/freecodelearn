import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { api } from "../api/client";
import type { ImportResult } from "../api/types";
import { useData, useUi } from "../store";

export function ImportPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const refresh = useData((s) => s.refreshTables);
  const setView = useUi((s) => s.setView);
  const setActive = useUi((s) => s.setActiveTable);

  async function pickFile() {
    const selected = await open({
      multiple: false,
      filters: [
        { name: "CSV / JSON", extensions: ["csv", "tsv", "json", "jsonl", "ndjson"] },
      ],
    });
    if (!selected || Array.isArray(selected)) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await readFile(selected);
      const hint = selected.split(/[\\/]/).pop() ?? selected;
      const r = await api.importData({
        bytes: Array.from(data),
        filename_hint: hint,
      });
      setResult(r);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack sx={{ height: "100%", p: 3, alignItems: "center" }} spacing={3}>
      <Stack alignItems="center" spacing={1} sx={{ mt: 2 }}>
        <UploadFileIcon sx={{ fontSize: 44, color: "primary.main" }} />
        <Typography variant="h6">导入数据</Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          支持 CSV / TSV / JSON / JSONL。每个文件成为一张表，列类型自动推断。
        </Typography>
      </Stack>

      <Paper
        variant="outlined"
        sx={{
          width: "100%",
          maxWidth: 640,
          p: 4,
          textAlign: "center",
          borderStyle: "dashed",
          borderWidth: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          直接<strong>把文件拖到窗口任意位置</strong>就能导入。
        </Typography>
        <Typography variant="caption" color="text.secondary">
          或者
        </Typography>
        <Box sx={{ mt: 2 }}>
          <Button
            variant="contained"
            startIcon={<UploadFileIcon />}
            onClick={() => void pickFile()}
            disabled={busy}
          >
            选择文件
          </Button>
        </Box>
      </Paper>

      <Paper
        variant="outlined"
        sx={{ width: "100%", maxWidth: 640, p: 2.5, textAlign: "center" }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          没有现成数据？让 AI 帮你建一个
        </Typography>
        <Button
          startIcon={<ChatBubbleOutlineIcon />}
          onClick={() => setView("chat")}
          variant="outlined"
        >
          打开 AI 对话
        </Button>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ width: "100%", maxWidth: 640 }}>
          {error}
        </Alert>
      )}
      {result && (
        <Alert
          severity="success"
          sx={{ width: "100%", maxWidth: 640 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                setActive(result.table);
                setView("tables");
              }}
            >
              查看
            </Button>
          }
        >
          已导入 <b>{result.table}</b>，{result.rows_inserted} 行 ·{" "}
          {result.schema.columns.length} 列
        </Alert>
      )}
    </Stack>
  );
}
