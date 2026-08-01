import React, { useEffect, useState } from 'react'
import { useToast } from '../context/ToastContext'

const tok = () => localStorage.getItem('syncToken') || ''

interface User {
  id: string
  email: string
  displayName: string
  role: string
  createdAt: number
  hasSetPassword: boolean
  msgCount: number
  isAdmin: boolean
}

interface Stats {
  totalUsers: number
  totalMsgs: number
  activeToday: number
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
}

function Avatar({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%',
      background: isAdmin ? 'var(--primary-light)' : 'var(--bg-secondary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 700,
      color: isAdmin ? 'var(--primary)' : 'var(--text-muted)',
      flexShrink: 0, border: `1px solid ${isAdmin ? 'var(--primary-ring)' : 'var(--border)'}`,
    }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export default function Admin(): React.ReactElement {
  const { toast } = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')

  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const [resetId, setResetId] = useState<string | null>(null)
  const [resetPwd, setResetPwd] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const headers = { 'Content-Type': 'application/json', 'x-sync-token': tok() }

  const load = async () => {
    setLoading(true)
    try {
      const [usersRes, statsRes] = await Promise.all([
        fetch('/api/admin/users', { headers }).then(r => r.json()),
        fetch('/api/admin/stats', { headers }).then(r => r.json()),
      ])
      if (usersRes.success) setUsers(usersRes.data)
      if (statsRes.success) setStats(statsRes.data)
    } catch { toast('加载失败', 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: string, name: string) => {
    if (pendingDelete !== id) {
      setPendingDelete(id)
      setTimeout(() => setPendingDelete(null), 3000)
      return
    }
    setPendingDelete(null)
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE', headers }).then(r => r.json())
    if (res.success) { setUsers(u => u.filter(x => x.id !== id)); toast(`已删除用户「${name}」`) }
    else toast(res.error || '删除失败', 'error')
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail.trim() || !newPassword || !newName.trim()) { toast('请填写完整信息', 'error'); return }
    setCreating(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST', headers,
      body: JSON.stringify({ email: newEmail.trim(), password: newPassword, displayName: newName.trim() }),
    }).then(r => r.json())
    setCreating(false)
    if (res.success) {
      setShowCreate(false); setNewEmail(''); setNewPassword(''); setNewName('')
      toast(`已创建用户「${newName.trim()}」`)
      load()
    } else { toast(res.error || '创建失败', 'error') }
  }

  const handleResetPwd = async (id: string) => {
    if (!resetPwd || resetPwd.length < 6) { toast('密码至少 6 位', 'error'); return }
    const res = await fetch(`/api/admin/users/${id}/reset-password`, {
      method: 'POST', headers, body: JSON.stringify({ newPassword: resetPwd }),
    }).then(r => r.json())
    if (res.success) { setResetId(null); setResetPwd(''); toast('密码已重置') }
    else toast(res.error || '重置失败', 'error')
  }

  const filtered = users.filter(u => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return u.displayName.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
  })

  if (loading) return (
    <div className="page-enter">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <div className="skeleton" style={{ height: 28, width: 140, borderRadius: 6 }} />
        <div className="skeleton" style={{ height: 34, width: 90, borderRadius: 6 }} />
      </div>
      <div className="skeleton" style={{ height: 42, borderRadius: 8, marginBottom: 16 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 8 }} />)}
      </div>
    </div>
  )

  return (
    <div className="page-enter">
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.035em', color: 'var(--text)', marginBottom: 4 }}>管理面板</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>用户账号管理与站点数据监控</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(v => !v)} style={{ flexShrink: 0 }}>
          {showCreate ? '取消' : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>新建用户</>}
        </button>
      </div>

      {/* ── Stats ── */}
      {stats && (
        <div className="grid-3" style={{ marginBottom: 28 }}>
          <div className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div className="stat-label">注册用户</div>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
            </div>
            <div className="stat-value">{stats.totalUsers}</div>
            <div className="stat-sub">累计账号</div>
          </div>
          <div className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div className="stat-label">今日活跃</div>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </div>
            </div>
            <div className="stat-value">{stats.activeToday}</div>
            <div className="stat-sub">有对话记录</div>
          </div>
          <div className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div className="stat-label">总消息数</div>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
            </div>
            <div className="stat-value">{stats.totalMsgs.toLocaleString()}</div>
            <div className="stat-sub">全部用户累计</div>
          </div>
        </div>
      )}

      {/* ── Create form ── */}
      {showCreate && (
        <div className="card" style={{ marginBottom: 20, borderColor: 'var(--primary-ring)', background: 'var(--bg)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 16 }}>新建用户</h3>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5, color: 'var(--text-secondary)' }}>邮箱地址</label>
                <input className="form-control" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@example.com" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5, color: 'var(--text-secondary)' }}>初始密码</label>
                <input className="form-control" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="至少 6 位" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5, color: 'var(--text-secondary)' }}>显示名称</label>
                <input className="form-control" type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="用户昵称" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowCreate(false) }}>取消</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>{creating ? '创建中…' : '创建用户'}</button>
            </div>
          </form>
        </div>
      )}

      {/* ── User list ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>用户列表</span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 10, background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
              {filtered.length}
            </span>
          </div>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索用户…"
            className="form-control"
            style={{ width: 180, fontSize: 12.5, padding: '5px 10px' }}
          />
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)' }}>
              {['用户', '角色', '消息数', '注册时间', '操作'].map(h => (
                <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                {search ? '未找到匹配用户' : '暂无用户'}
              </td></tr>
            )}
            {filtered.map(u => (
              <React.Fragment key={u.id}>
                <tr className="tr-hover" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={u.displayName} isAdmin={u.isAdmin} />
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {u.displayName}
                          {!u.hasSetPassword && (
                            <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontWeight: 500 }}>未设密码</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{u.email || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span className={`badge ${u.role === 'admin' ? 'badge-yellow' : u.role === 'student' ? 'badge-blue' : 'badge-gray'}`}>
                      {u.role === 'admin' ? '管理员' : u.role === 'student' ? '学生' : '用户'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text)', fontWeight: 500 }}>{u.msgCount.toLocaleString()}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(u.createdAt)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => setResetId(resetId === u.id ? null : u.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', padding: '3px 8px', borderRadius: 4, transition: 'background .12s, color .12s' }}
                      >
                        重置密码
                      </button>
                      {!u.isAdmin && (
                        <button
                          onClick={() => handleDelete(u.id, u.displayName)}
                          style={{
                            background: pendingDelete === u.id ? 'var(--danger-bg)' : 'none',
                            border: pendingDelete === u.id ? '1px solid var(--danger-border)' : 'none',
                            cursor: 'pointer', fontSize: 12,
                            color: 'var(--danger)', padding: '3px 8px', borderRadius: 4, transition: 'all .15s',
                            fontWeight: pendingDelete === u.id ? 700 : 400,
                          }}
                        >
                          {pendingDelete === u.id ? '确认删除?' : '删除'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {resetId === u.id && (
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                    <td colSpan={5} style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 420 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        <input
                          className="form-control"
                          type="password"
                          value={resetPwd}
                          onChange={e => setResetPwd(e.target.value)}
                          placeholder="输入新密码（至少 6 位）"
                          style={{ flex: 1, fontSize: 13, padding: '6px 10px' }}
                          autoFocus
                        />
                        <button className="btn btn-primary btn-sm" onClick={() => handleResetPwd(u.id)}>确认重置</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setResetId(null); setResetPwd('') }}>取消</button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
