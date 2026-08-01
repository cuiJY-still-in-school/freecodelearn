import React, { useState } from 'react'

const tok = () => localStorage.getItem('syncToken') || ''

const GRADES = ['小学一年级','小学二年级','小学三年级','小学四年级','小学五年级','小学六年级',
  '初中一年级','初中二年级','初中三年级','高中一年级','高中二年级','高中三年级']

const STEPS = ['欢迎', '你的称呼', '添加孩子', '邀请孩子', '下载客户端']

interface Props { onDone: () => void }

export default function OnboardingWizard({ onDone }: Props): React.ReactElement {
  const [step, setStep] = useState(0)
  const [guardianName, setGuardianName] = useState('')
  const [studentName, setStudentName] = useState('')
  const [grade, setGrade] = useState(GRADES[6])
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const host = window.location.origin
  const inviteUrl = inviteCode ? `${host}/join/${inviteCode}` : ''

  async function handleSetupGuardian() {
    if (!guardianName.trim()) { setError('请填写你的称呼'); return }
    setError(''); setLoading(true)
    try {
      await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sync-token': tok() },
        body: JSON.stringify({ guardianName: guardianName.trim() }),
      })
      setStep(2)
    } finally { setLoading(false) }
  }

  async function handleCreateStudent() {
    if (!studentName.trim()) { setError('请填写孩子姓名'); return }
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/auth/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sync-token': tok() },
        body: JSON.stringify({ name: studentName.trim(), grade }),
      }).then(r => r.json())
      if (res.success) { setInviteCode(res.data.inviteCode); setStep(3) }
      else setError(res.error || '创建失败')
    } finally { setLoading(false) }
  }

  function copyInvite() {
    navigator.clipboard.writeText(inviteUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  function finish() {
    localStorage.setItem('pac_onboarding_done', '1')
    onDone()
  }

  const progress = (step / (STEPS.length - 1)) * 100

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, borderRadius: 12, background: 'var(--primary)', marginBottom: 10,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' }}>PersonalAC</div>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{ fontSize: 11, color: i <= step ? 'var(--primary)' : 'var(--text-muted)', fontWeight: i === step ? 700 : 400, transition: 'color .2s' }}>
                {s}
              </div>
            ))}
          </div>
          <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--primary)', borderRadius: 2, width: `${progress}%`, transition: 'width .3s ease' }} />
          </div>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: '32px 36px' }}>

          {/* Step 0: 欢迎 */}
          {step === 0 && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 10 }}>
                欢迎使用 PersonalAC
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, marginBottom: 24 }}>
                PersonalAC 帮助你了解孩子的学习状态——AI 对话辅导、作业批改、成绩追踪、屏幕时间监控，一站完成。
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
                {[
                  { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 3-1.7 5.5-4 6.7V17a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1v-1.3C6.7 14.5 5 12 5 9a7 7 0 0 1 7-7z"/><path d="M10 21h4"/><path d="M12 17v4"/></svg>, text: 'AI 实时辅导，解题 + 学习建议' },
                  { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, text: '六维雷达图，每周自动生成学情报告' },
                  { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>, text: '桌面客户端监控孩子屏幕使用时间' },
                ].map(({ icon, text }) => (
                  <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>{text}
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '11px 0', fontSize: 14 }}
                onClick={() => setStep(1)}>
                开始设置 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 2 }}><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          )}

          {/* Step 1: 你的称呼 */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 6 }}>你怎么称呼？</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>AI 会用这个称呼和你对话</p>
              {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label>称呼</label>
                <input className="form-control" autoFocus value={guardianName}
                  onChange={e => setGuardianName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSetupGuardian()}
                  placeholder="如：张爸爸 / 李妈妈" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setStep(0)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg> 返回</button>
                <button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }}
                  disabled={loading || !guardianName.trim()} onClick={handleSetupGuardian}>
                  {loading ? '保存中…' : '下一步'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: 添加孩子 */}
          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 6 }}>添加孩子账号</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>孩子通过邀请链接激活账号后开始使用</p>
              {error && <div className="alert alert-error" style={{ marginBottom: 14 }}>{error}</div>}
              <div className="form-group">
                <label>孩子姓名</label>
                <input className="form-control" autoFocus value={studentName}
                  onChange={e => setStudentName(e.target.value)}
                  placeholder="孩子的名字" />
              </div>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label>年级</label>
                <select className="form-control" value={grade} onChange={e => setGrade(e.target.value)}>
                  {GRADES.map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setStep(1)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg> 返回</button>
                <button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }}
                  disabled={loading || !studentName.trim()} onClick={handleCreateStudent}>
                  {loading ? '创建中…' : '创建账号'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: 邀请链接 */}
          {step === 3 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 6 }}>把链接发给孩子</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>孩子用这个链接激活账号、设置密码</p>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 12, wordBreak: 'break-all', fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                {inviteUrl}
              </div>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 20 }} onClick={copyInvite}>
                {copied ? (
                  <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}><polyline points="20 6 9 17 4 12"/></svg>已复制</>
                ) : '复制邀请链接'}
              </button>
              <div style={{ padding: '10px 14px', background: 'var(--primary-light)', border: '1px solid var(--primary-ring)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
                链接只能使用一次。孩子在电脑或手机浏览器打开即可激活。
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setStep(2)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg> 返回</button>
                <button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }} onClick={() => setStep(4)}>下一步 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
              </div>
            </div>
          )}

          {/* Step 4: 下载客户端 */}
          {step === 4 && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 6 }}>安装桌面客户端</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                客户端运行在孩子的电脑上，记录屏幕使用时间并同步到这里
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                <a href="/download" onClick={finish}
                  className="btn btn-primary"
                  style={{ justifyContent: 'center', textDecoration: 'none', padding: '11px 0' }}>
                  前往下载页面
                </a>
                <button className="btn btn-secondary" style={{ justifyContent: 'center' }} onClick={finish}>
                  稍后再说，先进入应用
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
                客户端不是必须的，不安装也可以正常使用 AI 对话等功能
              </div>
            </div>
          )}

        </div>

        {/* Skip */}
        {step < 4 && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button onClick={finish} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: 4 }}>
              跳过，直接进入应用
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
