import React, { useEffect, useState } from 'react'
import { srsApi, type SRSItem } from '../api/http'

const GRADE_LABELS = [
  { g: 0, label: '完全忘了', color: '#ef4444' },
  { g: 2, label: '记得一点', color: '#f97316' },
  { g: 3, label: '勉强记得', color: '#eab308' },
  { g: 4, label: '基本掌握', color: '#22c55e' },
  { g: 5, label: '完全掌握', color: '#16a34a' },
]

function ConfidenceBar({ v }: { v: number }): React.ReactElement {
  const pct = Math.round(v * 100)
  const color = pct < 40 ? 'var(--danger)' : pct < 60 ? 'var(--orange)' : 'var(--success)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700, width: 30, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

export default function SRS(): React.ReactElement {
  const [items, setItems] = useState<SRSItem[]>([])
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [grading, setGrading] = useState(false)
  const [done, setDone] = useState(false)
  const [reviewed, setReviewed] = useState(0)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await srsApi.getDue()
    if (res.success && res.data) setItems(res.data)
    setLoading(false)
    setDone(false)
    setCurrent(0)
    setReviewed(0)
    setRevealed(false)
  }

  async function grade(g: number) {
    if (grading || current >= items.length) return
    const item = items[current]
    setGrading(true)
    await srsApi.review(item.id, g)
    setGrading(false)
    setReviewed(v => v + 1)
    if (current + 1 >= items.length) {
      setDone(true)
    } else {
      setCurrent(v => v + 1)
      setRevealed(false)
    }
  }

  if (loading) return (
    <div className="page-enter">
      <div style={{ marginBottom: 24 }}>
        <div className="skeleton" style={{ height: 28, width: 120, borderRadius: 6, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 16, width: 200, borderRadius: 4 }} />
      </div>
      <div className="skeleton" style={{ height: 4, borderRadius: 2, marginBottom: 20 }} />
      <div className="skeleton" style={{ height: 240, borderRadius: 12, marginBottom: 16 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: 52, borderRadius: 8 }} />)}
      </div>
    </div>
  )

  if (done || (items.length === 0)) {
    return (
      <div className="page-enter">
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.035em', color: 'var(--text)', marginBottom: 4 }}>间隔复习</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>基于 SM-2 算法，在最佳时间复习薄弱知识点</p>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: done ? 'var(--success-bg)' : 'var(--bg-secondary)', border: `1px solid ${done ? 'var(--success-border)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={done ? 'var(--success)' : 'var(--text-muted)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
          </div>
          {done ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>今日复习完成！</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>共复习 {reviewed} 个知识点，坚持每天复习效果最佳。</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>暂无待复习知识点</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>继续学习新内容，AI 会自动添加需要复习的知识点。</div>
            </>
          )}
          <button className="btn btn-primary" onClick={load}>刷新</button>
        </div>
      </div>
    )
  }

  const item = items[current]
  const progress = (current / items.length) * 100

  return (
    <div className="page-enter">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.035em', color: 'var(--text)', marginBottom: 4 }}>间隔复习</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>今日待复习 {items.length} 个知识点</p>
        </div>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{current + 1} / {items.length}</span>
      </div>

      {/* 进度条 */}
      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary)', borderRadius: 2, transition: 'width 0.4s' }} />
      </div>

      {/* 知识点卡片 */}
      <div className="card" style={{ marginBottom: 16, minHeight: 200 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.subject}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            已复习 {item.srsReps} 次 · 间隔 {item.srsInterval}天
          </span>
        </div>

        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 16, lineHeight: 1.4 }}>
          {item.topic}
        </div>

        <ConfidenceBar v={item.confidence} />

        {!revealed ? (
          <button
            className="btn btn-secondary"
            style={{ marginTop: 20, width: '100%' }}
            onClick={() => setRevealed(true)}
          >
            点击回忆 — 你还记得这个知识点吗？
          </button>
        ) : (
          <div style={{ marginTop: 20, padding: '12px 14px', background: 'var(--primary-light)', borderRadius: 8, border: '1px solid var(--primary-ring)', fontSize: 13, color: 'var(--text)' }}>
            请根据你的掌握情况打分：
          </div>
        )}
      </div>

      {/* 评分按钮 */}
      {revealed && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {GRADE_LABELS.map(({ g, label, color }) => (
            <button
              key={g}
              className="grade-btn"
              disabled={grading}
              onClick={() => grade(g)}
              style={{
                ['--grade-bg' as string]: `${color}10`,
                ['--grade-bg-hover' as string]: `${color}25`,
                padding: '10px 6px', border: `1px solid ${color}30`,
                borderRadius: 8,
                cursor: grading ? 'not-allowed' : 'pointer',
                fontSize: 12, fontWeight: 600, color,
                transition: 'background 0.15s', lineHeight: 1.4,
                opacity: grading ? 0.6 : 1
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
