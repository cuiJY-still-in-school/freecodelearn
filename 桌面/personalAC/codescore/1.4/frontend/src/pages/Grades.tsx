import React, { useEffect, useState, useCallback } from 'react'
import { getEffectiveStudentId } from '../api/http'
import { useToast } from '../context/ToastContext'

const tok = () => localStorage.getItem('syncToken') || ''

interface Score {
  id: string
  subject: string
  exam_name: string
  score: number
  full_score: number
  exam_date: number
  create_time: number
}

const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治']
const SUBJECT_COLORS: Record<string, string> = {
  语文: '#D97757', 数学: '#6366F1', 英语: '#0EA5E9', 物理: '#10B981',
  化学: '#F59E0B', 生物: '#8B5CF6', 历史: '#EC4899', 地理: '#14B8A6', 政治: '#F97316',
}

function pct(score: number, full: number) { return Math.round((score / full) * 100) }

function MiniLineChart({ data }: { data: Score[] }): React.ReactElement {
  if (data.length < 2) return (
    <div style={{ height: 40, display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-muted)' }}>数据不足</div>
  )
  const sorted = [...data].sort((a, b) => a.exam_date - b.exam_date)
  const vals = sorted.map(s => pct(s.score, s.full_score))
  const min = Math.min(...vals), max = Math.max(...vals)
  const range = Math.max(max - min, 10)
  const W = 160, H = 44, pad = 4
  const points = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (W - pad * 2)
    const y = H - pad - ((v - min) / range) * (H - pad * 2)
    return `${x},${y}`
  }).join(' ')
  const color = SUBJECT_COLORS[data[0].subject] || 'var(--primary)'
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {vals.map((v, i) => {
        const [x, y] = points.split(' ')[i].split(',').map(Number)
        return <circle key={i} cx={x} cy={y} r={3} fill={color} />
      })}
    </svg>
  )
}

export default function Grades(): React.ReactElement {
  const { toast } = useToast()
  const [scores, setScores] = useState<Score[]>([])
  const [studentId, setStudentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const [subject, setSubject] = useState(SUBJECTS[0])
  const [customSubject, setCustomSubject] = useState('')
  const [examName, setExamName] = useState('')
  const [score, setScore] = useState('')
  const [fullScore, setFullScore] = useState('100')
  const [examDate, setExamDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  useEffect(() => {
    getEffectiveStudentId().then(id => { setStudentId(id); if (!id) setLoading(false) })
  }, [])

  const load = useCallback(() => {
    if (!studentId) return
    fetch(`/api/scores/${studentId}`, { headers: { 'x-sync-token': tok() } })
      .then(r => r.json())
      .then(d => { if (d.success) setScores(d.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [studentId])

  useEffect(() => { load() }, [load])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const sub = subject === '其他' ? customSubject.trim() : subject
    if (!sub || !examName.trim() || !score || !examDate) return
    setSaving(true)
    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sync-token': tok() },
        body: JSON.stringify({
          student_id: studentId,
          subject: sub,
          exam_name: examName.trim(),
          score: Number(score),
          full_score: Number(fullScore) || 100,
          exam_date: new Date(examDate).getTime(),
        }),
      }).then(r => r.json()).catch(() => null)
      if (res?.success !== false) {
        toast('成绩已添加')
        setShowForm(false); setExamName(''); setScore(''); setFullScore('100')
        load()
      } else {
        toast(res?.error || '添加失败', 'error')
      }
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (pendingDelete !== id) {
      setPendingDelete(id)
      setTimeout(() => setPendingDelete(null), 3000)
      return
    }
    setPendingDelete(null)
    await fetch(`/api/scores/${id}`, { method: 'DELETE', headers: { 'x-sync-token': tok() } })
    setScores(prev => prev.filter(s => s.id !== id))
    toast('已删除')
  }

  // 按科目分组
  const bySubject = scores.reduce<Record<string, Score[]>>((acc, s) => {
    ;(acc[s.subject] ??= []).push(s)
    return acc
  }, {})

  const subjects = Object.keys(bySubject).sort()
  const recentScores = [...scores].sort((a, b) => b.exam_date - a.exam_date).slice(0, 10)

  // 全局汇总
  const totalExams = scores.length
  const avgPct = totalExams > 0 ? Math.round(scores.reduce((s, x) => s + pct(x.score, x.full_score), 0) / totalExams) : 0
  const bestScore = scores.reduce<Score | null>((best, s) => {
    if (!best) return s
    return pct(s.score, s.full_score) > pct(best.score, best.full_score) ? s : best
  }, null)

  return (
    <div className="page-enter">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.035em', margin: 0, color: 'var(--text)' }}>成绩记录</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '3px 0 0' }}>记录每次考试成绩，追踪各科趋势</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)}>
          {showForm ? '取消' : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>录入成绩</>}
        </button>
      </div>

      {/* 录入表单 */}
      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>录入考试成绩</h3>
          <form onSubmit={handleAdd}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>科目</label>
                <select value={subject} onChange={e => setSubject(e.target.value)} className="form-control" style={{ fontSize: 13 }}>
                  {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                  <option value="其他">其他</option>
                </select>
              </div>
              {subject === '其他' && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>科目名称</label>
                  <input className="form-control" value={customSubject} onChange={e => setCustomSubject(e.target.value)} placeholder="自定义科目" style={{ fontSize: 13 }} />
                </div>
              )}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>考试名称</label>
                <input className="form-control" value={examName} onChange={e => setExamName(e.target.value)} placeholder="如：期中考试" style={{ fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>考试日期</label>
                <input className="form-control" type="date" value={examDate} onChange={e => setExamDate(e.target.value)} style={{ fontSize: 13 }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>得分</label>
                <input className="form-control" type="number" inputMode="numeric" value={score} onChange={e => setScore(e.target.value)} placeholder="85" min="0" style={{ fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>满分</label>
                <input className="form-control" type="number" inputMode="numeric" value={fullScore} onChange={e => setFullScore(e.target.value)} placeholder="100" min="1" style={{ fontSize: 13 }} />
              </div>
            </div>
            <button type="submit" disabled={saving} className="btn btn-primary btn-sm">{saving ? '保存中…' : '保存'}</button>
          </form>
        </div>
      )}

      {loading ? (
        <div>
          <div className="grid-3" style={{ marginBottom: 24 }}>
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 84, borderRadius: 10 }} />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 96, borderRadius: 10 }} />)}
          </div>
          <div className="skeleton" style={{ height: 200, borderRadius: 10 }} />
        </div>
      ) : scores.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>暂无成绩记录</div>
          <div style={{ fontSize: 13 }}>点击「录入成绩」开始记录</div>
        </div>
      ) : (
        <>
          {/* 汇总统计 */}
          <div className="grid-3" style={{ marginBottom: 24 }}>
            <div className="stat-card">
              <div className="stat-label" style={{ marginBottom: 8 }}>累计考试</div>
              <div className="stat-value">{totalExams}</div>
              <div className="stat-sub">{subjects.length} 个科目</div>
            </div>
            <div className="stat-card">
              <div className="stat-label" style={{ marginBottom: 8 }}>平均得分率</div>
              <div className="stat-value" style={{ color: avgPct >= 80 ? 'var(--success)' : avgPct >= 60 ? 'var(--text)' : 'var(--danger)' }}>{avgPct}<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)' }}>%</span></div>
              <div className="stat-sub">所有科目综合</div>
            </div>
            <div className="stat-card">
              <div className="stat-label" style={{ marginBottom: 8 }}>最高得分率</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>
                {bestScore ? pct(bestScore.score, bestScore.full_score) : '—'}<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)' }}>{bestScore ? '%' : ''}</span>
              </div>
              <div className="stat-sub">{bestScore ? `${bestScore.subject} · ${bestScore.exam_name}` : '暂无'}</div>
            </div>
          </div>

          {/* 各科趋势 */}
          {subjects.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>各科趋势</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {subjects.map(sub => {
                  const data = bySubject[sub].sort((a, b) => a.exam_date - b.exam_date)
                  const latest = data[data.length - 1]
                  const latestPct = pct(latest.score, latest.full_score)
                  const color = SUBJECT_COLORS[sub] || 'var(--primary)'
                  return (
                    <div key={sub} className="card" style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color }}>{sub}</span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{latestPct}<span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>%</span></span>
                      </div>
                      <MiniLineChart data={data} />
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                        最近：{latest.exam_name} · {latest.score}/{latest.full_score}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 最近成绩列表 */}
          <div className="card">
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>最近记录</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {recentScores.map(s => {
                const p = pct(s.score, s.full_score)
                const color = SUBJECT_COLORS[s.subject] || 'var(--primary)'
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color, width: 36, flexShrink: 0 }}>{s.subject}</span>
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{s.exam_name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: p >= 90 ? 'var(--success)' : p >= 75 ? 'var(--text)' : 'var(--danger)' }}>
                      {s.score}<span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>/{s.full_score}</span>
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 52, textAlign: 'right', flexShrink: 0 }}>
                      {new Date(s.exam_date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                    </span>
                    <button onClick={() => handleDelete(s.id)} style={{
                      background: pendingDelete === s.id ? 'var(--danger-bg)' : 'none',
                      border: pendingDelete === s.id ? '1px solid var(--danger-border)' : 'none',
                      cursor: 'pointer', color: 'var(--danger)', fontSize: 11,
                      padding: pendingDelete === s.id ? '2px 6px' : '2px 4px', borderRadius: 4,
                      lineHeight: 1, fontWeight: pendingDelete === s.id ? 600 : 400, transition: 'all .12s',
                      display: 'inline-flex', alignItems: 'center',
                    }}>{pendingDelete === s.id ? '确认?' : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}</button>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
