import React, { useState, useEffect, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import NotificationBell from './NotificationBell'
import { useUser } from '../context/UserContext'

function Icon({ name, size = 15 }: { name: string; size?: number }): React.ReactElement {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const icons: Record<string, React.ReactElement> = {
    dashboard: <svg width={size} height={size} viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>,
    homework:  <svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>,
    srs:       <svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>,
    chat:      <svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    todo:      <svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
    progress:  <svg width={size} height={size} viewBox="0 0 24 24" {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    grades:    <svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>,
    screen:    <svg width={size} height={size} viewBox="0 0 24 24" {...p}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
    logs:      <svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    tasks:     <svg width={size} height={size} viewBox="0 0 24 24" {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    config:    <svg width={size} height={size} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    logout:    <svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
    accounts:  <svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    download:  <svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    home:      <svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    drive:     <svg width={size} height={size} viewBox="0 0 24 24" {...p}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
    more:      <svg width={size} height={size} viewBox="0 0 24 24" {...p}><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>,
    mistake:   <svg width={size} height={size} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
    sun:       <svg width={size} height={size} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
    moon:      <svg width={size} height={size} viewBox="0 0 24 24" {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  }
  return icons[name] ?? <svg width={size} height={size} viewBox="0 0 24 24"/>
}

// ── Nav arrays ───────────────────────────────────────────────────────────────

const GUARDIAN_NAV = [
  { path: '/',           label: '概览',     icon: 'dashboard' },
  { path: '/chat',       label: 'AI 对话',  icon: 'chat'      },
  { path: '/todo',       label: '待办',     icon: 'todo'      },
  { path: '/homework',   label: '作业批改', icon: 'homework'  },
  { path: '/grades',     label: '成绩记录', icon: 'grades'    },
]

const GUARDIAN_MORE_NAV = [
  { path: '/srs',         label: '间隔复习',   icon: 'srs'      },
  { path: '/mistakes',    label: '错题本',     icon: 'mistake'  },
  { path: '/screen-time', label: '屏幕时间',   icon: 'screen'   },
  { path: '/progress',    label: '学习成就',   icon: 'progress' },
  { path: '/drive',       label: '工作区文件', icon: 'drive'    },
  { path: '/agent-logs',  label: 'Agent 日志', icon: 'logs'     },
  { path: '/agent-tasks', label: '主动任务',   icon: 'tasks'    },
  { path: '/download',    label: '客户端下载', icon: 'download' },
]

const GUARDIAN_ADMIN_NAV = [
  { path: '/accounts', label: '学生账号', icon: 'accounts' },
  { path: '/config',   label: '系统配置', icon: 'config'   },
]

const STUDENT_NAV = [
  { path: '/',         label: '今日',     icon: 'home'    },
  { path: '/chat',     label: 'AI 对话',  icon: 'chat'    },
  { path: '/todo',     label: '待办',     icon: 'todo'    },
  { path: '/srs',      label: '间隔复习', icon: 'srs'     },
  { path: '/homework', label: '作业批改', icon: 'homework'},
  { path: '/grades',   label: '成绩记录', icon: 'grades'  },
]

const STUDENT_MORE_NAV = [
  { path: '/mistakes',    label: '错题本',     icon: 'mistake' },
  { path: '/screen-time', label: '屏幕时间',   icon: 'screen'  },
  { path: '/drive',       label: '工作区文件', icon: 'drive'   },
]

// ── Mobile Bottom Nav ─────────────────────────────────────────────────────────

const GUARDIAN_BOTTOM = GUARDIAN_NAV.slice(0, 4)
const STUDENT_BOTTOM  = STUDENT_NAV.slice(0, 4)

// ── Feedback modal ────────────────────────────────────────────────────────────

const FEEDBACK_TYPES = [
  { value: 'bug',        label: 'Bug 报告' },
  { value: 'suggestion', label: '功能建议' },
  { value: 'other',      label: '其他' },
]

const tok = () => localStorage.getItem('syncToken') || ''

function FeedbackModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const [type, setType] = useState('bug')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sync-token': tok() },
        body: JSON.stringify({ type, message }),
      }).then(r => r.json())
      if (res.success) setDone(true)
    } finally { setLoading(false) }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', zIndex: 999 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1000, width: 420, maxWidth: 'calc(100vw - 32px)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '28px 28px 24px', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>问题反馈</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', borderRadius: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>已收到，感谢反馈</div>
            <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ marginTop: 12 }}>关闭</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {FEEDBACK_TYPES.map(ft => (
                <button key={ft.value} type="button" onClick={() => setType(ft.value)}
                  style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: '1px solid', borderColor: type === ft.value ? 'var(--primary)' : 'var(--border)', background: type === ft.value ? 'var(--primary-light)' : 'transparent', color: type === ft.value ? 'var(--primary)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .12s' }}>
                  {ft.label}
                </button>
              ))}
            </div>
            <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="描述遇到的问题或建议…" rows={5} autoFocus className="form-control" style={{ resize: 'vertical', minHeight: 100 }} />
            <button type="submit" disabled={loading || !message.trim()} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 14, padding: '10px 0' }}>
              {loading ? '提交中…' : '提交反馈'}
            </button>
          </form>
        )}
      </div>
    </>
  )
}

// ── Layout ────────────────────────────────────────────────────────────────────

interface LayoutProps { children: React.ReactNode }

function Layout({ children }: LayoutProps): React.ReactElement {
  const location = useLocation()
  const { role: ctxRole } = useUser()
  const [displayName, setDisplayName] = useState('…')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState(ctxRole)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('pac-theme') as 'light' | 'dark') || 'light'
  )

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.dataset.theme = next
    localStorage.setItem('pac-theme', next)
  }

  useEffect(() => {
    fetch('/api/auth/me', { headers: { 'x-sync-token': tok() } })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          setDisplayName(d.data.displayName || d.data.username || '用户')
          setEmail(d.data.email || '')
          setRole(d.data.role || 'user')
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => { setSheetOpen(false) }, [location.pathname])

  const isStudent = role === 'student'
  const isGuardian = !isStudent
  const mainNav   = isStudent ? STUDENT_NAV   : GUARDIAN_NAV
  const moreNav   = isStudent ? STUDENT_MORE_NAV : GUARDIAN_MORE_NAV
  const bottomNav = isStudent ? STUDENT_BOTTOM : GUARDIAN_BOTTOM
  const initial   = (displayName && displayName !== '…') ? displayName.charAt(0).toUpperCase() : '?'
  const isChat    = location.pathname === '/chat'

  const handleLogout = () => {
    localStorage.removeItem('syncToken')
    window.location.href = '/'
  }

  function isActive(path: string) {
    return path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  }

  function NavSection({ label, items }: { label: string; items: typeof GUARDIAN_NAV }) {
    return (
      <>
        <div className="sidebar-section-label">{label}</div>
        {items.map(item => (
          <Link key={item.path} to={item.path} className={`nav-link${isActive(item.path) ? ' active' : ''}`}>
            <span className="nav-icon"><Icon name={item.icon} size={15} /></span>
            <span className="nav-label">{item.label}</span>
          </Link>
        ))}
      </>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>

      {/* ── Desktop Sidebar ── */}
      <aside className="desktop-sidebar" style={{ width: 210, background: 'var(--sidebar-bg)', display: 'flex', flexDirection: 'column', flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.04)' }}>
        {/* Brand */}
        <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid var(--sidebar-border)' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--sidebar-text-active)', letterSpacing: '-0.03em' }}>PersonalAC</div>
        </div>

        {/* User info */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--sidebar-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(217,119,87,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--sidebar-accent)', flexShrink: 0 }}>
            {initial}
          </div>
          <div style={{ overflow: 'hidden', minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--sidebar-text-active)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
            <div style={{ fontSize: 10.5, color: 'var(--sidebar-text)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email || '用户'}</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '2px 0', overflowY: 'auto' }}>
          <NavSection label={isStudent ? '学习' : '工作区'} items={mainNav} />
          {isGuardian && <NavSection label="管理" items={GUARDIAN_ADMIN_NAV} />}
        </nav>

        {/* Bottom actions */}
        <div style={{ borderTop: '1px solid var(--sidebar-border)', paddingTop: 4, display: 'flex', alignItems: 'center' }}>
          <button className="sidebar-logout" onClick={handleLogout} style={{ flex: 1, width: 'auto' }} title="退出登录">
            <span style={{ opacity: 0.55, display: 'flex', alignItems: 'center' }}><Icon name="logout" size={14} /></span>
            <span className="nav-label">退出登录</span>
          </button>
          <button onClick={() => setFeedbackOpen(true)} title="问题反馈" className="sidebar-icon-btn"><Icon name="feedback" size={14} /></button>
          <button onClick={toggleTheme} title={theme === 'dark' ? '切换亮色' : '切换暗色'} className="sidebar-icon-btn" style={{ marginRight: 8 }}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} />
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="page-enter" style={{ flex: 1, overflow: 'auto', background: 'var(--bg)', padding: isChat ? '16px 28px 24px' : '20px 36px 28px', minWidth: 0 }}>
        {/* Topbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: isChat ? 8 : 4 }}>
          <NotificationBell />
        </div>
        {children}
      </main>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {bottomNav.map(item => (
            <Link key={item.path} to={item.path} className={`bottom-nav-item${isActive(item.path) ? ' active' : ''}`}>
              <Icon name={item.icon} size={22} />
              <span style={{ fontSize: 9.5 }}>{item.label}</span>
            </Link>
          ))}
          <button className={`bottom-nav-item${sheetOpen ? ' active' : ''}`} onClick={() => setSheetOpen(o => !o)}>
            <Icon name="more" size={22} />
            <span style={{ fontSize: 9.5 }}>更多</span>
          </button>
        </div>
      </nav>

      {/* ── Feedback Modal ── */}
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}

      {/* ── Mobile More Sheet ── */}
      {sheetOpen && (
        <>
          <div className="mobile-sheet-overlay" onClick={() => setSheetOpen(false)} />
          <div className="mobile-sheet">
            <div className="mobile-sheet-handle" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 24px 16px' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(217,119,87,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: 'var(--sidebar-accent)', flexShrink: 0 }}>{initial}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sidebar-text-active)' }}>{displayName}</div>
                <div style={{ fontSize: 12, color: 'var(--sidebar-text)', marginTop: 1 }}>{email || '用户'}</div>
              </div>
              <button onClick={toggleTheme} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer', color: 'var(--sidebar-text-hover)', padding: 9, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
              </button>
            </div>
            <hr className="mobile-sheet-divider" />
            {moreNav.map(item => (
              <Link key={item.path} to={item.path} className={`mobile-sheet-nav-item${isActive(item.path) ? ' active' : ''}`} onClick={() => setSheetOpen(false)}>
                <span style={{ opacity: 0.7, display: 'flex' }}><Icon name={item.icon} size={18} /></span>
                <span>{item.label}</span>
              </Link>
            ))}
            {isGuardian && (
              <>
                <hr className="mobile-sheet-divider" />
                {GUARDIAN_ADMIN_NAV.map(item => (
                  <Link key={item.path} to={item.path} className={`mobile-sheet-nav-item${isActive(item.path) ? ' active' : ''}`} onClick={() => setSheetOpen(false)}>
                    <span style={{ opacity: 0.7, display: 'flex' }}><Icon name={item.icon} size={18} /></span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              </>
            )}
            <hr className="mobile-sheet-divider" />
            <button className="mobile-sheet-nav-item" onClick={() => { setSheetOpen(false); setFeedbackOpen(true) }}>
              <span style={{ opacity: 0.7, display: 'flex' }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </span>
              <span>问题反馈</span>
            </button>
            <button className="mobile-sheet-nav-item" onClick={handleLogout} style={{ color: 'var(--danger)' }}>
              <span style={{ opacity: 0.8, display: 'flex' }}><Icon name="logout" size={18} /></span>
              <span>退出登录</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default Layout
