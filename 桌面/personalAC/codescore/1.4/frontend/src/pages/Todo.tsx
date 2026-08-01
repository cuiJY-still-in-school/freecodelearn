import React, { useState, useEffect, useRef } from 'react'
import { getEffectiveStudentId } from '../api/http'
import { useToast } from '../context/ToastContext'

const TOKEN = () => localStorage.getItem('syncToken') || ''

async function apiFetch(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-sync-token': TOKEN() },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

const api = {
  get:    (path: string)                => apiFetch('GET', path),
  post:   (path: string, body: unknown) => apiFetch('POST', path, body),
  patch:  (path: string, body: unknown) => apiFetch('PATCH', path, body),
  delete: (path: string)                => apiFetch('DELETE', path),
}

type Priority = 'low' | 'normal' | 'high' | 'urgent'
type Status   = 'pending' | 'done' | 'dropped'

interface TodoItem {
  id: string
  student_id: string
  title: string
  content: string | null
  priority: Priority
  status: Status
  due_date: number | null
  recurrence: string | null
  agent_created: boolean
  reminded_at: number | null
  create_time: number
}

const PRIORITY_COLOR: Record<Priority, string> = {
  urgent: 'var(--danger)',
  high:   'var(--orange)',
  normal: 'var(--primary)',
  low:    'var(--text-muted)',
}

const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: '紧急',
  high:   '高',
  normal: '普通',
  low:    '低',
}

export default function Todo(): React.ReactElement {
  const { toast } = useToast()
  const [todos, setTodos]               = useState<TodoItem[]>([])
  const [overdueCount, setOverdueCount] = useState(0)
  const [filter, setFilter]             = useState<Status>('pending')
  const [loading, setLoading]           = useState(true)
  const [creating, setCreating]         = useState(false)
  const [newTitle, setNewTitle]         = useState('')
  const [newPriority, setNewPriority]   = useState<Priority>('normal')
  const [newDueDate, setNewDueDate]     = useState('')
  const [newContent, setNewContent]     = useState('')
  const titleRef                        = useRef<HTMLInputElement>(null)
  const [studentId, setStudentId]       = useState<string | null>(null)

  useEffect(() => { getEffectiveStudentId().then(id => { if (id) setStudentId(id) }) }, [])

  async function loadTodos() {
    if (!studentId) return
    setLoading(true)
    try {
      const res = await api.get(`/api/todo/${studentId}?status=${filter}`)
      if (res.todos) {
        setTodos(res.todos)
        setOverdueCount(res.overdueCount ?? 0)
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadTodos() }, [filter, studentId])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim() || !studentId) return
    try {
      const res = await api.post('/api/todo', {
        student_id: studentId,
        title: newTitle.trim(),
        content: newContent.trim() || undefined,
        priority: newPriority,
        due_date: newDueDate ? new Date(newDueDate).getTime() : undefined,
      })
      if (res.success !== false) {
        toast('待办已创建')
        setNewTitle(''); setNewContent(''); setNewDueDate('')
        setCreating(false)
        loadTodos()
      } else {
        toast(res.error || '创建失败', 'error')
      }
    } catch { toast('网络错误', 'error') }
  }

  async function handleStatus(id: string, status: Status) {
    await api.patch(`/api/todo/${id}`, { status })
    const label = status === 'done' ? '已完成' : status === 'pending' ? '已恢复' : '已放弃'
    toast(label)
    loadTodos()
  }

  async function handleDelete(id: string) {
    await api.delete(`/api/todo/${id}`)
    toast('已删除')
    loadTodos()
  }

  const tabs: Array<{ key: Status; label: string }> = [
    { key: 'pending', label: '待办' },
    { key: 'done',    label: '已完成' },
    { key: 'dropped', label: '已放弃' },
  ]

  return (
    <div className="page-enter" style={{ maxWidth: 700, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.035em', color: 'var(--text)' }}>智能待办</h1>
          {overdueCount > 0 && (
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)', background: 'var(--danger-bg)', padding: '1px 8px', borderRadius: 10, border: '1px solid var(--danger-border)' }}>
              {overdueCount} 项逾期
            </span>
          )}
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => { setCreating(true); setTimeout(() => titleRef.current?.focus(), 50) }}
          style={{ gap: 5 }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新建待办
        </button>
      </div>

      {/* ── Create form ── */}
      {creating && (
        <div className="card" style={{ marginBottom: 20, borderColor: 'var(--primary-ring)' }}>
          <form onSubmit={handleCreate}>
            <input
              ref={titleRef}
              className="form-control"
              placeholder="这件事叫什么…"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setCreating(false) }}
              style={{ marginBottom: 10, fontSize: 14, fontWeight: 500 }}
            />
            <textarea
              className="form-control"
              placeholder="备注（可选）"
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              rows={2}
              style={{ marginBottom: 12, fontSize: 13, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                className="form-control"
                value={newPriority}
                onChange={e => setNewPriority(e.target.value as Priority)}
                style={{ width: 'auto', fontSize: 13 }}
              >
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map(p => (
                  <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                ))}
              </select>
              <input
                type="datetime-local"
                className="form-control"
                value={newDueDate}
                onChange={e => setNewDueDate(e.target.value)}
                style={{ width: 'auto', fontSize: 13 }}
              />
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCreating(false)}>取消</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={!newTitle.trim()}>创建</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Filter tabs ── */}
      <div className="tab-bar">
        {tabs.map(tab => (
          <button key={tab.key} className={`tab-item${filter === tab.key ? ' active' : ''}`} onClick={() => setFilter(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── List ── */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 8 }} />)}
        </div>
      ) : todos.length === 0 ? (
        <div className="empty-state" style={{ paddingTop: 64 }}>
          <div className="empty-icon">
            {filter === 'pending'
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            }
          </div>
          <h3>{filter === 'pending' ? '暂无待办' : filter === 'done' ? '还没有完成的记录' : '没有放弃的事项'}</h3>
          {filter === 'pending' && <p>点击右上角「新建待办」开始记录你的任务</p>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {todos.map(todo => (
            <TodoCard
              key={todo.id}
              todo={todo}
              onComplete={() => handleStatus(todo.id, 'done')}
              onDrop={()     => handleStatus(todo.id, 'dropped')}
              onDelete={()   => handleDelete(todo.id)}
              onRestore={()  => handleStatus(todo.id, 'pending')}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TodoCard({ todo, onComplete, onDrop, onDelete, onRestore }: {
  todo: TodoItem
  onComplete: () => void
  onDrop:     () => void
  onDelete:   () => void
  onRestore:  () => void
}) {
  const [pendingDelete, setPendingDelete] = useState(false)
  const isOverdue = todo.status === 'pending' && !!todo.due_date && todo.due_date < Date.now()
  const dueDateStr = todo.due_date
    ? new Date(todo.due_date).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${isOverdue ? 'var(--danger-border)' : 'var(--border)'}`,
      borderLeft: `3px solid ${PRIORITY_COLOR[todo.priority]}`,
      borderRadius: 8,
      padding: '12px 16px',
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
      opacity: todo.status !== 'pending' ? 0.6 : 1,
      transition: 'opacity .15s',
    }}>
      {/* Checkbox */}
      <div style={{ paddingTop: 2, flexShrink: 0 }}>
        {todo.status === 'pending' ? (
          <button
            onClick={onComplete}
            title="标记完成"
            className="hover-primary"
            style={{
              width: 17, height: 17, borderRadius: 4,
              border: '1.5px solid var(--border)',
              background: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all .15s',
            }}
          />
        ) : (
          <div style={{
            width: 17, height: 17, borderRadius: 4,
            background: todo.status === 'done' ? 'var(--primary)' : 'var(--bg-secondary)',
            border: `1.5px solid ${todo.status === 'done' ? 'var(--primary)' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {todo.status === 'done' && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 13.5, fontWeight: 500, color: 'var(--text)',
            textDecoration: todo.status === 'done' ? 'line-through' : 'none',
            opacity: todo.status === 'done' ? 0.7 : 1,
          }}>
            {todo.title}
          </span>
          {todo.agent_created && (
            <span style={{ fontSize: 10.5, padding: '1px 6px', borderRadius: 4, background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 500 }}>
              AI 创建
            </span>
          )}
          {isOverdue && (
            <span style={{ fontSize: 10.5, padding: '1px 6px', borderRadius: 4, background: 'var(--danger-bg)', color: 'var(--danger)', fontWeight: 600, border: '1px solid var(--danger-border)' }}>
              已逾期
            </span>
          )}
        </div>
        {todo.content && (
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
            {todo.content}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: PRIORITY_COLOR[todo.priority], display: 'inline-block' }} />
            {PRIORITY_LABEL[todo.priority]}
          </span>
          {dueDateStr && (
            <span style={{ fontSize: 11, color: isOverdue ? 'var(--danger)' : 'var(--text-muted)' }}>
              截止 {dueDateStr}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 2, flexShrink: 0, paddingTop: 1 }}>
        {todo.status === 'pending' && (
          <button
            onClick={onDrop}
            className="hover-bg"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: '3px 7px', borderRadius: 4, transition: 'all .12s' }}
          >
            放弃
          </button>
        )}
        {todo.status !== 'pending' && (
          <button
            onClick={onRestore}
            className="hover-primary-light"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, padding: '3px 7px', borderRadius: 4, transition: 'background .12s' }}
          >
            恢复
          </button>
        )}
        <button
          onClick={() => {
            if (!pendingDelete) {
              setPendingDelete(true)
              setTimeout(() => setPendingDelete(false), 3000)
            } else {
              onDelete()
            }
          }}
          className="hover-danger"
          style={{
            background: pendingDelete ? 'var(--danger-bg)' : 'none',
            border: pendingDelete ? '1px solid var(--danger-border)' : 'none',
            cursor: 'pointer', color: 'var(--danger)', fontSize: 12,
            padding: '3px 7px', borderRadius: 4, transition: 'all .12s',
            fontWeight: pendingDelete ? 600 : 400,
          }}
        >
          {pendingDelete ? '确认?' : '删除'}
        </button>
      </div>
    </div>
  )
}
