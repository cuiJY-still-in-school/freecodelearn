import { useState, useEffect } from 'react'
import { Box, TextField, Button, Typography, Alert, CircularProgress } from '@mui/material'
import { authApi } from '../../api/http'

export default function JoinPage({ code, onActivated }: { code: string; onActivated: (u: any) => void }) {
  const [info, setInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    authApi.joinInfo(code).then(res => { setInfo(res.data || null); setLoading(false) })
  }, [code])

  async function handleActivate() {
    if (!password || password.length < 6) { setError('密码至少 6 位'); return }
    if (password !== password2) { setError('两次密码不一致'); return }
    setSubmitting(true); setError('')
    const res = await authApi.joinActivate(code, password, displayName || undefined, email || undefined)
    if (res.success) {
      setDone(true)
      localStorage.setItem('syncToken', res.syncToken)
      setTimeout(() => onActivated({ ...res.user, sync_token: res.syncToken }), 1200)
    } else {
      setError(res.error || '激活失败')
      setSubmitting(false)
    }
  }

  if (loading) return <Box className="login-container"><CircularProgress size={32} /></Box>
  if (!info) return <Box className="login-container"><Box className="login-card"><Typography variant="h5" textAlign="center" gutterBottom>邀请码无效</Typography><Typography color="text.secondary" textAlign="center">请检查链接，或联系你的家长获取新的邀请码</Typography></Box></Box>
  if (info.isActivated) return <Box className="login-container"><Box className="login-card"><Typography variant="h5" textAlign="center" gutterBottom>账号已激活</Typography><Typography color="text.secondary" textAlign="center">{info.studentName} 的账号已经激活过，请直接登录</Typography></Box></Box>
  if (done) return <Box className="login-container"><Box className="login-card"><Typography variant="h5" textAlign="center" gutterBottom>激活成功！</Typography><Typography color="text.secondary" textAlign="center">正在为你跳转...</Typography></Box></Box>

  return (
    <Box className="login-container">
      <Box className="login-card">
        <Typography variant="h1" sx={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, textAlign: 'center', mb: 0.5, color: 'var(--ink)' }}>加入 PersonalAC</Typography>
        <Typography className="subtitle">{info.guardianName} 邀请 {info.studentName} 加入学习</Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <TextField fullWidth label="你的名字（可选）" value={displayName} onChange={e => setDisplayName(e.target.value)} sx={{ mb: 2 }} />
        <TextField fullWidth label="邮箱（可选）" value={email} onChange={e => setEmail(e.target.value)} sx={{ mb: 2 }} />
        <TextField fullWidth label="设置密码（至少 6 位）" type="password" value={password} onChange={e => setPassword(e.target.value)} sx={{ mb: 2 }} />
        <TextField fullWidth label="确认密码" type="password" value={password2} onChange={e => setPassword2(e.target.value)} sx={{ mb: 2 }} />
        <Button fullWidth variant="contained" onClick={handleActivate} disabled={submitting} size="large">
          {submitting ? <CircularProgress size={20} color="inherit" /> : '激活并登录'}
        </Button>
      </Box>
    </Box>
  )
}
