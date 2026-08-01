import React, { useState, useEffect } from 'react'
import { authApi, type StudentRecord } from '../api/http'
import { useToast } from '../context/ToastContext'

function copyText(text: string, setCopied: (v: boolean) => void) {
  navigator.clipboard.writeText(text).then(() => {
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  })
}

// ── 客户端设置面板 ─────────────────────────────────────────────────────────
function ClientConfig({ studentId }: { studentId: string }): React.ReactElement {
  const { toast } = useToast()
  const [blockedApps, setBlockedApps] = useState('')
  const [mustDoLock, setMustDoLock] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch(`/api/client/config-admin/${studentId}`, {
      headers: { 'x-sync-token': localStorage.getItem('syncToken') || '' }
    })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          setBlockedApps((d.data.blocked_apps ?? []).join(', '))
          setMustDoLock(d.data.must_do_lock !== false)
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [studentId])

  async function handleSave() {
    setSaving(true)
    const apps = blockedApps.split(',').map(s => s.trim()).filter(Boolean)
    const res = await fetch(`/api/client/config/${studentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-sync-token': localStorage.getItem('syncToken') || '' },
      body: JSON.stringify({ blocked_apps: apps, must_do_lock: mustDoLock })
    }).then(r => r.json()).catch(() => null)
    setSaving(false)
    if (res?.success !== false) toast('客户端设置已保存')
    else toast(res?.error || '保存失败', 'error')
  }

  if (!loaded) return <div className="skeleton" style={{ height: 60, borderRadius: 8, marginTop: 12 }} />

  return (
    <div style={{
      marginTop: 12, padding: '14px 16px',
      background: 'var(--bg-secondary)', borderRadius: 8,
      border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        客户端设置
      </div>

      {/* Must-do lock */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <input
          type="checkbox"
          id={`lock-${studentId}`}
          checked={mustDoLock}
          onChange={e => setMustDoLock(e.target.checked)}
          style={{ accentColor: 'var(--primary)', width: 14, height: 14 }}
        />
        <label htmlFor={`lock-${studentId}`} style={{ fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          必须完成 must-do 任务才能解锁桌宠模式
        </label>
      </div>

      {/* Blocked apps */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
          禁用进程（逗号分隔，例如：chrome.exe, steam.exe）
        </label>
        <input
          className="form-control"
          type="text"
          value={blockedApps}
          onChange={e => setBlockedApps(e.target.value)}
          placeholder="留空则不限制"
          style={{ fontSize: 12, height: 34 }}
        />
      </div>

      <button
        className="btn btn-primary btn-sm"
        onClick={handleSave}
        disabled={saving}
        style={{ fontSize: 12 }}
      >
        {saving ? '保存中…' : '保存'}
      </button>
    </div>
  )
}

// ── 学生卡片 ───────────────────────────────────────────────────────────────
function StudentCard({ student, onDeleted, onInviteReset }: {
  student: StudentRecord
  onDeleted: (id: string) => void
  onInviteReset: (id: string, newCode: string) => void
}): React.ReactElement {
  const { toast } = useToast()
  const [copiedLink, setCopiedLink] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [showConfig, setShowConfig] = useState(false)

  const inviteLink = student.inviteCode
    ? `${window.location.origin}/join/${student.inviteCode}`
    : null

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    const res = await authApi.deleteStudent(student.id)
    if (res.success !== false) {
      toast(`已删除学生「${student.name}」`)
      onDeleted(student.id)
    } else {
      toast('删除失败', 'error')
      setConfirmDelete(false)
    }
  }

  async function handleResetInvite() {
    setResetting(true)
    try {
      const res = await fetch(`/api/auth/students/${student.id}/reset-invite`, {
        method: 'POST',
        headers: { 'x-sync-token': localStorage.getItem('syncToken') || '' }
      })
      const d = await res.json()
      if (d.success) {
        onInviteReset(student.id, d.data.inviteCode)
        toast('邀请码已重置，新链接已生成')
      } else {
        toast('重置失败', 'error')
      }
    } finally { setResetting(false) }
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '14px 16px',
    }}>
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Avatar */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: 'var(--primary-light)', border: '1px solid var(--primary-ring)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, color: 'var(--primary)'
        }}>
          {student.name.charAt(0)}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{student.name}</span>
            {student.grade && <span className="badge badge-gray">{student.grade}</span>}
            {student.hasSetPassword
              ? <span className="badge badge-green">已激活</span>
              : <span className="badge badge-yellow">待激活</span>}
          </div>

          {inviteLink && !student.hasSetPassword && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>邀请链接</span>
              <code style={{
                fontSize: 11, color: 'var(--text-secondary)',
                background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 4,
                fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', maxWidth: 220
              }}>
                {inviteLink}
              </code>
              <button
                onClick={() => copyText(inviteLink, setCopiedLink)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, color: copiedLink ? 'var(--success)' : 'var(--primary)',
                  padding: '2px 4px', fontFamily: 'inherit', fontWeight: 500, flexShrink: 0
                }}
              >
                {copiedLink ? '已复制' : '复制'}
              </button>
            </div>
          )}
          {student.hasSetPassword && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>已激活，可直接登录</div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            className={`btn btn-sm ${showConfig ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowConfig(v => !v)}
            title="客户端设置"
          >
            客户端
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleResetInvite}
            disabled={resetting}
          >
            {resetting ? '重置中…' : '重置邀请码'}
          </button>
          <button
            className={`btn btn-sm ${confirmDelete ? 'btn-danger' : 'btn-ghost'}`}
            onClick={handleDelete}
            onBlur={() => setConfirmDelete(false)}
          >
            {confirmDelete ? '确认删除' : '删除'}
          </button>
        </div>
      </div>

      {/* Client config panel */}
      {showConfig && <ClientConfig studentId={student.id} />}
    </div>
  )
}

// ── 主页面 ─────────────────────────────────────────────────────────────────
export default function Accounts(): React.ReactElement {
  const { toast } = useToast()
  const [students, setStudents] = useState<StudentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newGrade, setNewGrade] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await authApi.listStudents()
    if (res.success && res.data) setStudents(res.data)
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) { toast('请填写姓名', 'error'); return }
    setSaving(true)
    const res = await authApi.createStudent(newName.trim(), newGrade.trim() || undefined)
    if (res.success && res.data) {
      setStudents(prev => [...prev, res.data!])
      setNewName(''); setNewGrade(''); setCreating(false)
      toast(`已创建学生「${newName.trim()}」`)
    } else {
      toast(res.error ?? '创建失败', 'error')
    }
    setSaving(false)
  }

  return (
    <div className="page-enter">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.035em', color: 'var(--text)', marginBottom: 4 }}>学生账号</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            创建账号后发邀请链接给学生，学生用客户端粘贴链接即可激活
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(c => !c)}>
          {creating ? '取消' : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>添加学生</>}
        </button>
      </div>

      {creating && (
        <div className="card" style={{ marginBottom: 20, borderTop: '2px solid var(--primary)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: 'var(--text)' }}>新建学生账号</h3>
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 160px', marginBottom: 0 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>姓名</label>
              <input className="form-control" type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="孩子的姓名" autoFocus />
            </div>
            <div className="form-group" style={{ flex: '1 1 120px', marginBottom: 0 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>年级 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>（可选）</span></label>
              <input className="form-control" type="text" value={newGrade} onChange={e => setNewGrade(e.target.value)} placeholder="例如：初三" />
            </div>
            <button type="submit" disabled={saving} className="btn btn-primary" style={{ flexShrink: 0 }}>
              {saving ? '创建中…' : '创建'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 10 }} />)}
        </div>
      ) : students.length === 0 ? (
        <div className="empty-state" style={{ padding: '48px 0' }}>
          <div className="empty-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            </svg>
          </div>
          <p>还没有绑定学生账号</p>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => setCreating(true)}>
            添加第一个学生
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>共 {students.length} 个学生账号</div>
          {students.map(s => (
            <StudentCard
              key={s.id}
              student={s}
              onDeleted={id => setStudents(prev => prev.filter(x => x.id !== id))}
              onInviteReset={(id, newCode) => setStudents(prev => prev.map(x => x.id === id ? { ...x, inviteCode: newCode, hasSetPassword: false } : x))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
