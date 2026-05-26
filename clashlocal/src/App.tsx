import { useEffect, useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import { Box, CssBaseline, ThemeProvider, Typography } from '@mui/material'
import makeTheme, { type ThemeMode } from './theme'
import Sidebar, { NAV } from './components/Sidebar'
import Home from './pages/Home'
import Proxies from './pages/Proxies'
import Profiles from './pages/Profiles'
import Rules from './pages/Rules'
import Connections from './pages/Connections'
import Logs from './pages/Logs'
import Hotspot from './pages/Hotspot'
import Settings from './pages/Settings'
import Dashboard from './pages/Dashboard'

const PAGES: Record<string, ComponentType> = {
  home: Home,
  proxies: Proxies,
  profiles: Profiles,
  rules: Rules,
  connections: Connections,
  logs: Logs,
  dashboard: Dashboard,
  hotspot: Hotspot,
  settings: Settings,
}

function readMode(): ThemeMode {
  return (localStorage.getItem('theme-mode') as ThemeMode) || 'system'
}

export default function App() {
  const [active, setActive] = useState('home')
  const [mode, setMode] = useState<ThemeMode>(readMode)
  const label = NAV.find((n) => n.key === active)?.label ?? ''
  const Page = PAGES[active]

  // 设置页改主题后通过自定义事件通知;并跟随系统主题变化
  useEffect(() => {
    const onMode = () => setMode(readMode())
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    window.addEventListener('thememode', onMode)
    mq.addEventListener('change', onMode)
    return () => {
      window.removeEventListener('thememode', onMode)
      mq.removeEventListener('change', onMode)
    }
  }, [])

  const resolved: 'light' | 'dark' =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode
  const theme = useMemo(() => makeTheme(resolved), [resolved])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar active={active} onChange={setActive} />
        <Box component="main" sx={{ flex: 1, overflow: 'auto', p: 4 }}>
          {Page ? (
            <Page />
          ) : (
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {label}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                该模块开发中…
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  )
}
