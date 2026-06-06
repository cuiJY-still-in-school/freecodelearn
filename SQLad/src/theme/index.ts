import { createTheme } from "@mui/material/styles";

const accent = "#3b82f6";

export const buildTheme = (mode: "light" | "dark") =>
  createTheme({
    palette: {
      mode,
      primary: { main: accent },
      background:
        mode === "dark"
          ? { default: "#0e1116", paper: "#161a22" }
          : { default: "#f6f7f9", paper: "#ffffff" },
      divider: mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
      fontSize: 13.5,
      button: { textTransform: "none", fontWeight: 500 },
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: "none" },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            marginInline: 8,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { fontSize: 12 },
        },
      },
    },
  });
