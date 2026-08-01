import React, { createContext, useContext, useState, useCallback } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastCtx {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastCtx>({ toast: () => {} })

export function useToast(): ToastCtx {
  return useContext(ToastContext)
}

const COLORS: Record<ToastType, { bg: string; color: string; border: string; dot: string }> = {
  success: { bg: 'var(--success-bg)', color: 'var(--success)', border: 'var(--success-border)', dot: 'var(--success)' },
  error:   { bg: 'var(--danger-bg)',  color: 'var(--danger)',  border: 'var(--danger-border)',  dot: 'var(--danger)' },
  info:    { bg: 'var(--info-bg)',    color: 'var(--info)',    border: 'var(--info-border)',     dot: 'var(--info)' },
}

export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts(prev => [...prev.slice(-4), { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div style={{
        position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
        zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none', minWidth: 220, maxWidth: 380,
      }}>
        {toasts.map(t => {
          const c = COLORS[t.type]
          return (
            <div key={t.id} className="toast-item" style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 9,
              background: c.bg, color: c.color,
              border: `1px solid ${c.border}`,
              boxShadow: 'var(--shadow-md)',
              fontSize: 13, fontWeight: 600, lineHeight: 1.4,
              pointerEvents: 'auto',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
              {t.message}
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
