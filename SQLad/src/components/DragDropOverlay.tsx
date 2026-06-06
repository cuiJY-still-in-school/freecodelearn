import { Alert, Box, CircularProgress, Snackbar, Stack, Typography } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { readFile } from "@tauri-apps/plugin-fs";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useData, useUi } from "../store";

interface ToastItem {
  id: number;
  severity: "success" | "error" | "info";
  msg: string;
  action?: { label: string; onClick: () => void };
}

export function DragDropOverlay() {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const refreshTables = useData((s) => s.refreshTables);
  const setView = useUi((s) => s.setView);
  const setActiveTable = useUi((s) => s.setActiveTable);

  function pushToast(item: Omit<ToastItem, "id">) {
    setToasts((prev) => [...prev, { ...item, id: Date.now() + Math.random() }]);
  }

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const webview = getCurrentWebview();
        unlisten = await webview.onDragDropEvent(async (event) => {
          if (event.payload.type === "enter" || event.payload.type === "over") {
            setOver(true);
            return;
          }
          if (event.payload.type === "leave") {
            setOver(false);
            return;
          }
          if (event.payload.type === "drop") {
            setOver(false);
            const paths = event.payload.paths ?? [];
            if (paths.length === 0) return;
            setBusy(true);
            for (const p of paths) {
              try {
                const bytes = await readFile(p);
                const hint = p.split(/[\\/]/).pop() ?? p;
                const result = await api.importData({
                  bytes: Array.from(bytes),
                  filename_hint: hint,
                });
                pushToast({
                  severity: "success",
                  msg: `已导入 ${result.table}（${result.rows_inserted} 行 · ${result.schema.columns.length - 1} 列）`,
                  action: {
                    label: "查看",
                    onClick: () => {
                      setActiveTable(result.table);
                      setView("tables");
                    },
                  },
                });
              } catch (e) {
                pushToast({
                  severity: "error",
                  msg: `${p.split(/[\\/]/).pop()}：${e instanceof Error ? e.message : String(e)}`,
                });
              }
            }
            setBusy(false);
            await refreshTables();
          }
        });
      } catch {
        // Fallback if Tauri webview API unavailable (browser dev mode etc.)
      }
    })();
    return () => {
      try {
        unlisten?.();
      } catch {
        /* ignore */
      }
    };
  }, [refreshTables, setActiveTable, setView]);

  return (
    <>
      {(over || busy) && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 1500,
            pointerEvents: "none",
            display: "grid",
            placeItems: "center",
            bgcolor: (t) =>
              t.palette.mode === "dark"
                ? "rgba(14,17,22,0.78)"
                : "rgba(255,255,255,0.85)",
            backdropFilter: "blur(2px)",
          }}
        >
          <Box
            sx={{
              border: 2,
              borderStyle: "dashed",
              borderColor: "primary.main",
              borderRadius: 3,
              px: 6,
              py: 4,
              textAlign: "center",
              bgcolor: (t) =>
                t.palette.mode === "dark"
                  ? "rgba(59,130,246,0.06)"
                  : "rgba(59,130,246,0.04)",
            }}
          >
            <Stack spacing={1.5} alignItems="center">
              {busy ? (
                <>
                  <CircularProgress size={28} />
                  <Typography variant="h6">正在导入…</Typography>
                </>
              ) : (
                <>
                  <UploadFileIcon sx={{ fontSize: 48, color: "primary.main" }} />
                  <Typography variant="h6">松手即导入</Typography>
                  <Typography variant="body2" color="text.secondary">
                    支持 CSV / TSV / JSON / JSONL，每个文件成为一张表
                  </Typography>
                </>
              )}
            </Stack>
          </Box>
        </Box>
      )}

      {toasts.map((t, i) => (
        <Snackbar
          key={t.id}
          open
          autoHideDuration={5000}
          onClose={() =>
            setToasts((prev) => prev.filter((x) => x.id !== t.id))
          }
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          // Stack multiple snackbars
          sx={{ bottom: (16 + i * 60) + "px !important" }}
        >
          <Alert
            severity={t.severity}
            variant="filled"
            onClose={() =>
              setToasts((prev) => prev.filter((x) => x.id !== t.id))
            }
            action={
              t.action ? (
                <Box
                  component="button"
                  onClick={() => {
                    t.action!.onClick();
                    setToasts((prev) => prev.filter((x) => x.id !== t.id));
                  }}
                  sx={{
                    border: 0,
                    bgcolor: "rgba(255,255,255,0.18)",
                    color: "inherit",
                    fontFamily: "inherit",
                    fontSize: 12,
                    fontWeight: 600,
                    px: 1.2,
                    py: 0.4,
                    borderRadius: 1,
                    cursor: "pointer",
                  }}
                >
                  {t.action.label}
                </Box>
              ) : undefined
            }
            sx={{ minWidth: 280, alignItems: "center" }}
          >
            {t.msg}
          </Alert>
        </Snackbar>
      ))}
    </>
  );
}
