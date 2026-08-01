import { Box, Typography, IconButton, Tooltip, Divider } from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import AssignmentIcon from '@mui/icons-material/Assignment'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import SettingsIcon from '@mui/icons-material/Settings'
import PersonIcon from '@mui/icons-material/Person'
import DashboardIcon from '@mui/icons-material/Dashboard'
import LogoutIcon from '@mui/icons-material/Logout'
import { useNavigate, useLocation } from 'react-router-dom'

interface SidebarProps {
  role: 'student' | 'guardian'
  onLogout: () => void
}

export default function Sidebar({ role, onLogout }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const studentLinks = [
    { icon: <EditIcon />, label: '白板', path: '/study', match: '/study' },
    { icon: <AssignmentIcon />, label: '作业', path: '/study/homework', match: '/study/homework' },
  ]

  const guardianLinks = [
    { icon: <DashboardIcon />, label: '总览', path: '/guardian', match: '/guardian' },
    { icon: <PersonIcon />, label: '学生', path: '/guardian/students', match: '/guardian/students' },
    { icon: <SettingsIcon />, label: '设置', path: '/guardian/settings', match: '/guardian/settings' },
  ]

  const links = role === 'student' ? studentLinks : guardianLinks

  return (
    <Box sx={{
      width: 64, height: '100vh',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      bgcolor: '#ffffff', borderRight: '0.5px solid var(--hairline)',
      py: 1.5, gap: 0.5,
    }}>
      {/* Logo */}
      <Tooltip title="PersonalAC" placement="right">
        <IconButton onClick={() => navigate(role === 'student' ? '/study' : '/guardian')} sx={{ mb: 1 }}>
          <SmartToyIcon sx={{ color: 'var(--primary)', fontSize: 22 }} />
        </IconButton>
      </Tooltip>

      <Divider sx={{ width: 32, borderColor: 'var(--hairline)' }} />

      {/* Nav Links */}
      {links.map(link => {
        const active = location.pathname === link.match || (link.match === '/study' && location.pathname === '/study/homework' ? false : location.pathname.startsWith(link.match))
        return (
          <Tooltip key={link.path} title={link.label} placement="right">
            <IconButton
              onClick={() => navigate(link.path)}
              sx={{
                width: 40, height: 40, borderRadius: 2,
                color: active ? 'var(--primary)' : 'var(--muted)',
                bgcolor: active ? 'rgba(204,120,92,0.1)' : 'transparent',
                '&:hover': { bgcolor: 'rgba(204,120,92,0.08)' },
              }}
            >
              {React.cloneElement(link.icon, { sx: { fontSize: 20 } })}
            </IconButton>
          </Tooltip>
        )
      })}

      <Box sx={{ flex: 1 }} />

      {/* Logout */}
      <Tooltip title="退出" placement="right">
        <IconButton onClick={onLogout} sx={{ width: 40, height: 40, borderRadius: 2, color: 'var(--muted-soft)' }}>
          <LogoutIcon sx={{ fontSize: 19 }} />
        </IconButton>
      </Tooltip>
    </Box>
  )
}

import React from 'react'
