import React, { useState, useEffect } from 'react'

const tok = () => localStorage.getItem('syncToken') || ''

interface SubStatus {
  active: boolean
  expiresAt: number | null
  daysLeft: number
  wechatId: string
}

export default function SubWall({ children }: { children: React.ReactNode }): React.ReactElement {
  const [status, setStatus] = useState<SubStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    fetch('/api/redeem/status', { headers: { 'x-sync-token': tok() } })
      .then(r => r.json())
      .then(d => { if (d.success) setStatus(d.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setError(''); setSubmitting(true)
    try {
      const res = await fetch('/api/redeem/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sync-token': tok() },
        body: JSON.stringify({ code: code.trim() }),
      })
      const d = await res.json()
      if (d.success) {
        setSuccess(`兑换成功！有效期至 ${d.data.expireStr}`)
        setStatus(prev => prev ? { ...prev, active: true, expiresAt: d.data.expiresAt, daysLeft: 30 } : prev)
      } else {
        setError(d.error || '兑换失败')
      }
    } catch {
      setError('网络错误，请重试')
    }
    setSubmitting(false)
  }

  if (loading) return <>{children}</>

  // 已激活：正常显示，快到期时顶部显示提醒条
  if (status?.active) {
    return (
      <>
        {status.daysLeft <= 7 && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
            background: 'var(--primary)', color: '#fff',
            padding: '8px 20px', fontSize: 13, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          }}>
            <span>订阅将在 <b>{status.daysLeft}</b> 天后到期，联系微信 <b>{status.wechatId}</b> 续期</span>
          </div>
        )}
        {children}
      </>
    )
  }

  // 未激活：显示兑换墙
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'system-ui,-apple-system,sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, background: 'var(--primary)', marginBottom: 14 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' }}>PersonalAC</div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '32px', boxShadow: 'var(--shadow-md)' }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: '0 0 8px', letterSpacing: '-0.02em' }}>需要兑换码才能使用</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65, margin: '0 0 24px' }}>
            免费试用期已结束，需要兑换码继续使用。每个码可激活一次，有效期 <b>30 天</b>。
          </p>

          {success ? (
            <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 9, padding: '14px 16px', fontSize: 14, color: 'var(--success)', marginBottom: 16 }}>
              {success}
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
                  进入应用
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleRedeem} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {error && (
                <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--danger)' }}>
                  {error}
                </div>
              )}
              <input
                className="form-control"
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX"
                autoFocus
                style={{ letterSpacing: '0.08em', fontFamily: 'monospace', fontSize: 15, textAlign: 'center' }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting || !code.trim()}
                style={{ height: 42, fontSize: 14, fontWeight: 600 }}
              >
                {submitting ? '兑换中…' : '激活使用'}
              </button>
            </form>
          )}

          <div style={{ marginTop: 24, padding: '16px', background: 'var(--bg)', borderRadius: 9, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>获取兑换码</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                添加微信 <code style={{ background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>kaixin_jason</code>，
                告知你的邮箱，获取兑换码。
              </div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          已有账号？<button onClick={() => { localStorage.removeItem('syncToken'); window.location.reload() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, fontWeight: 500, padding: 0 }}>切换账号</button>
        </div>
      </div>
    </div>
  )
}
