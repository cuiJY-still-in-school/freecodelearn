import { createTheme } from '@mui/material/styles'

// 仿 Clash Verge 的深色主题。
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#6172ff', dark: '#4d5be0' },
    background: { default: '#0f1115', paper: '#1b1f2a' },
    success: { main: '#38d39f' },
    warning: { main: '#f5a623' },
    error: { main: '#ff6b6b' },
    divider: 'rgba(255,255,255,0.08)',
    text: { primary: '#e6e9ef', secondary: '#8b93a7' },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif",
  },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard: {
      styleOverrides: {
        root: { backgroundImage: 'none', border: '1px solid rgba(255,255,255,0.06)' },
      },
    },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: 'none' } } },
  },
})

export default theme
