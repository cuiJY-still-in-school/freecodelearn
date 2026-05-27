import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Box, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material'
import HomeRoundedIcon from '@mui/icons-material/HomeRounded'
import PublicRoundedIcon from '@mui/icons-material/PublicRounded'
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded'
import ArticleRoundedIcon from '@mui/icons-material/ArticleRounded'
import HubRoundedIcon from '@mui/icons-material/HubRounded'
import SubjectRoundedIcon from '@mui/icons-material/SubjectRounded'
import WifiTetheringRoundedIcon from '@mui/icons-material/WifiTetheringRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'

export interface NavEntry {
  key: string
  label: string
  icon: ReactNode
}

export const NAV: NavEntry[] = [
  { key: 'home', label: '首页', icon: <HomeRoundedIcon /> },
  { key: 'proxies', label: '代理', icon: <PublicRoundedIcon /> },
  { key: 'profiles', label: '配置', icon: <DescriptionRoundedIcon /> },
  { key: 'rules', label: '规则', icon: <ArticleRoundedIcon /> },
  { key: 'connections', label: '连接', icon: <HubRoundedIcon /> },
  { key: 'logs', label: '日志', icon: <SubjectRoundedIcon /> },
  { key: 'hotspot', label: '热点', icon: <WifiTetheringRoundedIcon /> },
  { key: 'settings', label: '设置', icon: <SettingsRoundedIcon /> },
]

interface Props {
  active: string
  onChange: (key: string) => void
}

export default function Sidebar({ active, onChange }: Props) {
  const [running, setRunning] = useState(false)
  useEffect(() => {
    const tick = () =>
      invoke<{ running: boolean }>('core_status')
        .then((s) => setRunning(s.running))
        .catch(() => {})
    tick()
    const id = setInterval(tick, 3000)
    return () => clearInterval(id)
  }, [])
  return (
    <Box
      sx={{
        width: 220,
        flexShrink: 0,
        bgcolor: 'background.paper',
        borderRight: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        p: 1.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 1.5 }}>
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            bgcolor: running ? 'success.main' : 'text.disabled',
            boxShadow: running ? '0 0 8px rgba(56,211,159,0.9)' : 'none',
          }}
        />
        <Typography sx={{ fontWeight: 700, fontSize: 18 }}>clashlocal</Typography>
      </Box>

      <List sx={{ flex: 1, mt: 1 }}>
        {NAV.map((n) => (
          <ListItemButton
            key={n.key}
            selected={active === n.key}
            onClick={() => onChange(n.key)}
            sx={{
              borderRadius: 2,
              mb: 0.5,
              color: 'text.secondary',
              '&.Mui-selected': {
                bgcolor: 'primary.main',
                color: '#fff',
                '&:hover': { bgcolor: 'primary.dark' },
              },
              '&.Mui-selected .MuiListItemIcon-root': { color: '#fff' },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>{n.icon}</ListItemIcon>
            <ListItemText primary={n.label} />
          </ListItemButton>
        ))}
      </List>

      <Typography sx={{ color: 'text.secondary', fontSize: 12, px: 1 }}>v0.1.0</Typography>
    </Box>
  )
}
