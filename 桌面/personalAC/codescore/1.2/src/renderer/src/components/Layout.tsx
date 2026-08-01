import React from 'react'
import { Link, useLocation } from 'react-router-dom'

interface NavItem {
  path: string
  label: string
  icon: string
}

const navItems: NavItem[] = [
  { path: '/', label: '仪表盘', icon: '📊' },
  { path: '/chat', label: 'AI 对话', icon: '💬' },
  { path: '/plans', label: '学习方向', icon: '🎯' },
  { path: '/agent-logs', label: 'Agent 日志', icon: '🤖' },
  { path: '/agent-tasks', label: '主动任务', icon: '⚡' },
  { path: '/config', label: '系统配置', icon: '⚙️' }
]

interface LayoutProps {
  children: React.ReactNode
}

function Layout({ children }: LayoutProps): React.ReactElement {
  const location = useLocation()

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
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>个性化学习辅助系统 v1.2</div>
        </div>

        {/* SuperAdmin Identity */}
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
              background: '#7c3aed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              flexShrink: 0,
              fontWeight: 700
            }}
          >
            S
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
              SuperAdmin
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#a78bfa',
                background: 'rgba(167,139,250,0.15)',
                borderRadius: 4,
                padding: '1px 6px',
                display: 'inline-block',
                marginTop: 2
              }}
            >
              超级管理员
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 0' }}>
          {navItems.map((item) => {
            const isActive =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path)
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
                  background: isActive ? 'rgba(124,58,237,0.4)' : 'transparent',
                  borderLeft: isActive ? '3px solid #a78bfa' : '3px solid transparent',
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

        {/* Bottom info */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            fontSize: 11,
            color: 'rgba(255,255,255,0.35)',
            textAlign: 'center'
          }}
        >
          SuperAdmin 模式 · v1.2
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
