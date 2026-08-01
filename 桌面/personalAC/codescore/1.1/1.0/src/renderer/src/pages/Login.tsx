import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../api/ipc'
import { setAuth } from '../App'

function Login(): React.ReactElement {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')

    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码')
      return
    }

    setLoading(true)
    try {
      const result = await authApi.login(username.trim(), password)
      if (result.success && result.data) {
        const data = result.data as { token: string; userId: string; username: string; role: string }
        setAuth(data.token, data.userId, data.username, data.role)
        navigate('/dashboard', { replace: true })
      } else {
        setError(result.error || '登录失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
    >
      <div
        style={{
          width: 400,
          background: 'white',
          borderRadius: 12,
          padding: 40,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🎓</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e1b4b', marginBottom: 6 }}>
            PersonalAC
          </h1>
          <p style={{ color: '#6b7280', fontSize: 13 }}>个性化学习辅助系统</p>
        </div>

        {/* Error */}
        {error && <div className="alert alert-error">{error}</div>}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>用户名</label>
            <input
              className="form-control"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>密码</label>
            <input
              className="form-control"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '10px', marginTop: 8 }}
          >
            {loading ? (
              <>
                <div className="spinner" style={{ width: 16, height: 16 }} />
                登录中...
              </>
            ) : (
              '登录'
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#6b7280' }}>
          还没有账号？{' '}
          <Link to="/register" style={{ color: '#4f46e5', fontWeight: 500 }}>
            立即注册
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Login
