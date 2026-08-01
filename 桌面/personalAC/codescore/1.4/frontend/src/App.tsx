import React, { useState, useEffect, lazy, Suspense, Component } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', color: '#c00', background: '#fff8f8', minHeight: '100vh' }}>
          <h2 style={{ fontSize: 18, marginBottom: 16 }}>渲染错误（请截图反馈）</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#666', marginTop: 12 }}>{this.state.error.stack}</pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}>重新加载</button>
        </div>
      )
    }
    return this.props.children
  }
}

// 懒加载所有页面，首屏只打包 Auth + Shell
const Dashboard   = lazy(() => import('./pages/Dashboard'))
const Config      = lazy(() => import('./pages/Config'))
const AgentLogs   = lazy(() => import('./pages/AgentLogs'))
const AgentTasks  = lazy(() => import('./pages/AgentTasks'))
const Chat        = lazy(() => import('./pages/Chat'))
const Quick       = lazy(() => import('./pages/Quick'))
const Login       = lazy(() => import('./pages/Login'))
const Landing     = lazy(() => import('./pages/Landing'))
const Docs        = lazy(() => import('./pages/Docs'))
const Todo        = lazy(() => import('./pages/Todo'))
const Accounts    = lazy(() => import('./pages/Accounts'))
const Progress    = lazy(() => import('./pages/Progress'))
const Join        = lazy(() => import('./pages/Join'))
const Download    = lazy(() => import('./pages/Download'))
const Homework    = lazy(() => import('./pages/Homework'))
const SRS         = lazy(() => import('./pages/SRS'))
const Grades      = lazy(() => import('./pages/Grades'))
const ScreenTime  = lazy(() => import('./pages/ScreenTime'))
const Drive       = lazy(() => import('./pages/Drive'))
const StudentHome  = lazy(() => import('./pages/StudentHome'))
const MistakeBook  = lazy(() => import('./pages/MistakeBook'))

import SubWall from './components/SubWall'
import Layout from './components/Layout'
import OnboardingWizard from './components/OnboardingWizard'
import { authApi, probeWorkspaceProxy } from './api/http'
import { UserContext } from './context/UserContext'
import { ToastProvider } from './context/ToastContext'

type AppState = 'loading' | 'login' | 'app'

function App(): React.ReactElement {
  const [state, setState] = useState<AppState>('loading')
  const [role, setRole] = useState('user')
  const [userId, setUserId] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Public routes — intercept before auth check
  if (window.location.pathname === '/docs') return <Docs />

  const joinMatch = window.location.pathname.match(/^\/join\/([A-Z0-9]{6,12})$/i)
  if (joinMatch) {
    const code = joinMatch[1].toUpperCase()
    return <Join code={code} onActivated={() => { window.location.href = '/' }} />
  }

  async function checkAuth() {
    const token = localStorage.getItem('syncToken')
    if (!token) { setState('login'); return }
    const res = await authApi.me()
    if (!res.success || !res.data) { localStorage.removeItem('syncToken'); setState('login'); return }
    const userRole = res.data.role || 'user'
    setRole(userRole)
    setUserId(res.data.id || '')
    probeWorkspaceProxy()
    setState('app')
    // 监护人首次登录：没做过引导 且 没有学生
    if (userRole === 'guardian' && !localStorage.getItem('pac_onboarding_done')) {
      const students = await fetch('/api/auth/students', {
        headers: { 'x-sync-token': localStorage.getItem('syncToken') || '' }
      }).then(r => r.json()).catch(() => ({ data: [] }))
      if (!students.data?.length) setShowOnboarding(true)
    }
  }

  useEffect(() => {
    // 版本检测：发现新构建则强制刷新，解决旧缓存加载旧 bundle 问题
    fetch('/version.json', { cache: 'no-store' })
      .then(r => r.json())
      .then(({ v }: { v: number }) => {
        const stored = localStorage.getItem('pac_build_v')
        if (stored && stored !== String(v)) {
          localStorage.setItem('pac_build_v', String(v))
          window.location.reload()
        } else {
          localStorage.setItem('pac_build_v', String(v))
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => { checkAuth() }, [])

  const loadingScreen = (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', gap: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' }}>PersonalAC</div>
      <div style={{ width: 32, height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: 'var(--primary)', borderRadius: 2, animation: 'loading-bar 1.2s ease-in-out infinite' }} />
      </div>
      <style>{`@keyframes loading-bar { 0%{transform:translateX(-100%)} 100%{transform:translateX(300%)} }`}</style>
    </div>
  )

  if (state === 'loading') return <ErrorBoundary>{loadingScreen}</ErrorBoundary>

  if (state === 'login') return (
    <ErrorBoundary>
      <Suspense fallback={loadingScreen}>
        <Landing onLogin={() => checkAuth()} />
      </Suspense>
    </ErrorBoundary>
  )

  const isStudent = role === 'student'

  return (
    <ErrorBoundary>
    <UserContext.Provider value={{ role, userId }}>
      <ToastProvider>
      <SubWall>
      {showOnboarding && <OnboardingWizard onDone={() => setShowOnboarding(false)} />}
      <BrowserRouter>
      <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)', fontSize: 14 }}>加载中…</div>}>
        <Routes>
          <Route path="/"            element={isStudent ? <Layout><StudentHome /></Layout> : <Layout><Dashboard /></Layout>} />
          <Route path="/chat"        element={<Layout><Chat /></Layout>} />
          <Route path="/todo"        element={<Layout><Todo /></Layout>} />
          <Route path="/progress"    element={<Layout><Progress /></Layout>} />
          <Route path="/homework"    element={<Layout><Homework /></Layout>} />
          <Route path="/srs"         element={<Layout><SRS /></Layout>} />
          <Route path="/grades"      element={<Layout><Grades /></Layout>} />
          <Route path="/screen-time" element={<Layout><ScreenTime /></Layout>} />
          <Route path="/drive"    element={<Layout><Drive /></Layout>} />
          <Route path="/mistakes" element={<Layout><MistakeBook /></Layout>} />
          {/* 以下仅监护人可访问 */}
          <Route path="/accounts"    element={isStudent ? <Navigate to="/chat" replace /> : <Layout><Accounts /></Layout>} />
          <Route path="/agent-logs"  element={isStudent ? <Navigate to="/chat" replace /> : <Layout><AgentLogs /></Layout>} />
          <Route path="/agent-tasks" element={isStudent ? <Navigate to="/chat" replace /> : <Layout><AgentTasks /></Layout>} />
          <Route path="/config"      element={isStudent ? <Navigate to="/chat" replace /> : <Layout><Config /></Layout>} />
          <Route path="/download"    element={isStudent ? <Navigate to="/chat" replace /> : <Layout><Download /></Layout>} />
          <Route path="/quick"       element={<Quick />} />
          <Route path="*"            element={<Navigate to={isStudent ? '/chat' : '/'} replace />} />
        </Routes>
      </Suspense>
      </BrowserRouter>
      </SubWall>
      </ToastProvider>
    </UserContext.Provider>
    </ErrorBoundary>
  )
}

export default App
