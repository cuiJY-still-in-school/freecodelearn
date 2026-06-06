import {
  Box,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import { useUi } from "../store";

const items = [
  { id: "tables", label: "数据", icon: <TableChartOutlinedIcon fontSize="small" /> },
  { id: "chat", label: "AI", icon: <ChatBubbleOutlineIcon fontSize="small" /> },
  { id: "settings", label: "设置", icon: <SettingsOutlinedIcon fontSize="small" /> },
] as const;

export function Sidebar() {
  const active = useUi((s) => s.activeView);
  const setView = useUi((s) => s.setView);
  const theme = useUi((s) => s.themeMode);
  const toggleTheme = useUi((s) => s.toggleTheme);

  return (
    <Box
      sx={{
        width: 220,
        flexShrink: 0,
        borderRight: 1,
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.2}
        sx={{ px: 2, py: 1.8 }}
      >
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: 1.2,
            display: "grid",
            placeItems: "center",
            bgcolor: "primary.main",
            color: "primary.contrastText",
          }}
        >
          <StorageOutlinedIcon sx={{ fontSize: 18 }} />
        </Box>
        <Box>
          <Typography fontWeight={600} lineHeight={1.1}>
            SQLad
          </Typography>
          <Typography variant="caption" color="text.secondary">
            AI data pad
          </Typography>
        </Box>
      </Stack>
      <Divider />

      <List sx={{ flex: 1, py: 1 }}>
        {items.map((it) => (
          <ListItemButton
            key={it.id}
            selected={active === it.id}
            onClick={() => setView(it.id as never)}
            sx={{
              "&.Mui-selected": {
                bgcolor: (t) =>
                  t.palette.mode === "dark"
                    ? "rgba(59,130,246,0.18)"
                    : "rgba(59,130,246,0.12)",
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 32, color: "inherit" }}>
              {it.icon}
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 14 }} primary={it.label} />
          </ListItemButton>
        ))}
      </List>

      <Divider />
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1 }}>
        <Typography variant="caption" color="text.secondary">
          v0.1.0
        </Typography>
        <Tooltip title={theme === "dark" ? "切换到浅色" : "切换到深色"}>
          <IconButton size="small" onClick={toggleTheme}>
            {theme === "dark" ? (
              <LightModeOutlinedIcon fontSize="small" />
            ) : (
              <DarkModeOutlinedIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
  );
}
