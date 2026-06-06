import { Box, Button, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography, useTheme } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import { useEffect, useState } from "react";

const STORAGE_KEY = "sqlad.seenWelcome.v2";

export function WelcomeDialog() {
  const [open, setOpen] = useState<boolean>(() => localStorage.getItem(STORAGE_KEY) !== "1");
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  useEffect(() => { if (!open) localStorage.setItem(STORAGE_KEY, "1"); }, [open]);
  if (!open) return null;

  return (
    <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box sx={{ width: 38, height: 38, borderRadius: 1.5, display: "grid", placeItems: "center", bgcolor: "primary.main", color: "primary.contrastText" }}>
            <StorageOutlinedIcon sx={{ fontSize: 24 }} />
          </Box>
          <Typography fontWeight={600}>欢迎使用 SQLad</Typography>
        </Stack>
        <IconButton onClick={() => setOpen(false)} size="small" sx={{ position: "absolute", right: 12, top: 14 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: isDark ? "rgba(59,130,246,0.06)" : "rgba(59,130,246,0.04)", border: 1, borderColor: isDark ? "rgba(59,130,246,0.25)" : "rgba(59,130,246,0.15)" }}>
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <ChatBubbleOutlineIcon sx={{ color: "primary.main", mt: 0.3 }} />
              <Box>
                <Typography fontWeight={600} gutterBottom>左边是 AI。对它说人话</Typography>
                <Typography variant="body2" color="text.secondary">
                  「帮我记个账」「把这段 CSV 建个表」「画个柱状图」「每小时检查一次」
                </Typography>
              </Box>
            </Stack>
          </Box>
          <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: 1, borderColor: "divider" }}>
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <StorageOutlinedIcon sx={{ color: "primary.main", mt: 0.3 }} />
              <Box>
                <Typography fontWeight={600} gutterBottom>右边是数据。点进去直接改</Typography>
                <Typography variant="body2" color="text.secondary">
                  表格能排序、筛选、画图、做卡片。也可以<strong>拖 CSV 文件到窗口</strong>。
                </Typography>
              </Box>
            </Stack>
          </Box>
          <Button variant="contained" size="large" onClick={() => setOpen(false)}>开始</Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
