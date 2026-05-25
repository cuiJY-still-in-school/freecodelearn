import { useState } from 'react'
import type { ComponentType } from 'react'
import { Box, Typography } from '@mui/material'
import Sidebar, { NAV } from './components/Sidebar'
import Home from './pages/Home'
import Proxies from './pages/Proxies'
import Profiles from './pages/Profiles'
import Rules from './pages/Rules'
import Connections from './pages/Connections'
import Logs from './pages/Logs'
import Hotspot from './pages/Hotspot'
import Settings from './pages/Settings'

const PAGES: Record<string, ComponentType> = {
  home: Home,
  proxies: Proxies,
  profiles: Profiles,
  rules: Rules,
  connections: Connections,
  logs: Logs,
  hotspot: Hotspot,
  settings: Settings,
}

export default function App() {
  const [active, setActive] = useState('home')
  const label = NAV.find((n) => n.key === active)?.label ?? ''
  const Page = PAGES[active]

  return (
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
  )
}
