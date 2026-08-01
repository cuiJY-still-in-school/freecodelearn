import React, { useState } from 'react'
import { authApi } from '../api/http'

interface Props { onLogin: () => void }

export default function Login({ onLogin }: Props): React.ReactElement {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim()) { setError('请输入访问码'); return }
    setError(''); setLoading(true)
    try {
      const res = await authApi.login(token.trim())
      if (res.success) {
        localStorage.setItem('syncToken', token.trim())
        onLogin()
      } else {
        setError(res.error || '访问码错误')
      }
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400, background: '#fff', border: '1px solid var(--border)', borderTop: '3px solid var(--primary)', borderRadius: 12, padding: '40px 40px 36px' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>PersonalAC</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>v1.3</div>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 20 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 24 }}>
            <label htmlFor="token-input" style={{ fontWeight: 600 }}>访问码</label>
            <input
              id="token-input"
              className="form-control"
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="启动时终端显示的访问码"
              autoFocus
              autoComplete="current-password"
              style={{ fontFamily: 'monospace', letterSpacing: '0.04em' }}
            />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              运行 <code style={{ background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: 4 }}>personalac token</code> 查看访问码
            </div>
          </div>
          <button type="submit" disabled={loading || !token.trim()} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '11px 0' }}>
            {loading ? '验证中…' : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}
