import React, { useState, useRef, useEffect, useCallback } from 'react'
import { marked } from 'marked'

interface Message {
  id: string
  role: 'user' | 'ai'
  content: string
  time: string
  error?: boolean
}

// Configure marked for inline rendering (no wrapping <p> tags for single-line)
marked.setOptions({ breaks: true, gfm: true })

function renderMd(text: string): string {
  return marked.parse(text) as string
}

let msgCounter = 0
function makeId(): string { return String(++msgCounter) }

function Chat(): React.ReactElement {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = {
      id: makeId(),
      role: 'user',
      content: text,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await window.api.chat.send(text)
      const aiMsg: Message = {
        id: makeId(),
        role: 'ai',
        content: res.success ? String(res.data) : (res.error || '请求失败'),
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        error: !res.success
      }
      setMessages((prev) => [...prev, aiMsg])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: 'ai', content: '网络错误，请重试', time: '', error: true }
      ])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [input, loading])

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 0 16px 0', flexShrink: 0
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>AI 对话</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
            与 PersonalAC 直接对话，可提问或讨论学习内容
          </p>
        </div>
        {messages.length > 0 && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setMessages([])}
          >
            清空对话
          </button>
        )}
      </div>

      {/* Message area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #e5e7eb',
        padding: '16px 20px',
        marginBottom: 12
      }}>
        {messages.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', color: '#9ca3af', userSelect: 'none'
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>开始和 AI 对话</div>
            <div style={{ fontSize: 13 }}>输入消息，按 Enter 发送，Shift+Enter 换行</div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 16
            }}
          >
            {/* AI avatar */}
            {msg.role === 'ai' && (
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: '#4f46e5', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, flexShrink: 0, marginRight: 10, marginTop: 2
              }}>
                AI
              </div>
            )}

            <div style={{ maxWidth: '72%' }}>
              {/* Bubble */}
              <div style={{
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: msg.role === 'user'
                  ? '#4f46e5'
                  : msg.error ? '#fef2f2' : '#f3f4f6',
                color: msg.role === 'user' ? '#fff' : msg.error ? '#b91c1c' : '#111827',
                fontSize: 14,
                lineHeight: 1.6,
                wordBreak: 'break-word'
              }}>
                {msg.role === 'ai' && !msg.error ? (
                  <div
                    className="markdown-body"
                    style={{ all: 'unset', display: 'block', fontSize: 14, lineHeight: 1.6, color: 'inherit' }}
                    dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }}
                  />
                ) : (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                )}
              </div>
              {/* Timestamp */}
              {msg.time && (
                <div style={{
                  fontSize: 11, color: '#9ca3af', marginTop: 4,
                  textAlign: msg.role === 'user' ? 'right' : 'left'
                }}>
                  {msg.time}
                </div>
              )}
            </div>

            {/* User avatar */}
            {msg.role === 'user' && (
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: '#7c3aed', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, flexShrink: 0, marginLeft: 10, marginTop: 2
              }}>
                S
              </div>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: '#4f46e5', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, flexShrink: 0
            }}>
              AI
            </div>
            <div style={{
              padding: '10px 16px', background: '#f3f4f6',
              borderRadius: '18px 18px 18px 4px', display: 'flex', gap: 4, alignItems: 'center'
            }}>
              <TypingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{
        flexShrink: 0,
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #e5e7eb',
        padding: '12px 14px',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-end'
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="输入消息… （Enter 发送，Shift+Enter 换行）"
          disabled={loading}
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            border: 'none',
            outline: 'none',
            fontSize: 14,
            lineHeight: 1.6,
            fontFamily: 'inherit',
            background: 'transparent',
            maxHeight: 120,
            overflowY: 'auto',
            color: loading ? '#9ca3af' : '#111827'
          }}
          onInput={(e) => {
            const t = e.currentTarget
            t.style.height = 'auto'
            t.style.height = Math.min(t.scrollHeight, 120) + 'px'
          }}
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={send}
          disabled={loading || !input.trim()}
          style={{ flexShrink: 0, height: 36, padding: '0 16px' }}
        >
          {loading ? '…' : '发送'}
        </button>
      </div>
    </div>
  )
}

function TypingDots(): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 20 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#9ca3af',
            animation: `typing-dot 1.2s ${i * 0.2}s ease-in-out infinite`
          }}
        />
      ))}
      <style>{`
        @keyframes typing-dot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

export default Chat
