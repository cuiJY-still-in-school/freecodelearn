import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../api/ipc'
import { setAuth } from '../App'

type Role = 'student' | 'teacher' | 'guardian'

const roleOptions: { value: Role; label: string; desc: string }[] = [
  { value: 'student', label: '学生', desc: '接受个性化学习辅助' },
  { value: 'teacher', label: '教师', desc: '上传资源，查看学习数据' },
  { value: 'guardian', label: '监护人', desc: '监督学生学习进度' }
]

function Register(): React.ReactElement {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState<Role>('student')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!username.trim()) {
      setError('请输入用户名')
      return
    }
    if (username.trim().length < 2) {
      setError('用户名至少 2 个字符')
      return
    }
    if (!password) {
      setError('请输入密码')
      return
    }
    if (password.length < 6) {
      setError('密码至少 6 个字符')
      return
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    setLoading(true)
    try {
      const result = await authApi.register(username.trim(), password, role)
      if (result.success && result.data) {
        const data = result.data as { userId?: string; username?: string; role?: string; message?: string }
        setSuccess(`注册成功！${data.role === 'admin' ? '（您已成为系统管理员）' : ''}`)

        // Auto login after registration
        const loginResult = await authApi.login(username.trim(), password)
        if (loginResult.success && loginResult.data) {
          const loginData = loginResult.data as { token: string; userId: string; username: string; role: string }
          setAuth(loginData.token, loginData.userId, loginData.username, loginData.role)
          setTimeout(() => navigate('/dashboard', { replace: true }), 1000)
        }
      } else {
        setError(result.error || '注册失败')
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
          width: 460,
          background: 'white',
          borderRadius: 12,
          padding: 40,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🎓</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1e1b4b', marginBottom: 4 }}>
            创建账号
          </h1>
          <p style={{ color: '#6b7280', fontSize: 12 }}>加入 PersonalAC 个性化学习系统</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          {/* Role Selection */}
          <div className="form-group">
            <label>选择角色</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {roleOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRole(opt.value)}
                  style={{
                    flex: 1,
                    padding: '10px 8px',
                    borderRadius: 8,
                    border: `2px solid ${role === opt.value ? '#4f46e5' : '#e5e7eb'}`,
                    background: role === opt.value ? '#ede9fe' : 'white',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s'
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      color: role === opt.value ? '#4f46e5' : '#374151',
                      fontSize: 13,
                      marginBottom: 2
                    }}
                  >
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>{opt.desc}</div>
                </button>
              ))}
            </div>
            {role === 'guardian' && (
              <p style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
                💡 提示：系统中第一位注册的监护人将自动成为管理员
              </p>
            )}
          </div>

          <div className="form-group">
            <label>用户名</label>
            <input
              className="form-control"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名（至少2个字符）"
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
              placeholder="请输入密码（至少6个字符）"
            />
          </div>

          <div className="form-group">
            <label>确认密码</label>
            <input
              className="form-control"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="请再次输入密码"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '10px', marginTop: 4 }}
          >
            {loading ? (
              <>
                <div className="spinner" style={{ width: 16, height: 16 }} />
                注册中...
              </>
            ) : (
              '立即注册'
            )}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: '#6b7280' }}>
          已有账号？{' '}
          <Link to="/login" style={{ color: '#4f46e5', fontWeight: 500 }}>
            立即登录
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Register
