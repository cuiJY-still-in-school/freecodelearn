import React, { useState, useRef, useEffect, useCallback } from 'react'
import { marked } from 'marked'
import { chatApi, ApiMessage, MsgImage } from '../api/http'

interface Msg {
  id: string
  role: 'user' | 'ai'
  content: string
  images?: MsgImage[]
  time: string
  streaming?: boolean
  thinking?: string   // tool display text
  error?: boolean
}

marked.setOptions({ breaks: true, gfm: true })
const renderMd = (t: string): string => marked.parse(t) as string

let counter = 0
const uid = (): string => String(++counter)
const now = (): string => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

function AIAvatar({ pulse = false }: { pulse?: boolean }): React.ReactElement {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
      background: 'var(--primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      marginRight: 10, marginTop: 2,
      boxShadow: pulse ? '0 0 0 4px rgba(217,119,87,0.18)' : 'none',
      transition: 'box-shadow .3s'
    }}>
      {/* 四射神经节点 — 简洁 AI 标志 */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" fill="#fff" />
        <circle cx="12" cy="4"  r="1.8" fill="rgba(255,255,255,0.7)" />
        <circle cx="12" cy="20" r="1.8" fill="rgba(255,255,255,0.7)" />
        <circle cx="4"  cy="12" r="1.8" fill="rgba(255,255,255,0.7)" />
        <circle cx="20" cy="12" r="1.8" fill="rgba(255,255,255,0.7)" />
        <line x1="12" y1="9"  x2="12" y2="5.8" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2"/>
        <line x1="12" y1="15" x2="12" y2="18.2" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2"/>
        <line x1="9"  y1="12" x2="5.8" y2="12"  stroke="rgba(255,255,255,0.55)" strokeWidth="1.2"/>
        <line x1="15" y1="12" x2="18.2" y2="12"  stroke="rgba(255,255,255,0.55)" strokeWidth="1.2"/>
      </svg>
    </div>
  )
}

function TypingIndicator(): React.ReactElement {
  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: '3px 12px 12px 12px',
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      display: 'inline-flex', alignItems: 'center', gap: 5
    }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%',
          background: 'var(--primary)',
          display: 'inline-block',
          animation: `typingDot 1.1s ease-in-out ${i * 0.18}s infinite`
        }} />
      ))}
    </div>
  )
}

function UserAvatar({ initial }: { initial: string }): React.ReactElement {
  return (
    <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'var(--text)', color: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, marginLeft: 10, marginTop: 2 }}>
      {initial}
    </div>
  )
}

function ThinkingBadge({ text }: { text: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(217,119,87,0.08)', border: '1px solid rgba(217,119,87,0.2)', borderRadius: 20, fontSize: 12, color: 'var(--primary)', marginBottom: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', animation: 'blink .7s step-end infinite' }} />
      {text}
    </div>
  )
}

export default function Chat({ minimal = false }: { minimal?: boolean }): React.ReactElement {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [pendingImages, setPendingImages] = useState<MsgImage[]>([])
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const username = localStorage.getItem('username') || 'U'
  const initial = username.charAt(0).toUpperCase()

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const buildHistory = (current: Msg[]): ApiMessage[] =>
    current.filter(m => !m.error && (m.content || m.images?.length)).map(m => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.images?.length
        ? [...m.images, { type: 'text' as const, text: m.content }]
        : m.content
    }))

  const send = useCallback(() => {
    const text = input.trim()
    if ((!text && pendingImages.length === 0) || streaming) return
    setInput('')
    const imgs = [...pendingImages]
    setPendingImages([])

    const userMsg: Msg = { id: uid(), role: 'user', content: text, images: imgs, time: now() }
    setMsgs(prev => {
      const next = [...prev, userMsg]
      const aiId = uid()
      const placeholder: Msg = { id: aiId, role: 'ai', content: '', time: '', streaming: true }
      setStreaming(true)
      const ctrl = chatApi.stream(
        buildHistory([...next]),
        token => setMsgs(m => m.map(msg => msg.id === aiId ? { ...msg, content: msg.content + token, thinking: undefined } : msg)),
        () => {
          setMsgs(m => m.map(msg => msg.id === aiId ? { ...msg, streaming: false, thinking: undefined, time: now() } : msg))
          setStreaming(false)
          setTimeout(() => inputRef.current?.focus(), 0)
        },
        err => {
          setMsgs(m => m.map(msg => msg.id === aiId ? { ...msg, content: err, streaming: false, thinking: undefined, error: true, time: now() } : msg))
          setStreaming(false)
        },
        (_toolName, display) => setMsgs(m => m.map(msg => msg.id === aiId ? { ...msg, thinking: display } : msg))
      )
      abortRef.current = ctrl
      return [...next, placeholder]
    })
  }, [input, pendingImages, streaming])

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const handleImageFile = (file: File): void => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const data = (reader.result as string).split(',')[1]
      setPendingImages(prev => [...prev, { type: 'image', data, mediaType: file.type }])
    }
    reader.readAsDataURL(file)
  }

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>): void => {
    Array.from(e.target.files ?? []).forEach(handleImageFile)
    e.target.value = ''
  }

  const handlePaste = (e: React.ClipboardEvent): void => {
    Array.from(e.clipboardData.items).forEach(item => {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) handleImageFile(file)
      }
    })
  }

  const stopStream = (): void => {
    abortRef.current?.abort()
    setMsgs(m => m.map(msg => msg.streaming ? { ...msg, streaming: false, thinking: undefined, time: now() } : msg))
    setStreaming(false)
  }

  const height = minimal ? '100vh' : 'calc(100vh - 56px)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height }}>
      <style>{`
        @keyframes blink { 50% { opacity: 0 } }
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); opacity: .4 }
          30% { transform: translateY(-5px); opacity: 1 }
        }
      `}</style>

      {!minimal && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, flexShrink: 0 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>AI 对话</h1>
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              支持发送图片（截图/拍照）· Enter 发送 · Shift+Enter 换行
            </p>
          </div>
          {msgs.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => { if (streaming) stopStream(); setMsgs([]) }} style={{ color: 'var(--text-secondary)' }}>清空</button>
          )}
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-card)', borderRadius: minimal ? 0 : 'var(--radius-lg)', border: minimal ? 'none' : '1px solid var(--border)', padding: minimal ? '16px 20px' : '20px', marginBottom: 12 }}>
        {msgs.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', userSelect: 'none' }}>
            <div style={{ width: 48, height: 48, borderRadius: 10, background: 'rgba(217,119,87,0.08)', border: '1px solid rgba(217,119,87,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>开始对话</div>
            <div style={{ fontSize: 13 }}>问问题，或发送一张截图让 AI 分析</div>
          </div>
        ) : msgs.map(msg => (
          <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 20, alignItems: 'flex-start' }}>
            {msg.role === 'ai' && <AIAvatar pulse={msg.streaming} />}
            <div style={{ maxWidth: '74%' }}>
              {msg.thinking && <ThinkingBadge text={msg.thinking} />}
              {/* 等待首个 token 时显示三点动画 */}
              {msg.role === 'ai' && msg.streaming && !msg.content && !msg.thinking && (
                <TypingIndicator />
              )}
              {/* Images preview */}
              {msg.images?.map((img, i) => (
                <img key={i} src={`data:${img.mediaType};base64,${img.data}`} alt="上传图片"
                  style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, marginBottom: 6, display: 'block', border: '1px solid var(--border)' }} />
              ))}
              <div style={{
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '12px 12px 3px 12px' : '3px 12px 12px 12px',
                background: msg.role === 'user' ? 'var(--primary)' : msg.error ? 'rgba(220,38,38,0.06)' : 'var(--bg)',
                color: msg.role === 'user' ? '#fff' : msg.error ? '#dc2626' : 'var(--text)',
                fontSize: 14, lineHeight: 1.7, wordBreak: 'break-word',
                border: msg.role === 'ai' ? `1px solid ${msg.error ? 'rgba(220,38,38,0.18)' : 'var(--border)'}` : 'none',
                display: (!msg.content && msg.streaming) ? 'none' : undefined
              }}>
                {msg.role === 'ai' && !msg.error ? (
                  <>
                    <div className="markdown-body" style={{ all: 'unset', display: 'block', fontSize: 14, lineHeight: 1.7, color: 'inherit' }}
                      dangerouslySetInnerHTML={{ __html: msg.content ? renderMd(msg.content) : '' }} />
                    {msg.streaming && <span style={{ display: 'inline-block', width: 2, height: '1em', background: 'var(--primary)', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'blink .6s step-end infinite' }} />}
                  </>
                ) : (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                )}
              </div>
              {msg.time && !msg.streaming && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: msg.role === 'user' ? 'right' : 'left' }}>{msg.time}</div>
              )}
            </div>
            {msg.role === 'user' && <UserAvatar initial={initial} />}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Pending image previews */}
      {pendingImages.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          {pendingImages.map((img, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={`data:${img.mediaType};base64,${img.data}`} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
              <button onClick={() => setPendingImages(p => p.filter((_, j) => j !== i))}
                style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ flexShrink: 0, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', padding: '10px 12px', display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFilePick} />
        <button onClick={() => fileRef.current?.click()}
          style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}
          title="上传图片（支持试卷截图）">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
        </button>
        <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey} onPaste={handlePaste}
          placeholder="输入消息，或粘贴/上传图片…" disabled={streaming} rows={1}
          style={{ flex: 1, border: 'none', outline: 'none', resize: 'none', background: 'transparent', fontSize: 14, lineHeight: 1.6, color: 'var(--text)', fontFamily: 'inherit', padding: '2px 0', maxHeight: 160, overflowY: 'auto', opacity: streaming ? 0.5 : 1 }}
          onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px' }} />
        {streaming ? (
          <button onClick={stopStream} title="停止"
            style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
          </button>
        ) : (
          <button onClick={send} disabled={!input.trim() && pendingImages.length === 0}
            style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 7, border: 'none', background: (input.trim() || pendingImages.length > 0) ? 'var(--primary)' : 'var(--bg-secondary)', cursor: (input.trim() || pendingImages.length > 0) ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', color: (input.trim() || pendingImages.length > 0) ? '#fff' : 'var(--text-muted)', transition: 'all .12s' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
