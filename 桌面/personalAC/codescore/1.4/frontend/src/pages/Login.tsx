import React, { useState, useRef } from 'react'

interface Props { onLogin: () => void }

type Mode = 'login' | 'register' | 'setup-password' | 'otp-email' | 'otp-code' | 'onboarding'

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 10, background: 'var(--primary)', marginBottom: 12 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>PersonalAC</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: '3px solid var(--primary)', borderRadius: 12, padding: '32px 36px', boxShadow: 'var(--shadow)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

export default function Login({ onLogin }: Props): React.ReactElement {
  const [mode, setMode] = useState<Mode>('otp-email')

  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [displayName, setDisplayName] = useState('')
  const [confirm, setConfirm]     = useState('')
  const [setupToken, setSetupToken] = useState('')

  // OTP
  const [otpEmail, setOtpEmail]         = useState('')
  const [otpCode, setOtpCode]           = useState('')
  const [otpInviteCode, setOtpInviteCode] = useState('')
  const [otpCooldown, setOtpCooldown]   = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const [onboardingName, setOnboardingName] = useState('')
  const [onboardingPwd, setOnboardingPwd]   = useState('')
  const [onboardingPwd2, setOnboardingPwd2] = useState('')
  const [onboardingToken, setOnboardingToken] = useState('')

  const post = async (url: string, body: object, token?: string): Promise<{
    success: boolean; syncToken?: string; needsSetup?: boolean
    data?: Record<string, unknown>; error?: string
  }> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['x-sync-token'] = token
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    return r.json()
  }

  // ── 邮箱登录 ──────────────────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) { setError('请填写邮箱和密码'); return }
    setError(''); setLoading(true)
    try {
      const res = await post('/api/auth/login', { email: email.trim(), password })
      if (res.success && res.syncToken) {
        localStorage.setItem('syncToken', res.syncToken)
        if (res.needsSetup) { setSetupToken(res.syncToken); setMode('setup-password') }
        else { onLogin() }
      } else { setError(res.error || '邮箱或密码错误') }
    } finally { setLoading(false) }
  }

  // ── 注册 ──────────────────────────────────────────────────────────────────
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password || !displayName.trim()) { setError('请填写完整信息'); return }
    if (password.length < 6) { setError('密码至少 6 位'); return }
    if (password !== confirm) { setError('两次密码不一致'); return }
    setError(''); setLoading(true)
    try {
      const res = await post('/api/auth/register', { email: email.trim(), password, displayName: displayName.trim() })
      if (res.success && res.syncToken) {
        localStorage.setItem('syncToken', res.syncToken); onLogin()
      } else { setError(res.error || '注册失败') }
    } finally { setLoading(false) }
  }

  // ── Admin 首次设置密码 ─────────────────────────────────────────────────────
  async function handleSetupPassword(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { setError('密码至少 6 位'); return }
    if (password !== confirm) { setError('两次密码不一致'); return }
    setError(''); setLoading(true)
    try {
      const res = await post('/api/auth/setup-password', { syncToken: setupToken, password })
      if (res.success) { onLogin() } else { setError(res.error || '设置失败') }
    } finally { setLoading(false) }
  }

  // ── 发送 OTP ──────────────────────────────────────────────────────────────
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!otpEmail.trim() || !otpEmail.includes('@')) { setError('请输入有效的邮箱'); return }
    setError(''); setLoading(true)
    try {
      const res = await post('/api/auth/send-otp', { email: otpEmail.trim() })
      if (res.success) {
        setMode('otp-code')
        setOtpCooldown(60)
        if (cooldownRef.current) clearInterval(cooldownRef.current)
        cooldownRef.current = setInterval(() => {
          setOtpCooldown(n => { if (n <= 1) { clearInterval(cooldownRef.current!); return 0 } return n - 1 })
        }, 1000)
      } else { setError(res.error || '发送失败') }
    } finally { setLoading(false) }
  }

  // ── 验证 OTP ──────────────────────────────────────────────────────────────
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    if (otpCode.trim().length !== 6) { setError('请输入 6 位验证码'); return }
    setError(''); setLoading(true)
    try {
      const body: Record<string, string> = { email: otpEmail.trim(), code: otpCode.trim() }
      if (otpInviteCode.trim()) body.inviteCode = otpInviteCode.trim()
      const res = await post('/api/auth/verify-otp', body)
      if (res.success && res.syncToken) {
        localStorage.setItem('syncToken', res.syncToken)
        if (res.needsSetup) {
          setOnboardingToken(res.syncToken)
          setMode('onboarding')
        } else {
          onLogin()
        }
      } else { setError(res.error || '验证失败') }
    } finally { setLoading(false) }
  }

  async function handleResendOtp() {
    if (otpCooldown > 0) return
    setError(''); setLoading(true)
    try {
      const res = await post('/api/auth/send-otp', { email: otpEmail.trim() })
      if (res.success) {
        setOtpCooldown(60)
        if (cooldownRef.current) clearInterval(cooldownRef.current)
        cooldownRef.current = setInterval(() => {
          setOtpCooldown(n => { if (n <= 1) { clearInterval(cooldownRef.current!); return 0 } return n - 1 })
        }, 1000)
      } else { setError(res.error || '发送失败') }
    } finally { setLoading(false) }
  }

  // ── 完成引导设置 ──────────────────────────────────────────────────────────
  async function handleCompleteSetup(e: React.FormEvent) {
    e.preventDefault()
    if (onboardingPwd && onboardingPwd.length < 6) { setError('密码至少 6 位'); return }
    if (onboardingPwd && onboardingPwd !== onboardingPwd2) { setError('两次密码不一致'); return }
    setError(''); setLoading(true)
    try {
      const body: Record<string, string> = { displayName: onboardingName.trim() }
      if (onboardingPwd) body.password = onboardingPwd
      const res = await post('/api/auth/complete-setup', body, onboardingToken)
      if (res.success) { onLogin() } else { setError(res.error || '设置失败') }
    } finally { setLoading(false) }
  }

  const switchMode = (m: Mode) => { setMode(m); setError('') }

  // ── 新用户引导 ────────────────────────────────────────────────────────────
  if (mode === 'onboarding') return (
    <Card>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, color: 'var(--primary)', background: 'var(--primary-light)', padding: '2px 10px', borderRadius: 20, marginBottom: 10, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
          欢迎加入
        </div>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>完善你的账号</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>设置你的昵称，并可选设置一个登录密码（以后也可以用密码直接登录）</p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleCompleteSetup}>
        <div className="form-group">
          <label>你的昵称 <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>可选</span></label>
          <input className="form-control" type="text" value={onboardingName} onChange={e => setOnboardingName(e.target.value)}
            placeholder="怎么称呼你？" autoFocus />
        </div>
        <div className="form-group">
          <label>设置密码 <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>可选，至少 6 位</span></label>
          <input className="form-control" type="password" value={onboardingPwd} onChange={e => setOnboardingPwd(e.target.value)}
            placeholder="留空则仅用验证码登录" autoComplete="new-password" />
        </div>
        {onboardingPwd && (
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>确认密码</label>
            <input className="form-control" type="password" value={onboardingPwd2} onChange={e => setOnboardingPwd2(e.target.value)}
              placeholder="再输入一次" autoComplete="new-password" />
          </div>
        )}
        <button type="submit" disabled={loading} className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: 14, marginTop: onboardingPwd ? 0 : 20 }}>
          {loading ? '保存中…' : '完成，进入应用'}
        </button>
      </form>
      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <button onClick={() => { if (!loading) onLogin() }}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: 0 }}>
          跳过
        </button>
      </div>
    </Card>
  )

  // ── 登录界面 ──────────────────────────────────────────────────────────────
  if (mode === 'login') return (
    <Card>
      <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 20, letterSpacing: '-0.01em' }}>登录账户</h2>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleLogin}>
        <div className="form-group">
          <label>邮箱</label>
          <input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com" autoFocus autoComplete="email" />
        </div>
        <div className="form-group" style={{ marginBottom: 20 }}>
          <label>密码</label>
          <input className="form-control" type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••" autoComplete="current-password" />
        </div>
        <button type="submit" disabled={loading || !email.trim() || !password} className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: 14 }}>
          {loading ? '登录中…' : '登录'}
        </button>
      </form>
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <button onClick={() => switchMode('otp-email')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, fontWeight: 500, padding: 0 }}>
          用验证码登录
        </button>
      </div>
      <div style={{ textAlign: 'center', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>没有账户？</span>{' '}
        <button onClick={() => switchMode('register')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, fontWeight: 500, padding: 0 }}>
          注册
        </button>
      </div>
    </Card>
  )

  // ── 验证码 — 填邮箱 ───────────────────────────────────────────────────────
  if (mode === 'otp-email') return (
    <Card>
      <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.01em' }}>验证码登录</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>验证码将发送至您的邮箱</p>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleSendOtp}>
        <div className="form-group">
          <label>邮箱</label>
          <input className="form-control" type="email" value={otpEmail} onChange={e => setOtpEmail(e.target.value)}
            placeholder="your@email.com" autoFocus autoComplete="email" />
        </div>
        {/* INVITE_CODE_GATE — 取消注释以启用邀请码输入框
        <div className="form-group" style={{ marginBottom: 20 }}>
          <label>
            邀请码
            <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>首次注册必填，老用户留空</span>
          </label>
          <input className="form-control" type="text" value={otpInviteCode}
            onChange={e => setOtpInviteCode(e.target.value.toUpperCase())}
            placeholder="PAC-XXXX-XXXX"
            style={{ letterSpacing: 2, fontFamily: 'monospace' }} />
        </div>
        END_INVITE_CODE_GATE */}
        <button type="submit" disabled={loading || !otpEmail.trim()} className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: 14 }}>
          {loading ? '发送中…' : '发送验证码'}
        </button>
      </form>
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>已有密码账号？</span>{' '}
        <button onClick={() => switchMode('login')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, fontWeight: 500, padding: 0 }}>
          密码登录
        </button>
      </div>
    </Card>
  )

  // ── 验证码 — 填验证码 ─────────────────────────────────────────────────────
  if (mode === 'otp-code') return (
    <Card>
      <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.01em' }}>输入验证码</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
        验证码已发送至 <strong style={{ color: 'var(--text)' }}>{otpEmail}</strong>，10 分钟内有效
      </p>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, padding: '7px 10px', background: 'var(--primary-light)', borderRadius: 6, border: '1px solid var(--primary-ring)' }}>
        若未收到，请检查 <strong>垃圾邮件/垃圾箱</strong>，或等待约 1 分钟后重试
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleVerifyOtp}>
        <div className="form-group" style={{ marginBottom: 20 }}>
          <label>验证码</label>
          <input className="form-control" type="text" value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0,6))}
            placeholder="6 位数字" autoFocus maxLength={6}
            style={{ fontSize: 22, letterSpacing: 8, textAlign: 'center', fontWeight: 700 }} />
        </div>
        <button type="submit" disabled={loading || otpCode.length !== 6} className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: 14 }}>
          {loading ? '验证中…' : '验证并登录'}
        </button>
      </form>
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        {otpCooldown > 0
          ? <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{otpCooldown} 秒后可重新发送</span>
          : <button onClick={handleResendOtp} disabled={loading} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, fontWeight: 500, padding: 0 }}>
              重新发送
            </button>
        }
      </div>
      <div style={{ textAlign: 'center', marginTop: 10 }}>
        <button onClick={() => { switchMode('otp-email'); setOtpCode('') }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 4 }}><polyline points="15 18 9 12 15 6"/></svg>更换邮箱
        </button>
      </div>
    </Card>
  )

  // ── 注册界面 ──────────────────────────────────────────────────────────────
  if (mode === 'register') return (
    <Card>
      <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 20, letterSpacing: '-0.01em' }}>创建账户</h2>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleRegister}>
        <div className="form-group">
          <label>昵称</label>
          <input className="form-control" type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
            placeholder="你的名字" autoFocus />
        </div>
        <div className="form-group">
          <label>邮箱</label>
          <input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com" autoComplete="email" />
        </div>
        <div className="form-group">
          <label>密码 <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>至少 6 位</span></label>
          <input className="form-control" type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••" autoComplete="new-password" />
        </div>
        <div className="form-group" style={{ marginBottom: 20 }}>
          <label>确认密码</label>
          <input className="form-control" type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="••••••••" autoComplete="new-password" />
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: 14 }}>
          {loading ? '注册中…' : '创建账户'}
        </button>
      </form>
      <div style={{ textAlign: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>已有账户？</span>{' '}
        <button onClick={() => switchMode('login')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, fontWeight: 500, padding: 0 }}>
          登录
        </button>
      </div>
    </Card>
  )

  // ── Admin 首次设置密码 ─────────────────────────────────────────────────────
  return (
    <Card>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, color: 'var(--primary)', background: 'var(--primary-light)', padding: '2px 10px', borderRadius: 20, marginBottom: 10, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
          首次登录
        </div>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>设置管理员密码</h2>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleSetupPassword}>
        <div className="form-group">
          <label>密码 <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>至少 6 位</span></label>
          <input className="form-control" type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••" autoFocus autoComplete="new-password" />
        </div>
        <div className="form-group" style={{ marginBottom: 20 }}>
          <label>确认密码</label>
          <input className="form-control" type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="••••••••" autoComplete="new-password" />
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: 14 }}>
          {loading ? '设置中…' : '完成设置'}
        </button>
      </form>
    </Card>
  )
}
