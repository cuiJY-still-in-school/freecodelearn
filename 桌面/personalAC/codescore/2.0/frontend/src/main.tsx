import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import App from './App'
import './styles/global.css'

const anthropicTheme = createTheme({
  palette: {
    primary: { main: '#cc785c', light: '#e2a188', dark: '#a9583e', contrastText: '#ffffff' },
    secondary: { main: '#5db8a6', light: '#8eccc1', dark: '#3e9a8a', contrastText: '#141413' },
    background: { default: '#faf9f5', paper: '#ffffff' },
    text: { primary: '#141413', secondary: '#3d3d3a', disabled: '#8e8b82' },
    divider: '#e6dfd8',
    error: { main: '#c64545' },
    warning: { main: '#d4a017' },
    success: { main: '#5db872' },
    info: { main: '#3266ad' },
    action: {
      active: '#cc785c',
      hover: 'rgba(204,120,92,0.08)',
      selected: 'rgba(204,120,92,0.14)',
      disabled: '#e6dfd8',
      disabledBackground: '#e6dfd8',
    },
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    h1: { fontFamily: '"Playfair Display", Georgia, serif', fontSize: 64, fontWeight: 400, lineHeight: 1.05, letterSpacing: '-1.5px' },
    h2: { fontFamily: '"Playfair Display", Georgia, serif', fontSize: 48, fontWeight: 400, lineHeight: 1.1, letterSpacing: '-1px' },
    h3: { fontFamily: '"Playfair Display", Georgia, serif', fontSize: 36, fontWeight: 400, lineHeight: 1.15, letterSpacing: '-0.5px' },
    h4: { fontFamily: '"Playfair Display", Georgia, serif', fontSize: 28, fontWeight: 400, lineHeight: 1.2, letterSpacing: '-0.3px' },
    h5: { fontSize: 22, fontWeight: 500, lineHeight: 1.3 },
    h6: { fontSize: 18, fontWeight: 500, lineHeight: 1.4 },
    subtitle1: { fontSize: 16, fontWeight: 500, lineHeight: 1.4 },
    subtitle2: { fontSize: 14, fontWeight: 500, lineHeight: 1.4 },
    body1: { fontSize: 16, fontWeight: 400, lineHeight: 1.55 },
    body2: { fontSize: 14, fontWeight: 400, lineHeight: 1.55 },
    button: { fontSize: 14, fontWeight: 500, textTransform: 'none', lineHeight: 1, letterSpacing: '0' },
    caption: { fontSize: 13, fontWeight: 500, lineHeight: 1.4 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: '#faf9f5', color: '#141413', lineHeight: 1.55, WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
        '::selection': { backgroundColor: 'rgba(204,120,92,0.2)' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8, padding: '12px 20px', fontSize: 14, fontWeight: 500, textTransform: 'none', lineHeight: 1 },
        containedPrimary: { backgroundColor: '#cc785c', color: '#ffffff', '&:hover': { backgroundColor: '#a9583e' }, '&.Mui-disabled': { backgroundColor: '#e6dfd8', color: '#b0aea5' } },
        outlined: { borderWidth: '0.5px', borderColor: '#e6dfd8', color: '#141413', '&:hover': { backgroundColor: 'rgba(204,120,92,0.08)', borderWidth: '0.5px', borderColor: '#cc785c' } },
        text: { color: '#cc785c', '&:hover': { backgroundColor: 'rgba(204,120,92,0.08)' } },
        sizeSmall: { padding: '8px 16px', fontSize: 13 },
        sizeLarge: { padding: '14px 24px', fontSize: 16 },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 8, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e6dfd8', borderWidth: '0.5px' }, '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#cc785c' }, '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#cc785c', borderWidth: '1.5px' } },
        input: { padding: '12px 16px', fontSize: 16, '&::placeholder': { color: '#8e8b82', opacity: 1 } },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { color: '#6c6a64', fontSize: 14, '&.Mui-focused': { color: '#cc785c' } } } },
    MuiCard: { styleOverrides: { root: { borderRadius: 12, border: '0.5px solid #e6dfd8', boxShadow: 'none', backgroundImage: 'none' } } },
    MuiCardContent: { styleOverrides: { root: { padding: 32, '&:last-child': { paddingBottom: 32 } } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' }, elevation1: { boxShadow: '0 1px 3px rgba(20,20,19,0.06)' }, elevation2: { boxShadow: '0 2px 6px rgba(20,20,19,0.08)' } } },
    MuiAppBar: { styleOverrides: { root: { borderBottom: '0.5px solid #e6dfd8', boxShadow: 'none', backgroundColor: '#faf9f5', color: '#141413', backgroundImage: 'none' } } },
    MuiDrawer: { styleOverrides: { paper: { borderRight: '0.5px solid #e6dfd8', backgroundColor: '#faf9f5' } } },
    MuiListItemButton: { styleOverrides: { root: { borderRadius: 6, margin: '2px 8px', '&.Mui-selected': { backgroundColor: 'rgba(204,120,92,0.08)', color: '#cc785c' } } } },
    MuiAvatar: { styleOverrides: { root: { width: 32, height: 32, fontSize: 14, fontWeight: 500 }, colorDefault: { backgroundColor: '#cc785c', color: '#ffffff' } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 9999, fontSize: 12, fontWeight: 500 }, outlined: { borderWidth: '0.5px' } } },
    MuiDivider: { styleOverrides: { root: { borderColor: '#e6dfd8', borderWidth: '0px 0px 0.5px' } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 8, border: '0.5px solid' }, standardError: { backgroundColor: '#fcf0ef', borderColor: '#c64545', color: '#7a2d2d' }, standardWarning: { backgroundColor: '#faf5eb', borderColor: '#d4a017', color: '#7a5c0d' }, standardSuccess: { backgroundColor: '#f0f7f0', borderColor: '#5db872', color: '#2d5a3d' }, standardInfo: { backgroundColor: '#eef3f9', borderColor: '#3266ad', color: '#1a3a6a' } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 12, border: '0.5px solid #e6dfd8', boxShadow: '0 4px 12px rgba(20,20,19,0.1)' } } },
    MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: '#141413', color: '#faf9f5', fontSize: 12, borderRadius: 6, padding: '6px 10px' } } },
    MuiLinearProgress: { styleOverrides: { root: { backgroundColor: '#e6dfd8', borderRadius: 9999 }, bar: { borderRadius: 9999, backgroundColor: '#cc785c' } } },
    MuiCircularProgress: { styleOverrides: { root: { color: '#cc785c' } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 500, fontSize: 14, '&.Mui-selected': { color: '#cc785c' } } } },
    MuiTabs: { styleOverrides: { indicator: { backgroundColor: '#cc785c' } } },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider theme={anthropicTheme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)
