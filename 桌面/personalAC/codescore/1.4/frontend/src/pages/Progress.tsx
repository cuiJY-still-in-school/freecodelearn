import React, { useEffect, useState, useCallback } from 'react'
import { getEffectiveStudentId } from '../api/http'
import { useToast } from '../context/ToastContext'

const tok = () => localStorage.getItem('syncToken') || ''

interface Stats {
  todosThisWeek: number; todosLastWeek: number; totalCompleted: number
  chatsThisWeek: number; chatsLastWeek: number
  studyMinutes: number; studySessions: number; streak: number
}
interface HeatCell { date: string; count: number }
interface Subject { subject: string; avgConf: number; kpCount: number; avgWeakness: number }
interface WeekReport { text: string; generatedAt: number }

interface ProgressData {
  stats: Stats
  heatmap: HeatCell[]
  subjects: Subject[]
  weekReport: WeekReport | null
}

// ── 工具 ──────────────────────────────────────────────────────────────────
function delta(cur: number, prev: number): React.ReactElement | null {
  if (prev === 0 && cur === 0) return null
  const d = cur - prev
  if (d === 0) return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>与上周持平</span>
  const up = d > 0
  return (
    <span style={{ fontSize: 11, color: up ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
      {up ? '↑' : '↓'} {Math.abs(d)} 较上周
    </span>
  )
}

function fmtMinutes(m: number): string {
  if (m < 60) return `${m} 分钟`
  return `${Math.floor(m / 60)} 小时 ${m % 60 > 0 ? `${m % 60} 分` : ''}`
}

// ── 热力图 ────────────────────────────────────────────────────────────────
const HEAT_COLORS = [
  'var(--bg)',
  'rgba(217,119,87,0.18)',
  'rgba(217,119,87,0.38)',
  'rgba(217,119,87,0.62)',
  'rgba(217,119,87,0.85)',
  'var(--primary)',
]

function heatColor(count: number): string {
  if (count === 0) return HEAT_COLORS[0]
  if (count <= 1) return HEAT_COLORS[1]
  if (count <= 3) return HEAT_COLORS[2]
  if (count <= 6) return HEAT_COLORS[3]
  if (count <= 10) return HEAT_COLORS[4]
  return HEAT_COLORS[5]
}

function Heatmap({ cells }: { cells: HeatCell[] }): React.ReactElement {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

  // Pad to start from Monday — build 13 complete weeks (91 cells from Sunday)
  const WEEKS = 13
  const padded: (HeatCell | null)[] = []
  if (cells.length > 0) {
    const firstDate = new Date(cells[0].date)
    const dayOfWeek = firstDate.getDay() // 0=Sun
    for (let i = 0; i < dayOfWeek; i++) padded.push(null)
  }
  padded.push(...cells)
  while (padded.length % 7 !== 0) padded.push(null)

  const weeks: (HeatCell | null)[][] = []
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7))

  const dayLabels = ['日', '一', '二', '三', '四', '五', '六']

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
        {/* Day labels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 18 }}>
          {dayLabels.map((d, i) => (
            <div key={i} style={{ width: 12, height: 12, fontSize: 9, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {i % 2 === 1 ? d : ''}
            </div>
          ))}
        </div>
        {/* Grid */}
        <div>
          {/* Month labels */}
          <div style={{ display: 'flex', gap: 3, marginBottom: 3, height: 14 }}>
            {weeks.map((week, wi) => {
              const firstReal = week.find(c => c !== null)
              const showMonth = firstReal && (wi === 0 || new Date(firstReal.date).getDate() <= 7)
              return (
                <div key={wi} style={{ width: 12, fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'visible' }}>
                  {showMonth && firstReal ? new Date(firstReal.date).toLocaleDateString('zh-CN', { month: 'short' }) : ''}
                </div>
              )
            })}
          </div>
          {/* Cells by column (week) */}
          <div style={{ display: 'flex', gap: 3 }}>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {week.map((cell, di) => (
                  <div
                    key={di}
                    style={{
                      width: 12, height: 12, borderRadius: 2,
                      background: cell ? heatColor(cell.count) : 'transparent',
                      border: cell ? '1px solid var(--border)' : 'none',
                      transition: 'opacity 0.1s',
                    }}
                    onMouseEnter={e => {
                      if (!cell) return
                      const rect = (e.target as HTMLElement).getBoundingClientRect()
                      const label = cell.count === 0
                        ? `${cell.date} 无活动`
                        : `${cell.date}  ${cell.count} 次活动`
                      setTooltip({ text: label, x: rect.left + window.scrollX, y: rect.top + window.scrollY - 28 })
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>少</span>
        {HEAT_COLORS.map((c, i) => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c, border: '1px solid var(--border)' }} />
        ))}
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>多</span>
      </div>

      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x, top: tooltip.y,
          background: 'var(--tooltip-bg)', color: 'var(--tooltip-color)',
          fontSize: 11, padding: '4px 8px', borderRadius: 4,
          pointerEvents: 'none', zIndex: 1000, whiteSpace: 'nowrap',
          transform: 'translateX(-50%)',
        }}>
          {tooltip.text}
        </div>
      )}
    </div>
  )
}

// ── 能力雷达图 ─────────────────────────────────────────────────────────────
function RadarChart({ subjects }: { subjects: Subject[] }): React.ReactElement {
  const SIZE = 220
  const cx = SIZE / 2, cy = SIZE / 2
  const R = 80  // max radius
  const N = subjects.length

  function pt(i: number, v: number): [number, number] {
    const angle = (2 * Math.PI / N) * i - Math.PI / 2
    return [cx + v * R * Math.cos(angle), cy + v * R * Math.sin(angle)]
  }

  const rings = [0.25, 0.5, 0.75, 1.0]
  const LABEL_R = R + 18

  // mastery = avgConf (0-100 scale in data, normalise to 0-1)
  const values = subjects.map(s => Math.min(1, Math.max(0, s.avgConf / 100)))

  const polyPts = values.map((v, i) => pt(i, v))
  const polyStr = polyPts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: 'block', margin: '0 auto' }}>
      {/* Grid rings */}
      {rings.map((r, ri) => {
        const ringPts = Array.from({ length: N }, (_, i) => pt(i, r)).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
        return (
          <polygon key={ri} points={ringPts}
            fill="none" stroke="var(--border)" strokeWidth={ri === rings.length - 1 ? 1.2 : 0.7}
            strokeDasharray={ri < rings.length - 1 ? '3 3' : undefined} />
        )
      })}

      {/* Axis lines */}
      {Array.from({ length: N }, (_, i) => {
        const [x, y] = pt(i, 1)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth={0.7} />
      })}

      {/* Filled area */}
      <polygon points={polyStr}
        fill="var(--primary-light)" stroke="var(--primary)" strokeWidth={2}
        strokeLinejoin="round" />

      {/* Data points */}
      {polyPts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3.5} fill="var(--primary)" stroke="var(--bg-card)" strokeWidth={1.5} />
      ))}

      {/* Labels */}
      {subjects.map((s, i) => {
        const angle = (2 * Math.PI / N) * i - Math.PI / 2
        const lx = cx + LABEL_R * Math.cos(angle)
        const ly = cy + LABEL_R * Math.sin(angle)
        const anchor = Math.abs(Math.cos(angle)) < 0.1 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end'
        const pct = Math.round(Math.min(100, Math.max(0, s.avgConf)))
        return (
          <g key={i}>
            <text x={lx} y={ly - 5} textAnchor={anchor} fontSize={10} fontWeight={600} fill="var(--text)">{s.subject}</text>
            <text x={lx} y={ly + 8} textAnchor={anchor} fontSize={9} fill="var(--text-muted)">{pct}%</text>
          </g>
        )
      })}
    </svg>
  )
}

function SubjectList({ subjects }: { subjects: Subject[] }): React.ReactElement {
  return (
    <div style={{ marginTop: 12 }}>
      {subjects.map(s => {
        const pct = Math.min(100, Math.max(0, s.avgConf))
        const color = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--primary)' : 'var(--danger)'
        return (
          <div key={s.subject} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500, width: 52, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.subject}</span>
            <div style={{ flex: 1, height: 4, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.6s ease' }} />
            </div>
            <span style={{ fontSize: 11, color, fontWeight: 700, width: 28, textAlign: 'right' }}>{Math.round(pct)}%</span>
          </div>
        )
      })}
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────────────
export default function Progress(): React.ReactElement {
  const { toast } = useToast()
  const [data, setData] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const [studentId, setStudentId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => { getEffectiveStudentId().then(id => { if (id) setStudentId(id) }) }, [])

  const load = useCallback(() => {
    if (!studentId) return
    setLoading(true)
    fetch(`/api/progress/${studentId}`, { headers: { 'x-sync-token': tok() } })
      .then(r => r.json())
      .then(d => { if (d.success) setData(d.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [studentId])

  useEffect(() => { load() }, [load])

  async function handleGenerate() {
    if (!studentId) return
    setGenerating(true)
    try {
      const res = await fetch(`/api/progress/${studentId}/generate-report`, {
        method: 'POST',
        headers: { 'x-sync-token': tok(), 'Content-Type': 'application/json' },
      }).then(r => r.json())
      if (res.success && res.data) {
        setData(prev => prev ? { ...prev, weekReport: res.data } : prev)
        toast('周报已生成')
      } else {
        toast(res.error || '生成失败', 'error')
      }
    } catch {
      toast('网络错误', 'error')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return (
    <div className="page-enter" style={{ maxWidth: 820, margin: '0 auto' }}>
      <div className="grid-4" style={{ marginBottom: 24 }}>
        {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 88, borderRadius: 10 }} />)}
      </div>
      <div className="skeleton" style={{ height: 160, borderRadius: 10, marginBottom: 20 }} />
      <div className="skeleton" style={{ height: 280, borderRadius: 10 }} />
    </div>
  )

  const s = data?.stats

  const StatCard = ({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) => (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )

  const hasActivity = data && data.heatmap.some(c => c.count > 0)

  return (
    <div className="page-enter" style={{ maxWidth: 820, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.035em' }}>学习成就</h1>
          {s && s.streak > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'var(--primary-light)', border: '1px solid var(--primary-ring)',
              borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 700, color: 'var(--primary)'
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--primary)">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
              {s.streak} 天连续打卡
            </div>
          )}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>记录你的每一步成长</div>
      </div>

      {/* Stat cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <StatCard
          label="本周完成待办"
          value={s?.todosThisWeek ?? '—'}
          sub={s ? delta(s.todosThisWeek, s.todosLastWeek) : undefined}
        />
        <StatCard
          label="本周 AI 对话"
          value={s?.chatsThisWeek ?? '—'}
          sub={s ? delta(s.chatsThisWeek, s.chatsLastWeek) : undefined}
        />
        <StatCard
          label="连续打卡"
          value={s ? <span>{s.streak}<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)' }}> 天</span></span> : '—'}
          sub="保持节奏很重要"
        />
        <StatCard
          label="累计完成"
          value={s?.totalCompleted ?? '—'}
          sub="件待办事项"
        />
      </div>

      <div className="dash-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, marginBottom: 20 }}>
        {/* Heatmap */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>活动热力图</h2>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>近 90 天</span>
          </div>
          {hasActivity
            ? <div style={{ overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' as any }}>
                <Heatmap cells={data!.heatmap} />
              </div>
            : (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                <div style={{ marginBottom: 10, display: 'flex', gap: 4, justifyContent: 'center', opacity: 0.3 }}>
                  {[...Array(7)].map((_, i) => (
                    <div key={i} style={{ width: 12, height: 12, borderRadius: 2, border: '1.5px solid currentColor' }} />
                  ))}
                </div>
                完成待办或与 AI 对话后，这里会记录你的活动轨迹
              </div>
            )
          }
        </div>

        {/* Subject mastery — radar or list depending on count */}
        <div className="card">
          <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 8 }}>能力图谱</h2>
          {data?.subjects && data.subjects.length > 0
            ? <>
                {data.subjects.length >= 3
                  ? <RadarChart subjects={data.subjects} />
                  : null}
                <SubjectList subjects={data.subjects} />
              </>
            : <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ display: 'block', margin: '0 auto 8px', opacity: 0.3 }}>
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                与 AI 学习后，<br />这里会显示各科目掌握情况
              </div>
          }
        </div>
      </div>

      {/* Weekly AI Report */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 2 }}>AI 周报</h2>
            {data?.weekReport && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                生成于 {new Date(data.weekReport.generatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={generating}
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            {generating
              ? <><span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid rgba(255,255,255,0.5)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .6s linear infinite', marginRight: 6, verticalAlign: 'middle' }} />生成中…</>
              : data?.weekReport ? '重新生成' : '生成本周报告'
            }
          </button>
        </div>

        {data?.weekReport
          ? (
            <div style={{
              fontSize: 14, lineHeight: 1.85, color: 'var(--text)',
              padding: '16px 18px', background: 'var(--bg)',
              borderRadius: 8, border: '1px solid var(--border)',
              whiteSpace: 'pre-wrap'
            }}>
              {data.weekReport.text}
            </div>
          )
          : !generating && (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline' }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              点击"生成本周报告"，AI 会分析你这周的学习情况并写一份鼓励报告
            </div>
          )
        }
      </div>

      <style>{`
        .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
        @media (max-width: 700px) { .grid-4 { grid-template-columns: repeat(2, 1fr); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
