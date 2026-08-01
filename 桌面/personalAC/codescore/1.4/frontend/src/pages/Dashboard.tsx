import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { agentApi, type AgentLog } from '../api/http'
import { useToast } from '../context/ToastContext'

const tok = () => localStorage.getItem('syncToken') || ''

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6)  return '夜深了'
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

function fmtDate(): string {
  return new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })
}

function fmtAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 172_800_000) return '昨天'
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

const ACTION_LABEL: Record<string, string> = {
  push_suggestion: '推送建议', send_bot_message: '发送消息', set_schedule: '设置定时',
  update_weakness: '更新薄弱点', no_action: '无动作', proactive_report: '主动报告',
  daily_review: '每日回顾', weakness_quiz: '薄弱点测验', generate_diagram: '生成图表',
  resource_brief: '资源简报', weekly_report: '每周报告', guardian_digest: '监护人简报',
}

interface TodoItem { id: string; title: string; priority: string; due_date: number | null; status: string }

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'var(--danger)', high: 'var(--orange)', normal: 'var(--primary)', low: 'var(--text-muted)',
}

interface DigestData {
  digest: string
  stats?: { todosDone: number; todosPending: number; srsReviewed: number; srsTotal: number; chatCount: number }
  date?: string
  create_time: number
}

interface RadarDim { label: string; value: number }
interface RadarData { dimensions: RadarDim[]; note: string | null; updated_at: number }

function radarPoint(angle: number, r: number, cx: number, cy: number): [number, number] {
  return [cx + r * Math.sin(angle), cy - r * Math.cos(angle)]
}

function RadarChart({ data }: { data: RadarData | null }): React.ReactElement {
  const size = 240
  const cx = size / 2, cy = size / 2
  const maxR = 82
  const dims = data?.dimensions ?? []
  const n = dims.length || 6
  const angles = Array.from({ length: n }, (_, i) => (2 * Math.PI * i) / n)
  const gridLevels = [0.25, 0.5, 0.75, 1]
  const scores = dims.map(d => Math.min(100, Math.max(0, d.value)) / 100)
  const dataPoints = angles.map((a, i) => radarPoint(a, maxR * (scores[i] ?? 0), cx, cy))
  const polygon = dataPoints.map(([x, y]) => `${x},${y}`).join(' ')
  const labelR = maxR + 24

  return (
    <div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', margin: '0 auto' }}>
        {gridLevels.map(level => {
          const pts = angles.map(a => radarPoint(a, maxR * level, cx, cy))
          return <polygon key={level} points={pts.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="var(--border)" strokeWidth="1" />
        })}
        {angles.map((a, i) => {
          const [x, y] = radarPoint(a, maxR, cx, cy)
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth="1" />
        })}
        {dims.length > 0 && (
          <>
            <polygon points={polygon} fill="var(--primary-light)" stroke="var(--primary)" strokeWidth="1.8" strokeLinejoin="round" />
            {dataPoints.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3.5} fill="var(--primary)" />)}
          </>
        )}
        {angles.map((a, i) => {
          const [x, y] = radarPoint(a, labelR, cx, cy)
          const anchor = x < cx - 4 ? 'end' : x > cx + 4 ? 'start' : 'middle'
          const dim = dims[i]
          return (
            <text key={i} x={x} y={y} textAnchor={anchor} dominantBaseline="middle"
              fontSize="10" fill={dim ? 'var(--text-secondary)' : 'var(--border)'} fontFamily="inherit">
              {dim ? `${dim.label} ${dim.value}` : '—'}
            </text>
          )
        })}
      </svg>
      {data?.note && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5, padding: '0 8px' }}>
          {data.note}
        </div>
      )}
      {!data && (
        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          AI 尚未生成分析，在对话中问「分析一下学习状态」
        </div>
      )}
    </div>
  )
}

export default function Dashboard(): React.ReactElement {
  const { toast } = useToast()
  const [userName, setUserName] = useState('')
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [studentId, setStudentId] = useState<string | null>(null)
  const [students, setStudents] = useState<Array<{ id: string; name: string }>>([])
  const [userRole, setUserRole] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [todoLoading, setTodoLoading] = useState(true)
  const [chatCount, setChatCount] = useState(0)
  const [radarData, setRadarData] = useState<RadarData | null | undefined>(undefined)
  const [streak, setStreak] = useState(0)
  const [todayDone, setTodayDone] = useState(0)
  const [digest, setDigest] = useState<DigestData | null | undefined>(undefined)
  const [digestLoading, setDigestLoading] = useState(false)
  const [focusMode, setFocusMode] = useState<{ active: boolean; reason?: string; days?: number } | null>(null)
  const [focusLoading, setFocusLoading] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me', { headers: { 'x-sync-token': tok() } })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setUserName(d.data?.displayName || d.data?.username || '')
          setUserRole(d.data?.role || '')
          if (d.data?.role === 'student') setStudentId(d.data.id)
        }
      })
      .catch(() => {})

    fetch('/api/auth/students', { headers: { 'x-sync-token': tok() } })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data?.length > 0) {
          setStudents(d.data.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })))
          setStudentId(prev => prev || d.data[0].id)
        }
      })
      .catch(() => {})

    try {
      const key = `pac_chat_${(localStorage.getItem('syncToken') ?? 'x').slice(0, 8)}`
      const raw = localStorage.getItem(key)
      if (raw) setChatCount(JSON.parse(raw).length)
    } catch {}

    agentApi.getLogs(5)
      .then(r => { if (r.success && r.data) setLogs(r.data as AgentLog[]) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!studentId) { setTodoLoading(false); setRadarData(null); return }
    fetch(`/api/todo/${studentId}?status=pending`, { headers: { 'x-sync-token': tok() } })
      .then(r => r.json())
      .then(d => { if (d.todos) setTodos(d.todos.slice(0, 6)) })
      .catch(() => {})
      .finally(() => setTodoLoading(false))
    fetch(`/api/radar/${studentId}`, { headers: { 'x-sync-token': tok() } })
      .then(r => r.json())
      .then(d => setRadarData(d.data ?? null))
      .catch(() => setRadarData(null))

    fetch(`/api/progress/${studentId}`, { headers: { 'x-sync-token': tok() } })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          setStreak(d.data.stats?.streak ?? 0)
          setTodayDone(d.data.stats?.todosThisWeek ?? 0)
        }
      })
      .catch(() => {})
  }, [studentId])

  useEffect(() => {
    if (!studentId || userRole === 'student') { setDigest(null); setFocusMode(null); return }
    fetch(`/api/agent/digest?student_id=${studentId}`, { headers: { 'x-sync-token': tok() } })
      .then(r => r.json())
      .then(d => setDigest(d.data ?? null))
      .catch(() => setDigest(null))
    fetch(`/api/agent/focus-mode?student_id=${studentId}`, { headers: { 'x-sync-token': tok() } })
      .then(r => r.json())
      .then(d => { if (d.success) setFocusMode(d.data) })
      .catch(() => {})
  }, [studentId, userRole])

  async function generateDigest() {
    if (!studentId || digestLoading) return
    setDigestLoading(true)
    try {
      const gen = await fetch('/api/agent/digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sync-token': tok() },
        body: JSON.stringify({ student_id: studentId })
      }).then(r => r.json()).catch(() => null)
      if (!gen?.success) { toast('简报生成失败', 'error'); return }
      const r = await fetch(`/api/agent/digest?student_id=${studentId}`, { headers: { 'x-sync-token': tok() } })
      const d = await r.json()
      setDigest(d.data ?? null)
      toast('简报已生成')
    } catch { toast('网络错误', 'error') } finally {
      setDigestLoading(false)
    }
  }

  async function toggleFocusMode() {
    if (!studentId || focusLoading) return
    setFocusLoading(true)
    const entering = !focusMode?.active
    try {
      const res = await fetch('/api/agent/focus-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sync-token': tok() },
        body: JSON.stringify({ studentId, action: entering ? 'enter' : 'exit', reason: '监护人手动开启特别辅导' })
      }).then(r => r.json()).catch(() => null)
      if (!res?.success) { toast('操作失败，请重试', 'error'); return }
      const r = await fetch(`/api/agent/focus-mode?student_id=${studentId}`, { headers: { 'x-sync-token': tok() } })
      const d = await r.json()
      if (d.success) {
        setFocusMode(d.data)
        toast(entering ? '已关进小黑屋' : '已退出小黑屋')
      }
    } catch { toast('网络错误', 'error') } finally {
      setFocusLoading(false)
    }
  }

  async function markDone(id: string) {
    setTodos(prev => prev.filter(t => t.id !== id))
    const res = await fetch(`/api/todo/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-sync-token': tok() },
      body: JSON.stringify({ status: 'done' }),
    }).then(r => r.json()).catch(() => null)
    if (!res?.success) toast('标记失败', 'error')
  }

  const now = Date.now()
  const overdueTodos = todos.filter(t => t.due_date && t.due_date < now)
  return (
    <div className="page-enter">
      {/* ── Hero ── */}
      <div style={{ marginBottom: 32, position: 'relative' }}>
        <div style={{
          position: 'absolute', top: -20, left: -32,
          width: 260, height: 90,
          background: 'radial-gradient(ellipse at 20% 50%, var(--primary-light) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1.2 }}>
            {greeting()}{userName ? `，${userName}` : ''}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {/* 监护人多学生切换 */}
            {userRole !== 'student' && students.length > 1 && (
              <select
                value={studentId || ''}
                onChange={e => setStudentId(e.target.value)}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
                  background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13,
                  cursor: 'pointer', outline: 'none',
                }}
              >
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{fmtDate()}</div>
          </div>
        </div>
      </div>

      {/* ── Student streak banner ── */}
      {userRole === 'student' && streak > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24,
          background: 'var(--primary-light)',
          border: `1px solid ${streak >= 7 ? 'var(--primary-ring)' : 'var(--border)'}`,
          borderRadius: 12, padding: '14px 20px',
        }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {streak >= 30
                ? <><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></>
                : <><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></>
              }
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
              已连续学习 <span style={{ color: 'var(--primary)', fontSize: 18 }}>{streak}</span> 天！
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {streak >= 30 ? '太厉害了，坚持就是胜利！' :
               streak >= 14 ? '连续两周，状态绝佳！' :
               streak >= 7 ? '坚持一周了，继续加油！' : '好的开始，保持下去！'}
            </div>
          </div>
          {todayDone > 0 && (
            <div style={{
              marginLeft: 'auto', background: 'var(--primary)', color: '#fff',
              borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 600,
            }}>
              今日完成 {todayDone} 项
            </div>
          )}
        </div>
      )}

      {/* ── Guardian digest card ── */}
      {userRole !== 'student' && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>今日学习简报</h2>
              {digest?.date && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {digest.date} · {fmtAgo(digest.create_time)}
                </span>
              )}
            </div>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={generateDigest}
              disabled={digestLoading}
            >
              {digestLoading ? '生成中…' : digest ? '重新生成' : '生成简报'}
            </button>
          </div>
          {digest === undefined ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="skeleton" style={{ height: 12, borderRadius: 4 }} />
              <div className="skeleton" style={{ height: 12, borderRadius: 4, width: '80%' }} />
              <div className="skeleton" style={{ height: 12, borderRadius: 4, width: '60%' }} />
            </div>
          ) : digest ? (
            <>
              {digest.stats && (
                <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                  {[
                    { label: '完成待办', value: `${digest.stats.todosDone} 项` },
                    { label: '复习知识点', value: `${digest.stats.srsReviewed}/${digest.stats.srsTotal}` },
                    { label: 'AI 对话', value: `${digest.stats.chatCount} 次` },
                  ].map(s => (
                    <div key={s.label} style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{s.value}</span>
                      <span style={{ marginLeft: 4 }}>{s.label}</span>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                {digest.digest}
              </p>
            </>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              暂无简报。点击"生成简报"让 AI 分析今日学习情况。
            </p>
          )}
        </div>
      )}

      {/* ── Focus mode card ── */}
      {userRole !== 'student' && (
        <div className="card" style={{ marginBottom: 24, borderLeft: focusMode?.active ? '3px solid var(--primary)' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>小黑屋</h2>
              {focusMode?.active && focusMode.days != null && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>已开启 {focusMode.days} 天</span>
              )}
            </div>
            <button
              className={focusMode?.active ? 'btn btn-secondary' : 'btn btn-primary'}
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={toggleFocusMode}
              disabled={focusLoading || !studentId || focusMode === null}
            >
              {focusLoading ? '处理中…' : !studentId ? '暂无学生' : focusMode === null ? '加载中…' : focusMode.active ? '退出小黑屋' : '关进小黑屋'}
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-block', width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: focusMode?.active ? 'var(--primary)' : focusMode === null ? 'var(--border)' : 'var(--success)',
            }} />
            {focusMode === null ? (
              <span style={{ color: 'var(--text-muted)' }}>{studentId ? '加载中…' : '请先添加学生'}</span>
            ) : focusMode.active ? (
              <span style={{ color: 'var(--text-secondary)' }}>
                小黑屋模式已开启
                {focusMode.reason && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>· {focusMode.reason}</span>}
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>未开启</span>
            )}
          </div>
        </div>
      )}

      {/* ── Stat cards ── */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div className="stat-label">待办事项</div>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            </div>
          </div>
          <div className="stat-value" style={{ color: overdueTodos.length > 0 ? 'var(--danger)' : 'var(--text)' }}>
            {todoLoading ? '—' : todos.length}
          </div>
          <div className="stat-sub">
            {todoLoading ? '加载中' : overdueTodos.length > 0
              ? <span style={{ color: 'var(--danger)' }}>{overdueTodos.length} 项已逾期</span>
              : '暂无逾期'}
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div className="stat-label">本地对话</div>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
          </div>
          <div className="stat-value">{chatCount}</div>
          <div className="stat-sub">条历史消息</div>
        </div>

      </div>

      {/* ── Two columns ── */}
      <div className="dash-two-col" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 20, marginBottom: 20 }}>
        {/* Radar Chart */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>学习六维分析</h2>
            {radarData && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {new Date(radarData.updated_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          {radarData === undefined ? (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="skeleton" style={{ width: 160, height: 160, borderRadius: '50%' }} />
            </div>
          ) : (
            <RadarChart data={radarData} />
          )}
        </div>

        {/* Todo quick view */}
        <div className="card" style={{ padding: '18px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>待办清单</h2>
            <Link to="/todo" style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 2 }}>全部 <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></Link>
          </div>
          {todoLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 18, borderRadius: 4 }} />)}
            </div>
          ) : todos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              <div style={{ marginBottom: 6, color: 'var(--success)', display: 'flex', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              全部完成
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {todos.map(todo => {
                const isOverdue = !!(todo.due_date && todo.due_date < now)
                return (
                  <div key={todo.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 4px', borderRadius: 5 }}>
                    <button onClick={() => markDone(todo.id)}
                      className="hover-primary"
                      style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${isOverdue ? 'var(--danger)' : 'var(--border)'}`, background: 'none', cursor: 'pointer', flexShrink: 0, marginTop: 1.5, transition: 'all .14s' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: PRIORITY_COLOR[todo.priority] || 'var(--primary)', flexShrink: 0 }} />
                        <span style={{ fontSize: 12.5, color: isOverdue ? 'var(--danger)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {todo.title}
                        </span>
                      </div>
                      {todo.due_date && (
                        <div style={{ fontSize: 11, color: isOverdue ? 'var(--danger)' : 'var(--text-muted)', marginLeft: 10, marginTop: 1 }}>
                          {isOverdue ? '已逾期 · ' : ''}{new Date(todo.due_date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Agent activity timeline ── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>Agent 最近行为</h2>
          <Link to="/agent-logs" style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 2 }}>查看全部 <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></Link>
        </div>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 18, borderRadius: 4 }} />)}
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Agent 尚未执行任何操作</div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: 20 }}>
            <div style={{ position: 'absolute', left: 3, top: 4, bottom: 4, width: 1, background: 'var(--border)' }} />
            {logs.map((log, i) => (
              <div key={log.id} style={{ position: 'relative', paddingBottom: i < logs.length - 1 ? 16 : 0 }}>
                <div style={{
                  position: 'absolute', left: -20, top: 4,
                  width: 8, height: 8, borderRadius: '50%',
                  background: log.status === 'success' ? 'var(--success)' : 'var(--danger)',
                  border: '2px solid var(--bg-card)', zIndex: 1,
                }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{ACTION_LABEL[log.action_type] || log.action_type}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{fmtAgo(log.create_time)}</span>
                </div>
                {log.action_detail && (
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.action_detail}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
