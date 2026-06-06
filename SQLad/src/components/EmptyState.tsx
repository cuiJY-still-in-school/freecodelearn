import { Box, Paper, Stack, Typography } from "@mui/material";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import UploadFileIcon from "@mui/icons-material/UploadFile";

export function TablesEmptyState() {
  return (
    <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: 4 }}>
      <Stack spacing={3} sx={{ maxWidth: 440, width: "100%", alignItems: "center", textAlign: "center" }}>
        <Box>
          <Typography variant="h5" fontWeight={600} gutterBottom>还没有数据</Typography>
          <Typography variant="body2" color="text.secondary">
            两种方式开始：
          </Typography>
        </Box>
        <Stack spacing={1.5} sx={{ width: "100%" }}>
          <Paper variant="outlined" sx={{ p: 2, display: "flex", alignItems: "center", gap: 2 }}>
            <ChatBubbleOutlineIcon sx={{ fontSize: 28, color: "primary.main", flexShrink: 0 }} />
            <Box sx={{ textAlign: "left" }}>
              <Typography variant="subtitle2">跟左边 AI 说</Typography>
              <Typography variant="caption" color="text.secondary">「帮我建一张学生表，填 5 行」</Typography>
            </Box>
          </Paper>
          <Paper variant="outlined" sx={{ p: 2, display: "flex", alignItems: "center", gap: 2 }}>
            <UploadFileIcon sx={{ fontSize: 28, color: "primary.main", flexShrink: 0 }} />
            <Box sx={{ textAlign: "left" }}>
              <Typography variant="subtitle2">拖个文件进来</Typography>
              <Typography variant="caption" color="text.secondary">CSV / JSON 直接变成表</Typography>
            </Box>
          </Paper>
        </Stack>
      </Stack>
    </Box>
  );
}
