import React, { useState, useEffect } from 'react'

interface Props {
  code: string
  onActivated: () => void
}

interface InviteInfo {
  studentName: string
  guardianName: string
  isActivated: boolean
}

export default function Join({ code, onActivated }: Props): React.ReactElement {
  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [fetching, setFetching] = useState(true)
  const [invalid, setInvalid] = useState(false)

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/auth/join/${code.toUpperCase()}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setInfo(d.data)
          setDisplayName(d.data.studentName || '')
        } else {
          setInvalid(true)
        }
      })
      .catch(() => setInvalid(true))
      .finally(() => setFetching(false))
  }, [code])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!displayName.trim()) { setError('请填写你的名字'); return }
    if (password.length < 6) { setError('密码至少 6 位'); return }
    if (password !== confirm) { setError('两次输入的密码不一致'); return }
    setSubmitting(true)
    try {
      const body: Record<string, string> = { displayName: displayName.trim(), password }
      if (email.trim()) body.email = email.trim().toLowerCase()
      const res = await fetch(`/api/auth/join/${code.toUpperCase()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (d.success && d.syncToken) {
        localStorage.setItem('syncToken', d.syncToken)
        setDone(true)
        setTimeout(() => onActivated(), 1200)
      } else {
        setError(d.error || '激活失败，请重试')
      }
    } catch {
      setError('网络错误，请重试')
    }
    setSubmitting(false)
  }

  // ── Shell ──────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, borderRadius: 12, background: 'var(--primary)', marginBottom: 14,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' }}>PersonalAC</div>
        </div>

        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '32px 32px 28px',
          boxShadow: 'var(--shadow-md)',
        }}>

          {/* Loading */}
          {fetching && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 32, height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden', margin: '0 auto 14px' }}>
                <div style={{ height: '100%', background: 'var(--primary)', borderRadius: 2, animation: 'jlb 1.2s ease-in-out infinite' }} />
              </div>
              <style>{`@keyframes jlb { 0%{transform:translateX(-100%)} 100%{transform:translateX(300%)} }`}</style>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>验证邀请码…</div>
            </div>
          )}

          {/* Invalid */}
          {!fetching && invalid && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'var(--danger-bg)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>邀请码无效</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                该邀请码不存在或已失效，请联系老师/家长重新生成
              </p>
              <a href="/" style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                返回首页
              </a>
            </div>
          )}

          {/* Already activated */}
          {!fetching && !invalid && info?.isActivated && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'var(--success-bg)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>账号已激活</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                {info.studentName} 的账号已经激活，直接登录即可
              </p>
              <a href="/" className="btn btn-primary" style={{ display: 'inline-flex' }}>去登录</a>
            </div>
          )}

          {/* Success animation */}
          {done && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: 'var(--success-bg)', border: '1px solid var(--success-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>激活成功！</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>正在跳转…</p>
            </div>
          )}

          {/* Registration form */}
          {!fetching && !invalid && info && !info.isActivated && !done && (
            <>
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{info.guardianName}</span> 邀请你加入
                </div>
                <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.035em', color: 'var(--text)', lineHeight: 1.3 }}>
                  欢迎，{info.studentName}！
                </h1>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 5 }}>
                  设置你的账号信息，开始使用 PersonalAC
                </p>
              </div>

              {error && (
                <div className="alert alert-error" style={{ marginBottom: 18 }}>{error}</div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>
                    你的名字
                  </label>
                  <input
                    className="form-control"
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="显示给老师和家长看的名字"
                    autoFocus
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>
                    邮箱
                    <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>用于异地登录（推荐填写）</span>
                  </label>
                  <input
                    className="form-control"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    autoComplete="email"
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>
                    设置密码
                  </label>
                  <input
                    className="form-control"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="至少 6 位"
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>
                    确认密码
                  </label>
                  <input
                    className="form-control"
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="再次输入密码"
                    onKeyDown={e => { if (e.key === 'Enter') handleSubmit(e as any) }}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                  style={{ marginTop: 6, height: 42, fontSize: 14, fontWeight: 600 }}
                >
                  {submitting ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                      激活中…
                    </span>
                  ) : '激活账号'}
                </button>
              </form>

              <div style={{ textAlign: 'center', marginTop: 20 }}>
                <a href="/" style={{ fontSize: 12, color: 'var(--text-muted)' }}>已有账号？去登录</a>
              </div>
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-muted)' }}>
          邀请码：<code style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }}>{code.toUpperCase()}</code>
        </div>
      </div>
    </div>
  )
}
