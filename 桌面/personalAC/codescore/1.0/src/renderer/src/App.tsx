import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Plans from './pages/Plans'
import Resources from './pages/Resources'
import BotManager from './pages/BotManager'
import Settings from './pages/Settings'
import AgentLogs from './pages/AgentLogs'
import Layout from './components/Layout'

interface AuthState {
  token: string | null
  userId: string | null
  username: string | null
  role: string | null
}

function AuthGuard({ children }: { children: React.ReactNode }): React.ReactElement {
  const navigate = useNavigate()
  const location = useLocation()
  const [checking, setChecking] = useState(true)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      navigate('/login', { replace: true, state: { from: location.pathname } })
      setChecking(false)
      return
    }

    // Verify token is still valid
    window.api.auth.verifyToken(token).then((result) => {
      if (result.success) {
        setAuthed(true)
      } else {
        localStorage.removeItem('token')
        localStorage.removeItem('userId')
        localStorage.removeItem('username')
        localStorage.removeItem('role')
        navigate('/login', { replace: true, state: { from: location.pathname } })
      }
      setChecking(false)
    })
  }, [navigate, location.pathname])

  if (checking) {
    return (
      <div className="loading">
        <div className="spinner" />
        验证登录状态...
      </div>
    )
  }

  if (!authed) return <></>

  return <>{children}</>
}

export function getAuth(): AuthState {
  return {
    token: localStorage.getItem('token'),
    userId: localStorage.getItem('userId'),
    username: localStorage.getItem('username'),
    role: localStorage.getItem('role')
  }
}

export function setAuth(token: string, userId: string, username: string, role: string): void {
  localStorage.setItem('token', token)
  localStorage.setItem('userId', userId)
  localStorage.setItem('username', username)
  localStorage.setItem('role', role)
}

export function clearAuth(): void {
  localStorage.removeItem('token')
  localStorage.removeItem('userId')
  localStorage.removeItem('username')
  localStorage.removeItem('role')
}

function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={
            <AuthGuard>
              <Layout>
                <Dashboard />
              </Layout>
            </AuthGuard>
          }
        />
        <Route
          path="/plans"
          element={
            <AuthGuard>
              <Layout>
                <Plans />
              </Layout>
            </AuthGuard>
          }
        />
        <Route
          path="/resources"
          element={
            <AuthGuard>
              <Layout>
                <Resources />
              </Layout>
            </AuthGuard>
          }
        />
        <Route
          path="/bots"
          element={
            <AuthGuard>
              <Layout>
                <BotManager />
              </Layout>
            </AuthGuard>
          }
        />
        <Route
          path="/settings"
          element={
            <AuthGuard>
              <Layout>
                <Settings />
              </Layout>
            </AuthGuard>
          }
        />
        <Route
          path="/agent-logs"
          element={
            <AuthGuard>
              <Layout>
                <AgentLogs />
              </Layout>
            </AuthGuard>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
