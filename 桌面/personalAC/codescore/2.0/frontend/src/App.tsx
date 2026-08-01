import { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { authApi } from './api/http'
import { UserContext, User } from './context/UserContext'
import { Box, CircularProgress } from '@mui/material'

const StudyPage = lazy(() => import('./pages/study/StudyPage'))
const LoginPage = lazy(() => import('./pages/auth/Login'))
const JoinPage = lazy(() => import('./pages/auth/Join'))
const GuardianDashboard = lazy(() => import('./pages/guardian/Dashboard'))
const GuardianSettings = lazy(() => import('./pages/guardian/Settings'))
const GuardianStudents = lazy(() => import('./pages/guardian/Students'))

type AppState = 'loading' | 'login' | 'app'

export default function App() {
  const [state, setState] = useState<AppState>('loading')
  const [user, setUser] = useState<User | null>(null)
  const navigate = useNavigate()

  useEffect(() => { checkAuth() }, [])

  async function checkAuth() {
    const t = localStorage.getItem('syncToken')
    if (!t) { setState('login'); return }
    const res = await authApi.me()
    if (!res.success || !res.data) { localStorage.removeItem('syncToken'); setState('login'); return }
    setUser(res.data); setState('app')
  }

  function handleLogin(u: User) {
    setUser(u); setState('app')
    navigate(u.role === 'student' ? '/study' : '/guardian')
  }

  function handleLogout() {
    localStorage.removeItem('syncToken'); setUser(null); setState('login'); navigate('/login')
  }

  const spinner = <Box sx={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: 'var(--canvas)' }}><CircularProgress size={32} sx={{ color: 'var(--primary)' }} /></Box>

  if (state === 'loading') return spinner

  if (window.location.pathname.startsWith('/join/')) {
    const code = window.location.pathname.split('/join/')[1]
    return <Suspense fallback={spinner}><JoinPage code={code} onActivated={handleLogin} /></Suspense>
  }

  if (state === 'login') return <Suspense fallback={spinner}><LoginPage onLogin={handleLogin} /></Suspense>

  return (
    <UserContext.Provider value={{ user, setUser }}>
      <Suspense fallback={spinner}>
        <Routes>
          <Route path="/study" element={<StudyPage onLogout={handleLogout} />} />
          <Route path="/study/homework" element={<StudyPage onLogout={handleLogout} mode="homework" />} />
          <Route path="/guardian" element={<GuardianDashboard user={user!} onLogout={handleLogout} />} />
          <Route path="/guardian/settings" element={<GuardianSettings user={user!} onLogout={handleLogout} />} />
          <Route path="/guardian/students" element={<GuardianStudents user={user!} onLogout={handleLogout} />} />
          <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
          <Route path="/" element={<Navigate to={user?.role === 'student' ? '/study' : '/guardian'} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </UserContext.Provider>
  )
}
