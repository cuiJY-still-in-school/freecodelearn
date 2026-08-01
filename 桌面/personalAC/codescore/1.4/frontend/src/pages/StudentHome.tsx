import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../context/ToastContext'

const tok = () => localStorage.getItem('syncToken') || ''
const h = (p: string, o?: RequestInit) =>
  fetch(p, { ...o, headers: { 'x-sync-token': tok(), 'Content-Type': 'application/json', ...(o?.headers || {}) } })

// ── types ──────────────────────────────────────────────────────────────────

interface Todo { id: string; title: string; priority: string; status: string; due_date: number | null; must_do: number }
interface SrsItem { id: string; topic: string; subject: string; due_date: number }

// ── helpers ────────────────────────────────────────────────────────────────

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 6)  return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

function priorityColor(p: string): string {
  return p === 'urgent' ? 'var(--danger)' : p === 'high' ? 'var(--orange)' : p === 'low' ? 'var(--text-muted)' : 'var(--primary)'
}

// ── SRS Mini Card ──────────────────────────────────────────────────────────

function SrsCard({ item, onReview }: { item: SrsItem; onReview: (id: string, grade: number) => void }) {
  const [flipped, setFlipped] = useState(false)
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '16px 18px', cursor: 'pointer',
    }} onClick={() => !flipped && setFlipped(true)}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {item.subject}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: flipped ? 14 : 0 }}>
        {item.topic}
      </div>
      {!flipped && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>点击回忆…</div>
      )}
      {flipped && (
        <div style={{ display: 'flex', gap: 8 }}>
          {(['忘了', '模糊', '记得', '很熟'] as const).map((label, i) => {
            const grades = [1, 2, 4, 5]
            const srsStyles = [
              { bg: 'var(--danger-bg)',      color: 'var(--danger)' },
              { bg: 'var(--orange-bg)', color: 'var(--orange)' },
              { bg: 'var(--success-bg)',     color: 'var(--success)' },
              { bg: 'var(--info-bg)',        color: 'var(--info)' },
            ]
            return (
              <button key={i} onClick={e => { e.stopPropagation(); onReview(item.id, grades[i]) }}
                style={{
                  flex: 1, border: 'none', borderRadius: 8, padding: '8px 0',
                  background: srsStyles[i].bg, color: srsStyles[i].color,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}>
                {label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function StudentHome() {
  const nav = useNavigate()
  const [name, setName]         = useState('')
  const [streak, setStreak]     = useState(0)
  const [todos, setTodos]       = useState<Todo[]>([])
  const { toast } = useToast()
  const [srsItems, setSrsItems] = useState<SrsItem[]>([])
  const [studentId, setStudentId] = useState('')
  const [quickMsg, setQuickMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [focusActive, setFocusActive] = useState<boolean | null>(null)
  const [focusLoading, setFocusLoading] = useState(false)
  const focusActiveRef = useRef<boolean | null>(null)

  const load = useCallback(async () => {
    const me = await h('/api/auth/me').then(r => r.json()).catch(() => null)
    if (!me?.success) return
    setName(me.data.displayName || me.data.username || '')
    const sid = me.data.id
    setStudentId(sid)

    const [todoRes, srsRes, progRes, focusRes] = await Promise.all([
      h(`/api/todo/${sid}?status=pending`).then(r => r.json()).catch(() => null),
      h('/api/srs/due').then(r => r.json()).catch(() => null),
      h(`/api/progress/${sid}`).then(r => r.json()).catch(() => null),
      h(`/api/agent/focus-mode?student_id=${sid}`).then(r => r.json()).catch(() => null),
    ])

    if (todoRes?.todos) setTodos(todoRes.todos.slice(0, 8))
    if (srsRes?.data) setSrsItems((srsRes.data as SrsItem[]).slice(0, 4))
    if (progRes?.data?.stats?.streak) setStreak(progRes.data.stats.streak)
    const active = focusRes?.success ? !!focusRes.data?.active : false
    setFocusActive(active)
    focusActiveRef.current = active
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // 每 45 秒轮询一次小黑屋状态，监护人开启后学生无需刷新即可看到横幅
  useEffect(() => {
    if (!studentId) return
    const timer = setInterval(async () => {
      const r = await h(`/api/agent/focus-mode?student_id=${studentId}`).then(r => r.json()).catch(() => null)
      if (!r?.success) return
      const nowActive = !!r.data?.active
      const prev = focusActiveRef.current
      if (prev !== null && prev !== nowActive) {
        setFocusActive(nowActive)
        focusActiveRef.current = nowActive
        toast(nowActive ? '你已被关进小黑屋，AI 会重点辅导你' : '你已走出小黑屋，继续加油！', 'info')
      }
    }, 45_000)
    return () => clearInterval(timer)
  }, [studentId, toast])

  async function markDone(id: string) {
    setTodos(p => p.filter(t => t.id !== id))
    await h(`/api/todo/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'done' }) })
  }

  async function reviewSrs(id: string, grade: number) {
    setSrsItems(p => p.filter(s => s.id !== id))
    await h(`/api/srs/${id}/review`, { method: 'POST', body: JSON.stringify({ grade }) })
  }

  async function toggleFocusMode() {
    if (!studentId || focusLoading || focusActive === null) return
    setFocusLoading(true)
    const entering = !focusActive
    try {
      const res = await h('/api/agent/focus-mode', {
        method: 'POST',
        body: JSON.stringify({ studentId, action: entering ? 'enter' : 'exit', reason: '学生自主开启专注辅导' }),
      }).then(r => r.json()).catch(() => null)
      if (!res?.success) { toast('操作失败，请重试', 'error'); return }
      const r = await h(`/api/agent/focus-mode?student_id=${studentId}`)
      const d = await r.json()
      if (d.success) {
        const nowActive = !!d.data?.active
        setFocusActive(nowActive)
        focusActiveRef.current = nowActive
        toast(entering ? '已进入小黑屋，加油！' : '已走出小黑屋，继续努力！')
      }
    } catch { toast('网络错误', 'error') } finally {
      setFocusLoading(false)
    }
  }

  function sendQuick() {
    if (!quickMsg.trim()) return
    const key = `pac_chat_${tok().slice(0, 8)}`
    nav('/chat', { state: { prefill: quickMsg.trim() } })
    setQuickMsg('')
  }

  const mustDos  = todos.filter(t => t.must_do)
  const normalTodos = todos.filter(t => !t.must_do)
  const doneToday = todos.filter(t => t.status === 'done').length  // won't show (filtered), kept for count
  const totalPending = todos.length
  const srsCount = srsItems.length

  // Phase: what should student do now
  const phase = mustDos.length > 0 ? 'must' : srsCount > 0 ? 'srs' : normalTodos.length > 0 ? 'todo' : 'free'
  const phaseMsg = {
    must:  '先完成必做任务，做完就解锁自由时间',
    srs:   `有 ${srsCount} 个知识点等你复习，趁热打铁`,
    todo:  '今日任务都是选做，安排好自己的节奏',
    free:  '今天的任务都搞定了，干得漂亮！',
  }[phase]

  if (loading) return (
    <div className="page-enter" style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 80px' }}>
      <div className="skeleton" style={{ height: 32, width: 200, borderRadius: 8, marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 16, width: 120, borderRadius: 4, marginBottom: 24 }} />
      <div className="skeleton" style={{ height: 80, borderRadius: 14, marginBottom: 24 }} />
      <div className="skeleton" style={{ height: 52, borderRadius: 14, marginBottom: 24 }} />
      <div className="skeleton" style={{ height: 18, width: 100, borderRadius: 4, marginBottom: 12 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 11 }} />)}
      </div>
    </div>
  )

  return (
    <div className="page-enter" style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 80px' }}>

      {/* ── 小黑屋横幅 ── */}
      {focusActive === true && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--primary-light)', border: '1px solid var(--primary-ring)',
          borderLeft: '3px solid var(--primary)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 20,
        }}>
          <span style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
            background: 'var(--primary)', flexShrink: 0,
          }} />
          <span style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>小黑屋</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>你正在小黑屋中，AI 会重点辅导你，加油！</span>
        </div>
      )}

      {/* ── 顶栏 ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.03em' }}>
          {greeting()}{name ? `，${name}` : ''}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
        </div>
      </div>

      {/* ── Streak + 今日状态 ── */}
      <div style={{
        background: phase === 'free' ? 'var(--success-bg)' : 'var(--primary-light)',
        border: `1px solid ${phase === 'free' ? 'var(--success-border)' : 'var(--primary-ring)'}`,
        borderRadius: 14, padding: '16px 20px', marginBottom: 24,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: phase === 'free' ? 'var(--success-bg)' : 'var(--primary-light)', border: `1px solid ${phase === 'free' ? 'var(--success-border)' : 'var(--primary-ring)'}` }}>
          {phase === 'free'
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            : phase === 'must'
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            : phase === 'srs'
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          }
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 2 }}>{phaseMsg}</div>
          {streak > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              已连续学习 <strong style={{ color: 'var(--primary)' }}>{streak}</strong> 天
            </div>
          )}
        </div>
        {totalPending > 0 && (
          <div style={{
            background: 'var(--primary)', color: '#fff', borderRadius: 20,
            padding: '4px 12px', fontSize: 12, fontWeight: 700, flexShrink: 0,
          }}>
            {totalPending} 项待完成
          </div>
        )}
      </div>

      {/* ── 快速问 AI ── */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
        padding: '14px 16px', marginBottom: 24, display: 'flex', gap: 10,
      }}>
        <input
          value={quickMsg}
          onChange={e => setQuickMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendQuick()}
          placeholder="有什么不懂的？直接问 AI…"
          style={{
            flex: 1, border: 'none', outline: 'none', fontSize: 14,
            color: 'var(--text)', background: 'transparent',
          }}
        />
        <button onClick={sendQuick} style={{
          background: quickMsg.trim() ? 'var(--primary)' : 'var(--bg-secondary)',
          color: quickMsg.trim() ? '#fff' : 'var(--text-muted)',
          border: 'none', borderRadius: 9, padding: '8px 18px',
          fontSize: 13, fontWeight: 700, cursor: quickMsg.trim() ? 'pointer' : 'default',
          transition: 'all .15s',
        }}>发送</button>
        <button onClick={() => nav('/chat')} style={{
          background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: 'none',
          borderRadius: 9, padding: '8px 14px', fontSize: 13, cursor: 'pointer',
        }}>聊天室</button>
      </div>

      {/* ── 必做任务 ── */}
      {mustDos.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}>必做任务</span>
            <span style={{
              background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 11, fontWeight: 700,
              borderRadius: 10, padding: '2px 8px',
            }}>{mustDos.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mustDos.map(t => (
              <TodoRow key={t.id} todo={t} onDone={markDone} />
            ))}
          </div>
        </section>
      )}

      {/* ── SRS 复习 ── */}
      {srsItems.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--info)' }}>今日复习</span>
              <span style={{
                background: 'var(--info-bg)', color: 'var(--info)', fontSize: 11, fontWeight: 700,
                borderRadius: 10, padding: '2px 8px',
              }}>{srsItems.length} 个</span>
            </div>
            <button onClick={() => nav('/srs')} style={{
              background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 2,
            }}>全部复习 <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
            {srsItems.map(s => (
              <SrsCard key={s.id} item={s} onReview={reviewSrs} />
            ))}
          </div>
        </section>
      )}

      {/* ── 普通待办 ── */}
      {normalTodos.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>今日待办</span>
            <button onClick={() => nav('/todo')} style={{
              background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 2,
            }}>全部 <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {normalTodos.map(t => (
              <TodoRow key={t.id} todo={t} onDone={markDone} />
            ))}
          </div>
        </section>
      )}

      {/* ── 今天全搞定了 ── */}
      {phase === 'free' && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--success-bg)', border: '1px solid var(--success-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>今天的任务全部完成！</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>剩余时间可以自由支配，或者继续复习备考</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => nav('/chat')} style={{
              background: 'var(--primary)', color: '#fff', border: 'none',
              borderRadius: 9, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>和 AI 聊聊天</button>
            <button onClick={() => nav('/srs')} style={{
              background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: 'none',
              borderRadius: 9, padding: '10px 22px', fontSize: 14, cursor: 'pointer',
            }}>超前复习</button>
          </div>
        </div>
      )}

      {/* ── 专注辅导开关 ── */}
      <div style={{
        marginTop: 28, borderTop: '1px solid var(--border)', paddingTop: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            {focusActive === true ? '小黑屋已开启' : '小黑屋'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {focusActive === true ? '你在小黑屋中，AI 会重点辅导，加油冲出来' : '感觉需要重点辅导？自己进小黑屋'}
          </div>
        </div>
        <button
          onClick={toggleFocusMode}
          disabled={focusLoading || !studentId || focusActive === null}
          style={{
            flexShrink: 0,
            background: focusActive === true ? 'var(--bg-secondary)' : 'var(--primary)',
            color: focusActive === true ? 'var(--text-secondary)' : '#fff',
            border: 'none', borderRadius: 8,
            padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            opacity: (focusLoading || focusActive === null) ? 0.6 : 1,
          }}
        >
          {focusLoading ? '处理中…' : focusActive === null ? '加载中…' : focusActive ? '出来了' : '进去'}
        </button>
      </div>
    </div>
  )
}

// ── TodoRow ────────────────────────────────────────────────────────────────

function TodoRow({ todo, onDone }: { todo: Todo; onDone: (id: string) => void }) {
  const [done, setDone] = useState(false)
  const isOverdue = todo.due_date && todo.due_date < Date.now()

  function handleDone() {
    setDone(true)
    setTimeout(() => onDone(todo.id), 400)
  }

  return (
    <div style={{
      background: 'var(--bg-card)', border: `1px solid ${isOverdue ? 'var(--danger-border)' : 'var(--border)'}`,
      borderRadius: 11, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12,
      opacity: done ? 0 : 1, transform: done ? 'translateX(20px)' : 'none',
      transition: 'all .35s ease',
    }}>
      <button onClick={handleDone} style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
        border: `2px solid ${priorityColor(todo.priority)}`,
        background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={priorityColor(todo.priority)} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
      </button>
      <span style={{ flex: 1, fontSize: 14, color: 'var(--text)', lineHeight: 1.4 }}>{todo.title}</span>
      {isOverdue && (
        <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 700, flexShrink: 0 }}>逾期</span>
      )}
      {todo.due_date && !isOverdue && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
          {new Date(todo.due_date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
        </span>
      )}
    </div>
  )
}
