import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useToast } from '../context/ToastContext'

const tok = () => localStorage.getItem('syncToken') || ''
const api = (p: string, opts?: RequestInit) =>
  fetch(p, { ...opts, headers: { 'x-sync-token': tok(), 'Content-Type': 'application/json', ...(opts?.headers || {}) } })

// ── types ──────────────────────────────────────────────────────────────────

interface DriveEntry {
  name: string
  rel_path: string
  type: 'file' | 'dir'
  size?: number
  mime?: string
  modify_time?: number
}

interface DriveData {
  path: string
  dirs: DriveEntry[]
  files: DriveEntry[]
}

// ── helpers ────────────────────────────────────────────────────────────────

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function FileIcon({ mime, name, size = 18 }: { mime?: string; name?: string; size?: number }) {
  const ext = (name || '').split('.').pop()?.toLowerCase()
  const s = { width: size, height: size, flexShrink: 0 }
  const sw = 1.75

  if (mime?.startsWith('image/'))
    return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
  if (mime?.startsWith('video/'))
    return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
  if (mime?.startsWith('audio/'))
    return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
  if (mime === 'application/pdf' || ext === 'pdf')
    return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
  if (ext === 'zip' || ext === 'rar' || ext === '7z')
    return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
  if (ext === 'md' || ext === 'markdown' || mime?.startsWith('text/'))
    return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
  return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
}

function isTextMime(mime?: string): boolean {
  if (!mime) return false
  return mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml'
}

function isImageMime(mime?: string): boolean {
  return !!mime?.startsWith('image/')
}

function sidParam(sid: string) {
  return sid ? `?studentId=${sid}` : ''
}

// ── Editor ─────────────────────────────────────────────────────────────────

function Editor({ relPath, sid, onClose }: { relPath: string; sid: string; onClose: () => void }) {
  const { toast } = useToast()
  const [content, setContent] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    api(`/api/drive/file/${relPath}${sidParam(sid)}`)
      .then(r => r.text())
      .then(t => { setContent(t); setDirty(false) })
      .catch(() => setContent(''))
  }, [relPath, sid])

  const save = useCallback(async () => {
    if (content === null) return
    setSaving(true)
    const res = await api(`/api/drive/file/${relPath}${sidParam(sid)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }).then(r => r.json()).catch(() => null)
    setSaving(false)
    if (res?.success !== false) {
      setDirty(false)
      toast('已保存')
    } else {
      toast(res?.error || '保存失败', 'error')
    }
  }, [content, relPath, sid, toast])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save() }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [save, onClose])

  const name = relPath.split('/').pop()

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--overlay)', zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12, width: '100%', maxWidth: 860,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--shadow-lg)',
      }}>
        {/* header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ flex: 1, fontWeight: 600, color: 'var(--text)', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--text-muted)', display: 'flex' }}><FileIcon mime={undefined} name={name} size={16} /></span>
            {name} {dirty && <span style={{ color: 'var(--primary)', fontSize: 12 }}>●</span>}
          </span>
          <button
            className={`btn btn-sm ${dirty ? 'btn-primary' : 'btn-secondary'}`}
            onClick={save}
            disabled={saving || !dirty}
          >
            {saving ? '保存中…' : '保存  ⌘S'}
          </button>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4,
          }} aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {/* editor */}
        <textarea
          ref={textRef}
          value={content ?? ''}
          onChange={e => { setContent(e.target.value); setDirty(true) }}
          style={{
            flex: 1, padding: 20, border: 'none', resize: 'none', outline: 'none',
            fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
            fontSize: 13.5, lineHeight: 1.7, color: 'var(--text)', minHeight: 400,
            background: 'var(--bg)',
          }}
          placeholder={content === null ? '加载中…' : ''}
          spellCheck={false}
        />
        <div style={{ padding: '8px 20px', borderTop: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 12 }}>
          {relPath} · Esc 关闭 · Ctrl+S 保存
        </div>
      </div>
    </div>
  )
}

// ── Preview ────────────────────────────────────────────────────────────────

function Preview({ entry, sid, onEdit, onClose }: {
  entry: DriveEntry; sid: string; onEdit: () => void; onClose: () => void
}) {
  const isImg = isImageMime(entry.mime)
  const isText = isTextMime(entry.mime)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--overlay)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12, maxWidth: 900, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden', minWidth: 320,
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ flex: 1, fontWeight: 600, color: 'var(--text)', fontSize: 15 }}>{entry.name}</span>
          {isText && (
            <button className="btn btn-primary btn-sm" onClick={onEdit}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              编辑
            </button>
          )}
          <a
            href={`/api/drive/file/${entry.rel_path}${sid ? `?studentId=${sid}&download=1` : '?download=1'}`}
            download={entry.name}
            className="btn btn-secondary btn-sm"
            style={{ textDecoration: 'none' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            下载
          </a>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4,
          }} aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: isImg ? 0 : 20 }}>
          {isImg ? (
            <img
              src={`/api/drive/file/${entry.rel_path}${sidParam(sid)}`}
              alt={entry.name}
              style={{ display: 'block', maxWidth: '100%', maxHeight: '75vh', margin: 'auto' }}
            />
          ) : (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 0 }}>
                <FileIcon mime={entry.mime} name={entry.name} size={48} />
              </div>
              <div style={{ marginTop: 12 }}>{entry.name}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{fmtSize(entry.size || 0)}</div>
              <div style={{ marginTop: 20 }}>
                <a
                  href={`/api/drive/file/${entry.rel_path}${sid ? `?studentId=${sid}&download=1` : '?download=1'}`}
                  download={entry.name}
                  style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}
                >点击下载</a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function Drive() {
  const { toast } = useToast()
  const [sid, setSid] = useState('')
  const [curPath, setCurPath] = useState('')
  const [data, setData] = useState<DriveData | null>(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<DriveEntry | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [newName, setNewName] = useState('')
  const [showNewFile, setShowNewFile] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // resolve student id
  useEffect(() => {
    fetch('/api/auth/me', { headers: { 'x-sync-token': tok() } })
      .then(r => r.json())
      .then(j => {
        if (j.data?.role === 'student') { setSid(j.data.id) }
        else {
          fetch('/api/auth/students', { headers: { 'x-sync-token': tok() } })
            .then(r => r.json())
            .then(j2 => { if (j2.data?.[0]) setSid(j2.data[0].id) })
        }
      })
  }, [])

  const load = useCallback(() => {
    if (!sid) return
    setLoading(true)
    api(`/api/drive/files?path=${encodeURIComponent(curPath)}&studentId=${sid}`)
      .then(r => r.json())
      .then(j => { if (j.success) setData(j.data) })
      .finally(() => setLoading(false))
  }, [sid, curPath])

  useEffect(() => { load() }, [load])

  const breadcrumbs = curPath ? curPath.split('/') : []

  const goTo = (p: string) => { setCurPath(p); setData(null) }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const b64 = (reader.result as string).split(',')[1]
      const res = await api(`/api/drive/upload${sidParam(sid)}`, {
        method: 'POST',
        body: JSON.stringify({ name: file.name, content_b64: b64, path: curPath, mime: file.type }),
      }).then(r => r.json()).catch(() => null)
      setUploading(false)
      e.target.value = ''
      if (res?.success !== false) { toast(`已上传 ${file.name}`); load() }
      else toast(res?.error || '上传失败', 'error')
    }
    reader.readAsDataURL(file)
  }

  const createFile = async () => {
    if (!newName.trim()) return
    const relPath = curPath ? `${curPath}/${newName.trim()}` : newName.trim()
    const res = await api(`/api/drive/upload${sidParam(sid)}`, {
      method: 'POST',
      body: JSON.stringify({ name: newName.trim(), content_b64: btoa(''), path: curPath }),
    }).then(r => r.json()).catch(() => null)
    if (res?.success !== false) {
      setShowNewFile(false)
      setNewName('')
      load()
      setEditing(relPath)
    } else {
      toast(res?.error || '创建失败', 'error')
    }
  }

  const deleteFile = async (entry: DriveEntry) => {
    if (pendingDelete !== entry.rel_path) {
      setPendingDelete(entry.rel_path)
      setTimeout(() => setPendingDelete(null), 3000)
      return
    }
    setPendingDelete(null)
    const res = await api(`/api/drive/file/${entry.rel_path}${sidParam(sid)}`, { method: 'DELETE' })
      .then(r => r.json()).catch(() => null)
    if (res?.success !== false) { toast(`已删除 ${entry.name}`); load() }
    else toast(res?.error || '删除失败', 'error')
  }

  return (
    <div className="page-enter" style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.035em', color: 'var(--text)' }}>工作区文件</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>客户端同步的文件，AI 可直接读写</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
          <button
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? '上传中…' : (
              <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>上传文件</>
            )}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowNewFile(true)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            新建文件
          </button>
        </div>
      </div>

      {/* new file input */}
      {showNewFile && (
        <div style={{
          background: 'var(--primary-light)', border: '1px solid var(--primary-ring)', borderRadius: 10,
          padding: 16, marginBottom: 16, display: 'flex', gap: 8,
        }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createFile(); if (e.key === 'Escape') setShowNewFile(false) }}
            placeholder="文件名，如 notes.md"
            className="form-control"
            style={{ flex: 1, fontSize: 14 }}
          />
          <button className="btn btn-primary" onClick={createFile}>创建</button>
          <button className="btn btn-secondary" onClick={() => setShowNewFile(false)}>取消</button>
        </div>
      )}

      {/* breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => goTo('')} style={{
          background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer',
          fontWeight: 600, fontSize: 13, padding: '2px 4px',
        }}>工作区根目录</button>
        {breadcrumbs.map((seg, i) => (
          <React.Fragment key={i}>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <button onClick={() => goTo(breadcrumbs.slice(0, i + 1).join('/'))} style={{
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 4px',
              color: i === breadcrumbs.length - 1 ? 'var(--text)' : 'var(--primary)', fontWeight: 600,
            }}>{seg}</button>
          </React.Fragment>
        ))}
      </div>

      {/* file list */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {loading && (
          <div style={{ padding: 16 }}>
            {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 44, borderRadius: 0, marginBottom: 1 }} />)}
          </div>
        )}
        {!loading && data && (data.dirs.length + data.files.length) === 0 && (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              </div>
            </div>
            <div>此目录为空</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>客户端开启同步后，文件会自动出现在这里</div>
          </div>
        )}
        {!loading && data && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '10px 20px', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>名称</th>
                <th style={{ textAlign: 'right', padding: '10px 16px', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, width: 90 }}>大小</th>
                <th style={{ textAlign: 'right', padding: '10px 16px', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, width: 140 }}>修改时间</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.dirs.map(dir => (
                <tr key={dir.rel_path} className="tr-hover" style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => goTo(dir.rel_path)}
                >
                  <td style={{ padding: '12px 20px', fontSize: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ display: 'flex', color: 'var(--text-muted)' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
                      <span style={{ fontWeight: 500, color: 'var(--text)' }}>{dir.name}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', padding: '12px 16px', color: 'var(--text-muted)', fontSize: 13 }}>—</td>
                  <td style={{ textAlign: 'right', padding: '12px 16px', color: 'var(--text-muted)', fontSize: 13 }}>—</td>
                  <td></td>
                </tr>
              ))}
              {data.files.map(file => (
                <tr key={file.rel_path} className="tr-hover" style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => setPreview(file)}
                >
                  <td style={{ padding: '12px 20px', fontSize: 14 }}>
                    <span style={{ marginRight: 10, display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)' }}><FileIcon mime={file.mime} name={file.name} size={16} /></span>
                    <span style={{ color: 'var(--text)' }}>{file.name}</span>
                  </td>
                  <td style={{ textAlign: 'right', padding: '12px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
                    {fmtSize(file.size || 0)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '12px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
                    {file.modify_time ? fmtDate(file.modify_time) : '—'}
                  </td>
                  <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                    <button
                      onClick={e => { e.stopPropagation(); deleteFile(file) }}
                      style={{
                        background: 'none', border: pendingDelete === file.rel_path ? '1px solid var(--danger-border)' : 'none',
                        cursor: 'pointer', borderRadius: 4,
                        color: pendingDelete === file.rel_path ? 'var(--danger)' : 'var(--text-muted)',
                        fontSize: pendingDelete === file.rel_path ? 11 : 16,
                        fontWeight: pendingDelete === file.rel_path ? 600 : 400,
                        lineHeight: 1, padding: pendingDelete === file.rel_path ? '3px 6px' : 4,
                        transition: 'all .15s',
                      }}
                      title="删除"
                    >
                      {pendingDelete === file.rel_path ? '确认?' : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* info */}
      <div style={{
        marginTop: 20, padding: 16, background: 'var(--bg-secondary)', borderRadius: 10,
        border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)',
      }}>
        <strong style={{ color: 'var(--text-secondary)' }}>关于工作区文件：</strong>
        学生在客户端设置中开启文件同步并选择文件夹后，文件将自动同步到服务器。
        AI 可以读取、写入这里的文件（修改内容会在下次客户端同步时推送回本地）。
      </div>

      {/* modals */}
      {preview && !editing && (
        <Preview
          entry={preview}
          sid={sid}
          onEdit={() => { setEditing(preview.rel_path); setPreview(null) }}
          onClose={() => setPreview(null)}
        />
      )}
      {editing && (
        <Editor
          relPath={editing}
          sid={sid}
          onClose={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}
