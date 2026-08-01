import React, { useEffect, useState, useCallback } from 'react'
import { useToast } from '../context/ToastContext'

const tok = () => localStorage.getItem('syncToken') || ''
const BASE = '/api/mistakes'

interface Mistake {
  id: string
  subject: string
  topic: string
  question: string | null
  student_answer: string | null
  correct_answer: string | null
  error_type: string | null
  root_cause: string | null
  reviewed: number
  review_count: number
  create_time: number
  last_review_at: number | null
}

interface Stats { total: number; unreviewed: number; reviewed_count: number }

const ERROR_TYPE_COLORS: Record<string, string> = {
  '计算错误':   '#f59e0b',
  '概念混淆':   '#ef4444',
  '步骤遗漏':   '#8b5cf6',
  '审题失误':   '#3b82f6',
  '公式记错':   '#ec4899',
  '其他':       '#6b7280',
}

function ErrorBadge({ type }: { type: string | null }): React.ReactElement | null {
  if (!type) return null
  const color = ERROR_TYPE_COLORS[type] ?? ERROR_TYPE_COLORS['其他']
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 99,
      fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
      background: color + '22', color, border: `1px solid ${color}44`
    }}>
      {type}
    </span>
  )
}

function MistakeCard({
  m,
  onReview,
  onDelete,
}: {
  m: Mistake
  onReview: (id: string) => void
  onDelete: (id: string) => void
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const date = new Date(m.create_time).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })

  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${m.reviewed ? 'var(--success,#22c55e)' : 'var(--primary,#d97757)'}`,
      borderRadius: 8,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
          {m.subject}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{m.topic}</span>
        <ErrorBadge type={m.error_type} />
        {m.reviewed === 1 && (
          <span style={{ fontSize: 11, color: 'var(--success,#22c55e)', marginLeft: 'auto', fontWeight: 600 }}>
            已复习 {m.review_count > 1 ? `×${m.review_count}` : ''}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: m.reviewed ? 0 : 'auto' }}>{date}</span>
      </div>

      {/* Root cause */}
      {m.root_cause && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-muted,rgba(0,0,0,.04))', borderRadius: 5, padding: '4px 8px' }}>
          根因：{m.root_cause}
        </div>
      )}

      {/* Expandable detail */}
      {(m.question || m.student_answer || m.correct_answer) && (
        <>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--primary,#d97757)', fontSize: 12, textAlign: 'left',
              padding: 0, fontWeight: 500,
            }}
          >
            {expanded ? '收起详情 ▲' : '展开题目 ▼'}
          </button>
          {expanded && (
            <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {m.question && (
                <div>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>题目：</span>
                  <span style={{ color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{m.question}</span>
                </div>
              )}
              {m.student_answer && (
                <div>
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>我的答案：</span>
                  <span style={{ color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{m.student_answer}</span>
                </div>
              )}
              {m.correct_answer && (
                <div>
                  <span style={{ color: '#22c55e', fontWeight: 600 }}>正确答案：</span>
                  <span style={{ color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{m.correct_answer}</span>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
        {m.reviewed === 0 && (
          <button
            className="btn btn-primary"
            style={{ padding: '3px 12px', fontSize: 12 }}
            onClick={() => onReview(m.id)}
          >
            标记已复习
          </button>
        )}
        <button
          style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 5,
            cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: '3px 10px',
          }}
          onClick={() => onDelete(m.id)}
        >
          删除
        </button>
      </div>
    </div>
  )
}

export default function MistakeBook(): React.ReactElement {
  const { toast: addToast } = useToast()
  const [mistakes, setMistakes] = useState<Mistake[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, unreviewed: 0, reviewed_count: 0 })
  const [subjects, setSubjects] = useState<string[]>([])
  const [status, setStatus] = useState<'unreviewed' | 'reviewed' | 'all'>('unreviewed')
  const [subject, setSubject] = useState('')
  const [loading, setLoading] = useState(false)
  const [studentId, setStudentId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/me', { headers: { 'x-sync-token': tok() } })
      .then(r => r.json()).then(d => {
        if (!d.success) return
        if (d.data.role === 'student') { setStudentId(d.data.id); return }
        fetch('/api/auth/students', { headers: { 'x-sync-token': tok() } })
          .then(r => r.json()).then(s => { if (s.data?.[0]?.id) setStudentId(s.data[0].id) }).catch(() => {})
      }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    if (!studentId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ status, limit: '100' })
      if (subject) params.set('subject', subject)
      const res = await fetch(`${BASE}/${studentId}?${params}`, {
        headers: { 'x-sync-token': tok() }
      })
      const json = await res.json()
      if (json.success) {
        setMistakes(json.data)
        setStats(json.stats)
        setSubjects(json.subjects)
      }
    } catch { addToast('加载失败', 'error') }
    finally { setLoading(false) }
  }, [studentId, status, subject, addToast])

  useEffect(() => { load() }, [load])

  const handleReview = async (id: string) => {
    try {
      const res = await fetch(`${BASE}/${id}/review`, {
        method: 'POST', headers: { 'x-sync-token': tok() }
      })
      const json = await res.json()
      if (json.success) { addToast('已标记为复习完毕', 'success'); load() }
    } catch { addToast('操作失败', 'error') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('删除这道错题？')) return
    try {
      const res = await fetch(`${BASE}/${id}`, {
        method: 'DELETE', headers: { 'x-sync-token': tok() }
      })
      const json = await res.json()
      if (json.success) { addToast('已删除', 'success'); load() }
    } catch { addToast('删除失败', 'error') }
  }

  return (
    <div className="page-header" style={{ maxWidth: 700 }}>
      <h1 style={{ marginBottom: 4 }}>错题本</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 14 }}>
        AI 对话中发现的错题，按知识点归档
      </p>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: '全部错题', value: stats.total, active: status === 'all' },
          { label: '待复习', value: stats.unreviewed, active: status === 'unreviewed', accent: true },
          { label: '已复习', value: stats.reviewed_count, active: status === 'reviewed' },
        ].map(s => (
          <button
            key={s.label}
            onClick={() => setStatus(s.label === '全部错题' ? 'all' : s.label === '待复习' ? 'unreviewed' : 'reviewed')}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 6,
              background: s.active ? 'var(--primary,#d97757)' : 'var(--card-bg)',
              border: `1px solid ${s.active ? 'var(--primary,#d97757)' : 'var(--border)'}`,
              borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
              color: s.active ? '#fff' : 'var(--text)',
            }}
          >
            <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{s.value}</span>
            <span style={{ fontSize: 12, opacity: 0.85 }}>{s.label}</span>
          </button>
        ))}
      </div>

      {/* Subject filter */}
      {subjects.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            onClick={() => setSubject('')}
            style={{
              fontSize: 12, padding: '3px 10px', borderRadius: 99, cursor: 'pointer',
              background: !subject ? 'var(--primary,#d97757)' : 'none',
              border: `1px solid ${!subject ? 'var(--primary,#d97757)' : 'var(--border)'}`,
              color: !subject ? '#fff' : 'var(--text)',
            }}
          >全部科目</button>
          {subjects.map(s => (
            <button
              key={s}
              onClick={() => setSubject(prev => prev === s ? '' : s)}
              style={{
                fontSize: 12, padding: '3px 10px', borderRadius: 99, cursor: 'pointer',
                background: subject === s ? 'var(--primary,#d97757)' : 'none',
                border: `1px solid ${subject === s ? 'var(--primary,#d97757)' : 'var(--border)'}`,
                color: subject === s ? '#fff' : 'var(--text)',
              }}
            >{s}</button>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>加载中…</div>
      ) : mistakes.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 60, fontSize: 14 }}>
          {status === 'unreviewed' ? '没有待复习的错题，继续保持！' : '暂无记录'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {mistakes.map(m => (
            <MistakeCard key={m.id} m={m} onReview={handleReview} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
