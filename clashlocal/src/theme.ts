import { createTheme, type Theme } from '@mui/material/styles'

export type ThemeMode = 'light' | 'dark' | 'system'

/** 按模式生成主题(仿 Clash Verge)。 */
export function makeTheme(mode: 'light' | 'dark'): Theme {
  const dark = mode === 'dark'
  return createTheme({
    palette: {
      mode,
      primary: { main: '#6172ff', dark: '#4d5be0' },
      success: { main: '#38d39f' },
      warning: { main: '#f5a623' },
      error: { main: '#ff6b6b' },
      background: dark
        ? { default: '#0f1115', paper: '#1b1f2a' }
        : { default: '#f4f5fa', paper: '#ffffff' },
      divider: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)',
      text: dark
        ? { primary: '#e6e9ef', secondary: '#8b93a7' }
        : { primary: '#1b1f2a', secondary: '#5b6472' },
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
          root: {
            backgroundImage: 'none',
            border: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.08)',
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { textTransform: 'none' } },
      },
    },
  })
}

export default makeTheme
