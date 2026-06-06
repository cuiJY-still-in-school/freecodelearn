import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardOutlinedIcon from "@mui/icons-material/KeyboardOutlined";
import { useEffect, useState } from "react";

interface Group {
  title: string;
  items: Array<{ keys: string[]; desc: string }>;
}

const GROUPS: Group[] = [
  {
    title: "导航",
    items: [
      { keys: ["Ctrl", "1-5"], desc: "切换到 AI 对话 / 数据表 / 查询 / 导入 / 设置" },
      { keys: ["?"], desc: "打开快捷键面板" },
    ],
  },
  {
    title: "电子表格",
    items: [
      { keys: ["双击 / Enter / F2"], desc: "进入单元格编辑" },
      { keys: ["任意可打印键"], desc: "直接进入编辑并替换内容（Excel 风）" },
      { keys: ["↑↓←→"], desc: "在单元格之间移动" },
      { keys: ["Tab"], desc: "右移；编辑中保存并右移" },
      { keys: ["Enter"], desc: "编辑中：保存并下移一行" },
      { keys: ["Shift+Enter"], desc: "编辑中：换行" },
      { keys: ["Esc"], desc: "取消当前编辑" },
      { keys: ["Ctrl+A"], desc: "全选" },
      { keys: ["Ctrl+C / Ctrl+V"], desc: "复制 / 粘贴（块）" },
      { keys: ["Ctrl+F"], desc: "搜索单元格" },
    ],
  },
  {
    title: "AI 对话",
    items: [
      { keys: ["Enter"], desc: "发送" },
      { keys: ["Shift+Enter"], desc: "换行" },
    ],
  },
  {
    title: "视图与表",
    items: [
      { keys: ["列头右键"], desc: "升序/降序/隐藏/重命名/删除列" },
      { keys: ["视图 tab ⋮"], desc: "重命名 / 复制视图 / 删除视图" },
      { keys: ["Ctrl+Enter"], desc: "在 SQL 编辑器执行" },
    ],
  },
  {
    title: "数据导入",
    items: [
      { keys: ["拖文件到窗口"], desc: "任意位置松手即导入 CSV/JSON" },
    ],
  },
];

export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  useEffect(() => {
    function isTypingTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        el.isContentEditable
      )
        return true;
      // Glide grid container — treat as typing target
      if (el.closest("[data-testid='data-grid-canvas']")) return true;
      return false;
    }
    function onKey(e: KeyboardEvent) {
      // Toggle open with "?" — only when not typing.
      if (e.key === "?" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      } else if (
        (e.key === "1" ||
          e.key === "2" ||
          e.key === "3" ||
          e.key === "4" ||
          e.key === "5") &&
        (e.ctrlKey || e.metaKey) &&
        !isTypingTarget(e.target)
      ) {
        // Quick nav via Ctrl+1..5
        e.preventDefault();
        const map: Array<"chat" | "tables" | "query" | "import" | "settings"> = [
          "chat",
          "tables",
          "query",
          "import",
          "settings",
        ];
        const idx = Number(e.key) - 1;
        // Lazy import to avoid circular store dep
        import("../store").then(({ useUi }) => useUi.getState().setView(map[idx]));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle sx={{ pr: 6 }}>
        <Stack direction="row" alignItems="center" spacing={1.2}>
          <KeyboardOutlinedIcon />
          <Typography fontWeight={600}>快捷键</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            按 ? 随时打开
          </Typography>
        </Stack>
        <IconButton
          onClick={() => setOpen(false)}
          size="small"
          sx={{ position: "absolute", right: 12, top: 14 }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 2.5,
          }}
        >
          {GROUPS.map((g) => (
            <Box key={g.title}>
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ display: "block", mb: 0.5 }}
              >
                {g.title}
              </Typography>
              <Stack spacing={0.6}>
                {g.items.map((it, i) => (
                  <Stack
                    key={i}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    spacing={1.2}
                    sx={{
                      px: 1,
                      py: 0.4,
                      borderRadius: 1,
                      "&:hover": {
                        bgcolor: isDark
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(0,0,0,0.03)",
                      },
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ fontSize: 12.8, color: "text.secondary" }}
                    >
                      {it.desc}
                    </Typography>
                    <Stack direction="row" spacing={0.4}>
                      {it.keys.map((k, j) => (
                        <Box
                          key={j}
                          sx={{
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                            fontSize: 11.5,
                            fontWeight: 600,
                            border: 1,
                            borderColor: "divider",
                            borderRadius: 0.8,
                            px: 0.7,
                            py: 0.1,
                            bgcolor: isDark
                              ? "rgba(255,255,255,0.04)"
                              : "rgba(0,0,0,0.03)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {k}
                        </Box>
                      ))}
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            </Box>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
