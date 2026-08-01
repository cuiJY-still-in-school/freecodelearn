import React, { useEffect, useRef, useState } from 'react'
import { useToast } from '../context/ToastContext'

interface Notification {
  id: string
  content: string
  ts: number
  read: boolean
}

export default function NotificationBell(): React.ReactElement {
  const { toast } = useToast()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(false)

  const unread = notifications.filter(n => !n.read).length

  // 关闭下拉（点击外部）
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // SSE 订阅
  useEffect(() => {
    const token = localStorage.getItem('syncToken')
    if (!token) return
    // 延迟标记挂载完成，避免页面加载时的历史消息触发 toast
    const t = setTimeout(() => { mountedRef.current = true }, 3000)
    const es = new EventSource(`/api/notify/stream?token=${encodeURIComponent(token)}`)

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'agent_message' && data.content) {
          const note: Notification = {
            id: `${Date.now()}-${Math.random()}`,
            content: data.content,
            ts: data.ts || Date.now(),
            read: false
          }
          setNotifications(prev => [note, ...prev].slice(0, 50))
          // 只有页面已稳定后才弹 toast，避免刷新时把旧消息全部 toast
          if (mountedRef.current) {
            const short = data.content.length > 60 ? data.content.slice(0, 60) + '…' : data.content
            toast(`AI：${short}`, 'info')
          }
        }
      } catch {}
    }

    es.onerror = () => {
      // 静默重连，浏览器自动处理
    }

    return () => { es.close(); clearTimeout(t) }
  }, [toast])

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => { setOpen(v => !v); if (!open) markAllRead() }}
        style={{
          width: 32, height: 32, borderRadius: 8,
          border: '1px solid var(--border)',
          background: open ? 'var(--primary-light)' : 'transparent',
          cursor: 'pointer', position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)',
          transition: 'background 0.15s'
        }}
        title="AI 消息"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            width: 16, height: 16, borderRadius: '50%',
            background: 'var(--primary)', color: '#fff',
            fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 40,
          width: 320, maxHeight: 420, overflowY: 'auto',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: 'var(--shadow-lg)',
          zIndex: 1000
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid var(--border)',
            fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
            letterSpacing: '0.04em', textTransform: 'uppercase'
          }}>
            AI 消息
          </div>

          {notifications.length === 0 ? (
            <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
              暂无消息
            </div>
          ) : (
            notifications.map(n => (
              <div key={n.id} style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--border)',
                fontSize: 13, lineHeight: 1.6,
                color: 'var(--text)',
              }}>
                <div style={{ color: 'var(--text)', marginBottom: 2 }}>{n.content}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {new Date(n.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
