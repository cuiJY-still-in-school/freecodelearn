import React from 'react'
import { Link, useLocation } from 'react-router-dom'

function Icon({ name, size = 15 }: { name: string; size?: number }): React.ReactElement {
  const p = {
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const
  }
  const icons: Record<string, React.ReactElement> = {
    dashboard: <svg width={size} height={size} viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>,
    chat:      <svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    plans:     <svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
    logs:      <svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    tasks:     <svg width={size} height={size} viewBox="0 0 24 24" {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    config:    <svg width={size} height={size} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    logout:    <svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  }
  return icons[name] ?? <svg width={size} height={size} viewBox="0 0 24 24"/>
}

const navItems = [
  { path: '/',            label: '仪表盘',   icon: 'dashboard' },
  { path: '/chat',        label: 'AI 对话',  icon: 'chat'      },
  { path: '/plans',       label: '学习方向', icon: 'plans'     },
  { path: '/agent-logs',  label: 'Agent 日志', icon: 'logs'   },
  { path: '/agent-tasks', label: '主动任务', icon: 'tasks'     },
  { path: '/config',      label: '系统配置', icon: 'config'    },
]

interface LayoutProps { children: React.ReactNode }

function Layout({ children }: LayoutProps): React.ReactElement {
  const location = useLocation()
  const username = localStorage.getItem('username') || 'superadmin'
  const initial  = username.charAt(0).toUpperCase()

  const handleLogout = (): void => {
    localStorage.removeItem('syncToken')
    localStorage.removeItem('username')
    window.location.href = '/'
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 216,
        background: 'var(--sidebar-bg)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        borderRight: '1px solid var(--sidebar-border)'
      }}>
        {/* Brand */}
        <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--sidebar-border)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--sidebar-text-active)', letterSpacing: '-0.01em' }}>
            PersonalAC
          </div>
          <div style={{ fontSize: 11, color: 'var(--sidebar-accent)', marginTop: 2, opacity: 0.8 }}>v1.3</div>
        </div>

        {/* User */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--sidebar-border)', display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(217,119,87,0.2)', border: '1px solid rgba(217,119,87,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: 'var(--sidebar-accent)', flexShrink: 0
          }}>
            {initial}
          </div>
          <div style={{ overflow: 'hidden', minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--sidebar-text-active)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {username}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--sidebar-text)', marginTop: 1 }}>superadmin</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '6px 0' }}>
          {navItems.map((item) => {
            const isActive = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
            return (
              <Link key={item.path} to={item.path} className={`nav-link${isActive ? ' active' : ''}`}>
                <span className="nav-icon"><Icon name={item.icon} size={15} /></span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div style={{ borderTop: '1px solid var(--sidebar-border)', paddingTop: 4 }}>
          <button className="sidebar-logout" onClick={handleLogout}>
            <span style={{ opacity: 0.6, display: 'flex', alignItems: 'center' }}><Icon name="logout" size={14} /></span>
            <span>退出登录</span>
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg)', padding: '30px 36px' }}>
        {children}
      </main>
    </div>
  )
}

export default Layout
