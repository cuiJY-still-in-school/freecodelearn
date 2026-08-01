import { useState, useEffect, useRef } from 'react'
import { Box, TextField, Button, Typography, Alert, CircularProgress } from '@mui/material'
import { authApi } from '../../api/http'
import type { User } from '../../context/UserContext'

type Mode = 'otp-email' | 'otp-code' | 'login' | 'register' | 'setup-password' | 'onboarding'

export default function LoginPage({ onLogin }: { onLogin: (u: User) => void }) {
  const [mode, setMode] = useState<Mode>('otp-email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState('')
  const [tokenInput, setTokenInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [needsSetupUser, setNeedsSetupUser] = useState<any>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (countdown > 0) { const t = setTimeout(() => setCountdown(c => c - 1), 1000); return () => clearTimeout(t) } }, [countdown])

  function handleLoginSuccess(u: User) {
    localStorage.setItem('syncToken', u.sync_token)
    onLogin(u)
  }

  // ── OTP 发送 ────────────────────────────────────
  async function handleSendOtp() {
    if (!email.trim()) { setError('请输入邮箱'); return }
    setLoading(true); setError('')
    const res = await authApi.sendOtp(email.trim())
    if (res.success) { setMode('otp-code'); setCountdown(60) }
    else { setError(res.error || '发送失败') }
    setLoading(false)
  }

  // ── OTP 验证 ────────────────────────────────────
  async function handleVerifyOtp() {
    if (code.length !== 6) { setError('请输入 6 位验证码'); return }
    setLoading(true); setError('')
    const res = await authApi.verifyOtp(email.trim(), code)
    if (res.success) {
      if (res.needsSetup) {
        setNeedsSetupUser({ email: res.email, inviteCode: res.inviteCode })
        setMode('onboarding')
      } else {
        handleLoginSuccess({ ...res.user, sync_token: res.syncToken } as any)
      }
    } else { setError(res.error || '验证失败') }
    setLoading(false)
  }

  // ── 密码登录 ────────────────────────────────────
  async function handlePasswordLogin() {
    if (!email.trim() || !password) { setError('请输入邮箱和密码'); return }
    setLoading(true); setError('')
    const res = await authApi.login(email.trim(), password)
    if (res.success) {
      if (res.needsSetup) { setMode('setup-password'); setTokenInput(res.syncToken) }
      else handleLoginSuccess({ ...res.user, sync_token: res.syncToken } as any)
    } else { setError(res.error || '登录失败') }
    setLoading(false)
  }

  // ── 注册 ────────────────────────────────────────
  async function handleRegister() {
    if (!displayName.trim() || !email.trim() || !password) { setError('请填写所有字段'); return }
    if (password.length < 6) { setError('密码至少 6 位'); return }
    if (password !== password2) { setError('两次密码不一致'); return }
    setLoading(true); setError('')
    const res = await authApi.register(email.trim(), password, displayName.trim())
    if (res.success) handleLoginSuccess({ ...res.user, sync_token: res.syncToken } as any)
    else setError(res.error || '注册失败')
    setLoading(false)
  }

  // ── 设置密码（首次） ──────────────────────────────
  async function handleSetupPassword() {
    if (!password || password.length < 6) { setError('密码至少 6 位'); return }
    if (password !== password2) { setError('两次密码不一致'); return }
    setLoading(true); setError('')
    const res = await authApi.setupPassword(tokenInput, password)
    if (res.success) handleLoginSuccess({ ...res.user, sync_token: res.syncToken } as any)
    else setError(res.error || '设置失败')
    setLoading(false)
  }

  // ── 引导页 ──────────────────────────────────────
  async function handleOnboarding() {
    setLoading(true); setError('')
    const res = await fetch('/api/auth/complete-setup', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sync-token': needsSetupUser?.syncToken || '' },
      body: JSON.stringify({ displayName, password: password || undefined }),
    }).then(r => r.json())
    if (res.success) handleLoginSuccess({ ...res.user, sync_token: res.user?.sync_token } as any)
    else setError(res.error || '设置失败')
    setLoading(false)
  }

  // ── Token 登录 ──────────────────────────────────
  async function handleTokenLogin() {
    if (!tokenInput.trim()) { setError('请输入访问令牌'); return }
    setLoading(true); setError('')
    const res = await authApi.loginToken(tokenInput.trim())
    if (res.success) {
      if (res.needsSetup) { setMode('setup-password') }
      else handleLoginSuccess({ ...res.user, sync_token: res.syncToken } as any)
    } else { setError(res.error || '无效令牌') }
    setLoading(false)
  }

  return (
    <Box className="login-container">
      <Box className="login-card">
        {mode === 'otp-email' && (
          <>
            <Typography variant="h1" sx={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, textAlign: 'center', mb: 0.5, color: 'var(--ink)' }}>PersonalAC</Typography>
            <Typography className="subtitle">验证码登录</Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField fullWidth label="邮箱" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendOtp()} sx={{ mb: 2 }} />
            <Button fullWidth variant="contained" onClick={handleSendOtp} disabled={loading} size="large">{loading ? <CircularProgress size={20} color="inherit" /> : '发送验证码'}</Button>
            <Box className="login-footer" sx={{ mt: 3 }}>
              <button onClick={() => setMode('login')}>密码登录</button>
              <span style={{ margin: '0 8px' }}>·</span>
              <button onClick={() => setMode('register')}>注册</button>
              <span style={{ margin: '0 8px' }}>·</span>
            </Box>
            <Box className="login-footer" sx={{ mt: 0.5 }}>
              <button onClick={() => { const t = prompt('输入访问令牌（Sync Token）'); if (t) { setTokenInput(t); setMode('setup-password') } }} style={{ color: 'var(--muted-soft)' }}>使用访问令牌 →</button>
            </Box>
          </>
        )}

        {mode === 'otp-code' && (
          <>
            <Typography variant="h1" sx={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, textAlign: 'center', mb: 0.5, color: 'var(--ink)' }}>输入验证码</Typography>
            <Typography className="subtitle">已发送至 {email}</Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5, mb: 2.5 }}>
              <input ref={codeRef} className="otp-input" maxLength={1} value={code[0] || ''} onChange={e => { const n = e.target.value.replace(/\D/g, ''); if (n) { const arr = code.split(''); arr[0] = n; setCode(arr.join('')); (codeRef.current?.nextElementSibling as any)?.focus() } }} autoFocus />
              {[1,2,3,4,5].map(i => (
                <input key={i} className="otp-input" maxLength={1} value={code[i] || ''} onChange={e => { const n = e.target.value.replace(/\D/g, ''); const arr = code.split(''); arr[i] = n; setCode(arr.join('')); if (n && i < 5) { const el = e.target as HTMLElement; (el.nextElementSibling as HTMLElement)?.focus() } }} onKeyDown={e => { if (e.key === 'Backspace' && !code[i] && i > 0) { const el = e.target as HTMLElement; (el.previousElementSibling as HTMLElement)?.focus() } }} />
              ))}
            </Box>
            <Button fullWidth variant="contained" onClick={handleVerifyOtp} disabled={loading || code.length < 6} size="large">{loading ? <CircularProgress size={20} color="inherit" /> : '验证并登录'}</Button>
            <Box className="login-footer">
              {countdown > 0 ? <span>{countdown} 秒后可重发</span> : <button onClick={handleSendOtp}>重新发送验证码</button>}
              <br />
              <button onClick={() => setMode('otp-email')}>更换邮箱</button>
            </Box>
          </>
        )}

        {mode === 'login' && (
          <>
            <Typography variant="h1" sx={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, textAlign: 'center', mb: 0.5, color: 'var(--ink)' }}>PersonalAC</Typography>
            <Typography className="subtitle">密码登录</Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField fullWidth label="邮箱" value={email} onChange={e => setEmail(e.target.value)} sx={{ mb: 2 }} />
            <TextField fullWidth label="密码" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePasswordLogin()} sx={{ mb: 2 }} />
            <Button fullWidth variant="contained" onClick={handlePasswordLogin} disabled={loading} size="large">{loading ? <CircularProgress size={20} color="inherit" /> : '登录'}</Button>
            <Box className="login-footer" sx={{ mt: 3 }}>
              <button onClick={() => setMode('otp-email')}>验证码登录</button>
              <span style={{ margin: '0 8px' }}>·</span>
              <button onClick={() => setMode('register')}>注册</button>
            </Box>
          </>
        )}

        {mode === 'register' && (
          <>
            <Typography variant="h1" sx={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, textAlign: 'center', mb: 0.5, color: 'var(--ink)' }}>创建账户</Typography>
            <Typography className="subtitle">开始使用 AI 学伴</Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField fullWidth label="昵称" value={displayName} onChange={e => setDisplayName(e.target.value)} sx={{ mb: 2 }} />
            <TextField fullWidth label="邮箱" value={email} onChange={e => setEmail(e.target.value)} sx={{ mb: 2 }} />
            <TextField fullWidth label="密码（至少 6 位）" type="password" value={password} onChange={e => setPassword(e.target.value)} sx={{ mb: 2 }} />
            <TextField fullWidth label="确认密码" type="password" value={password2} onChange={e => setPassword2(e.target.value)} sx={{ mb: 2 }} />
            <Button fullWidth variant="contained" onClick={handleRegister} disabled={loading} size="large">{loading ? <CircularProgress size={20} color="inherit" /> : '创建账户'}</Button>
            <Box className="login-footer">
              <button onClick={() => setMode('login')}>已有账户？登录</button>
            </Box>
          </>
        )}

        {mode === 'setup-password' && (
          <>
            <Typography variant="h1" sx={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, textAlign: 'center', mb: 0.5, color: 'var(--ink)' }}>设置密码</Typography>
            <Typography className="subtitle">首次登录，请设置管理员密码</Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField fullWidth label="新密码（至少 6 位）" type="password" value={password} onChange={e => setPassword(e.target.value)} sx={{ mb: 2 }} />
            <TextField fullWidth label="确认密码" type="password" value={password2} onChange={e => setPassword2(e.target.value)} sx={{ mb: 2 }} />
            <Button fullWidth variant="contained" onClick={handleSetupPassword} disabled={loading} size="large">{loading ? <CircularProgress size={20} color="inherit" /> : '完成设置'}</Button>
          </>
        )}

        {mode === 'onboarding' && (
          <>
            <Typography variant="h1" sx={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, textAlign: 'center', mb: 0.5, color: 'var(--ink)' }}>完善账号</Typography>
            <Typography className="subtitle">设置你的昵称和密码（可选）</Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField fullWidth label="昵称" value={displayName} onChange={e => setDisplayName(e.target.value)} sx={{ mb: 2 }} />
            <TextField fullWidth label="密码（可选，至少 6 位）" type="password" value={password} onChange={e => setPassword(e.target.value)} sx={{ mb: 2 }} />
            {password && <TextField fullWidth label="确认密码" type="password" value={password2} onChange={e => setPassword2(e.target.value)} sx={{ mb: 2 }} />}
            <Button fullWidth variant="contained" onClick={handleOnboarding} disabled={loading} size="large">{loading ? <CircularProgress size={20} color="inherit" /> : '完成，进入应用'}</Button>
            <Box className="login-footer">
              <button onClick={() => handleOnboarding()}>跳过</button>
            </Box>
          </>
        )}
      </Box>
    </Box>
  )
}
