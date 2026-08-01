import React, { useState } from 'react'
import { authApi, StudentRecord } from '../api/http'

interface Props { onDone: () => void }

const GRADES = ['小学低年级', '小学高年级', '初一', '初二', '初三', '高一', '高二', '高三', '大学', '其他']
const SUBJECTS_BY_GRADE: Record<string, string[]> = {
  '初一': ['语文', '数学', '英语', '历史', '地理', '生物'],
  '初二': ['语文', '数学', '英语', '物理', '历史', '地理', '生物'],
  '初三': ['语文', '数学', '英语', '物理', '化学', '历史', '地理', '生物', '政治'],
  '高一': ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'],
  '高二': ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'],
  '高三': ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'],
  '大学': ['高数', '线性代数', '概率论', '英语', '编程', '专业课'],
}
const DEFAULT_SUBJECTS = ['语文', '数学', '英语', '物理', '化学']

type Step = 'guardian' | 'student' | 'token'

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', border: '1px solid var(--border)', borderTop: '3px solid var(--primary)', borderRadius: 12, padding: '40px 40px 36px' }}>
        {children}
      </div>
    </div>
  )
}

export default function Setup({ onDone }: Props): React.ReactElement {
  const [step, setStep] = useState<Step>('guardian')
  const [guardianName, setGuardianName] = useState('')
  const [studentName, setStudentName] = useState('')
  const [grade, setGrade] = useState('')
  const [subjects, setSubjects] = useState<string[]>([])
  const [custom, setCustom] = useState('')
  const [createdStudent, setCreatedStudent] = useState<StudentRecord | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const suggestedSubjects = SUBJECTS_BY_GRADE[grade] ?? DEFAULT_SUBJECTS

  function toggleSubject(s: string) {
    setSubjects(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  async function saveGuardian() {
    if (!guardianName.trim()) { setError('请填写你的称呼'); return }
    setLoading(true); setError('')
    const res = await authApi.setup(guardianName.trim())
    setLoading(false)
    if (res.success) setStep('student')
    else setError(res.error || '保存失败')
  }

  async function createStudent() {
    if (!studentName.trim()) { setError('请填写学生姓名'); return }
    setLoading(true); setError('')
    const allSubjects = [
      ...subjects,
      ...custom.split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean)
    ]
    const res = await authApi.createStudent(studentName.trim(), grade || undefined, allSubjects.length ? allSubjects : undefined)
    setLoading(false)
    if (res.success && res.data) {
      setCreatedStudent(res.data)
      setStep('token')
    } else {
      setError(res.error || '创建失败')
    }
  }

  function copyToken() {
    if (!createdStudent) return
    navigator.clipboard.writeText(createdStudent.token).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // 步骤一：监护人名称
  if (step === 'guardian') return (
    <Card>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>初始配置 1/2</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>你的称呼</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          你是监护人，AI 会用这个称呼和你对话。
        </p>
      </div>
      <div className="form-group" style={{ marginBottom: 24 }}>
        <label style={{ fontWeight: 600 }}>称呼</label>
        <input className="form-control" type="text" placeholder="例如：张爸爸、李妈妈" value={guardianName}
          onChange={e => setGuardianName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && saveGuardian()}
          autoFocus />
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      <button className="btn btn-primary" onClick={saveGuardian} disabled={loading || !guardianName.trim()} style={{ width: '100%', justifyContent: 'center' }}>
        {loading ? '保存中…' : '下一步'}
      </button>
    </Card>
  )

  // 步骤二：学生信息
  if (step === 'student') return (
    <Card>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>初始配置 2/2</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>添加学生账户</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          系统会生成一个访问码，把它发给学生即可登录。
        </p>
      </div>

      <div className="form-group" style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 600 }}>学生姓名</label>
        <input className="form-control" type="text" placeholder="例如：小明" value={studentName}
          onChange={e => setStudentName(e.target.value)} autoFocus />
      </div>

      <div className="form-group" style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 600 }}>年级 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>（可选）</span></label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 6 }}>
          {GRADES.map(g => (
            <button key={g} onClick={() => setGrade(grade === g ? '' : g)} style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
              border: `1px solid ${grade === g ? 'var(--primary)' : 'var(--border)'}`,
              background: grade === g ? 'rgba(217,119,87,0.08)' : 'transparent',
              color: grade === g ? 'var(--primary)' : 'var(--text-secondary)',
              fontWeight: grade === g ? 600 : 400
            }}>{g}</button>
          ))}
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 600 }}>学习科目 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>（可选）</span></label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, margin: '6px 0 10px' }}>
          {suggestedSubjects.map(s => (
            <button key={s} onClick={() => toggleSubject(s)} style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
              border: `1px solid ${subjects.includes(s) ? 'var(--primary)' : 'var(--border)'}`,
              background: subjects.includes(s) ? 'rgba(217,119,87,0.08)' : 'transparent',
              color: subjects.includes(s) ? 'var(--primary)' : 'var(--text-secondary)',
              fontWeight: subjects.includes(s) ? 600 : 400
            }}>{s}</button>
          ))}
        </div>
        <input className="form-control" type="text" placeholder="其他科目（逗号分隔）" value={custom}
          onChange={e => setCustom(e.target.value)} />
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn" onClick={() => setStep('guardian')} style={{ flex: 1, justifyContent: 'center' }}>返回</button>
        <button className="btn btn-primary" onClick={createStudent} disabled={loading || !studentName.trim()} style={{ flex: 2, justifyContent: 'center' }}>
          {loading ? '创建中…' : '创建学生账户'}
        </button>
      </div>
    </Card>
  )

  // 步骤三：展示学生访问码
  return (
    <Card>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>学生访问码</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          把下面的访问码发给 <strong>{createdStudent?.name}</strong>，让他/她用这个码登录同一个网址。学生登录后只有聊天界面。
        </p>
      </div>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>学生访问码</div>
        <div style={{ fontFamily: 'monospace', fontSize: 14, color: 'var(--text)', wordBreak: 'break-all', lineHeight: 1.6 }}>
          {createdStudent?.token}
        </div>
      </div>

      <button className="btn" onClick={copyToken} style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }}>
        {copied ? '已复制' : '复制访问码'}
      </button>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
        访问码可在设置页面重置。监护人可以在设置页面继续添加更多学生。
      </div>

      <button className="btn btn-primary" onClick={onDone} style={{ width: '100%', justifyContent: 'center' }}>
        进入系统
      </button>
    </Card>
  )
}
