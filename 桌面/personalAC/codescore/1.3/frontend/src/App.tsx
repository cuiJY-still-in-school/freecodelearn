import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Plans from './pages/Plans'
import Config from './pages/Config'
import AgentLogs from './pages/AgentLogs'
import AgentTasks from './pages/AgentTasks'
import Chat from './pages/Chat'
import Quick from './pages/Quick'
import StudentChat from './pages/StudentChat'
import Login from './pages/Login'
import Setup from './pages/Setup'
import Layout from './components/Layout'
import { authApi, probeWorkspaceProxy } from './api/http'

type AppState = 'loading' | 'login' | 'setup' | 'guardian' | 'student'

function App(): React.ReactElement {
  const [state, setState] = useState<AppState>('loading')

  async function checkAuth() {
    const token = localStorage.getItem('syncToken')
    if (!token) { setState('login'); return }
    const res = await authApi.me()
    if (!res.success || !res.data) { setState('login'); return }

    const user = res.data
    probeWorkspaceProxy()

    if (user.role === 'student') {
      setState('student')
    } else if (!user.displayName) {
      // 监护人未完成初始配置
      setState('setup')
    } else {
      setState('guardian')
    }
  }

  useEffect(() => { checkAuth() }, [])

  if (state === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>加载中…</div>
      </div>
    )
  }

  if (state === 'login') return <Login onLogin={() => checkAuth()} />
  if (state === 'setup') return <Setup onDone={() => checkAuth()} />

  // 学生：只有聊天界面
  if (state === 'student') return <StudentChat />

  // 监护人：完整界面
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout><Dashboard /></Layout>} />
        <Route path="/chat" element={<Layout><Chat /></Layout>} />
        <Route path="/plans" element={<Layout><Plans /></Layout>} />
        <Route path="/agent-logs" element={<Layout><AgentLogs /></Layout>} />
        <Route path="/agent-tasks" element={<Layout><AgentTasks /></Layout>} />
        <Route path="/config" element={<Layout><Config /></Layout>} />
        <Route path="/quick" element={<Quick />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
