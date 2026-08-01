import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getAuth, clearAuth } from '../App'

interface NavItem {
  path: string
  label: string
  icon: string
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { path: '/dashboard', label: '仪表盘', icon: '📊' },
  { path: '/plans', label: '学习方向', icon: '🎯' },
  { path: '/agent-logs', label: 'Agent 日志', icon: '🤖' },
  { path: '/config', label: '系统配置', icon: '⚙️', adminOnly: true }
]

interface LayoutProps {
  children: React.ReactNode
}

function Layout({ children }: LayoutProps): React.ReactElement {
  const location = useLocation()
  const navigate = useNavigate()
  const auth = getAuth()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async (): Promise<void> => {
    if (!auth.token) return
    setLoggingOut(true)
    try {
      await window.api.auth.logout(auth.token)
    } finally {
      clearAuth()
      navigate('/login')
    }
  }

  const filteredNav = navItems.filter((item) => {
    if (item.adminOnly && auth.role !== 'admin') return false
    return true
  })

  const roleLabel =
    auth.role === 'admin'
      ? '管理员'
      : auth.role === 'guardian'
        ? '监护人'
        : '学生'

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 220,
          background: '#1e1b4b',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: '20px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.1)'
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>PersonalAC</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>个性化学习辅助系统 v1.1</div>
        </div>

        {/* User Info */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#4f46e5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              flexShrink: 0
            }}
          >
            {auth.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {auth.username}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{roleLabel}</div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 0' }}>
          {filteredNav.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 16px',
                  color: isActive ? 'white' : 'rgba(255,255,255,0.65)',
                  background: isActive ? 'rgba(79,70,229,0.4)' : 'transparent',
                  borderLeft: isActive ? '3px solid #818cf8' : '3px solid transparent',
                  transition: 'all 0.15s',
                  textDecoration: 'none',
                  fontSize: 14
                }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: 'rgba(255,255,255,0.7)',
              padding: '8px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
          >
            <span>🚪</span>
            <span>{loggingOut ? '退出中...' : '退出登录'}</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          overflow: 'auto',
          background: '#f9fafb',
          padding: 24
        }}
      >
        {children}
      </main>
    </div>
  )
}

export default Layout
