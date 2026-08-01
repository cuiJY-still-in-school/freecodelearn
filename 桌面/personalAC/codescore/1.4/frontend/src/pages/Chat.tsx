import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { marked } from 'marked'
import { chatApi, ApiMessage, MsgImage } from '../api/http'
import { useToast } from '../context/ToastContext'
import { useUser } from '../context/UserContext'

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

interface RelayMeta {
  id: string
  from_role: string
  mime_type: string
  caption: string | null
  create_time: number
}

const tok = () => localStorage.getItem('syncToken') || ''

function GuardianAvatar(): React.ReactElement {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      background: '#92400E',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      marginRight: 10, marginTop: 2,
      boxShadow: '0 1px 4px rgba(146,64,14,0.2)',
    }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    </div>
  )
}

function RelayBubble({ item, onDismiss }: { item: RelayMeta; onDismiss: (id: string) => void }): React.ReactElement {
  const [imgSrc, setImgSrc] = React.useState<string | null>(null)
  const [imgLoading, setImgLoading] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)
  const who = item.from_role === 'guardian' ? '家长' : '孩子'
  const isText = item.mime_type === 'text/plain'

  async function loadImg() {
    if (imgSrc) { setExpanded(e => !e); return }
    setImgLoading(true)
    try {
      const res = await fetch(`/api/relay/${item.id}/image`, { headers: { 'x-sync-token': tok() } })
      const d = await res.json()
      if (d.success) { setImgSrc(`data:${item.mime_type};base64,${d.data.data}`); setExpanded(true) }
    } finally { setImgLoading(false) }
  }

  function dismiss() {
    fetch(`/api/relay/${item.id}/read`, { method: 'POST', headers: { 'x-sync-token': tok() } }).catch(() => {})
    onDismiss(item.id)
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 20, alignItems: 'flex-start' }}>
      <GuardianAvatar />
      <div style={{ maxWidth: '74%' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{who}</div>
        <div style={{
          padding: '10px 14px',
          borderRadius: '3px 12px 12px 12px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderLeft: '3px solid #D97757',
          fontSize: 14, lineHeight: 1.7, wordBreak: 'break-word',
        }}>
          {isText ? (
            <span style={{ whiteSpace: 'pre-wrap' }}>{item.caption || '（无内容）'}</span>
          ) : (
            <div>
              <div onClick={loadImg} style={{ cursor: 'pointer', color: 'var(--primary)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
                {imgLoading ? '加载中…' : expanded ? '收起图片' : '点击查看图片'}
              </div>
              {item.caption && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{item.caption}</div>}
              {expanded && imgSrc && (
                <img src={imgSrc} alt="转发图片" style={{ maxWidth: '100%', maxHeight: 360, borderRadius: 6, marginTop: 8, display: 'block', border: '1px solid var(--border)' }} />
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {new Date(item.create_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button onClick={dismiss} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
            已看
          </button>
        </div>
      </div>
    </div>
  )
}

marked.setOptions({ breaks: true, gfm: true })
const renderMd = (t: string): string => marked.parse(t) as string

let counter = 0
const uid = (): string => String(++counter)
const now = (): string => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

function AIAvatar({ pulse = false }: { pulse?: boolean }): React.ReactElement {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #E8835E 0%, #C4663E 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      marginRight: 10, marginTop: 2,
      boxShadow: pulse
        ? '0 0 0 3px rgba(217,119,87,0.25), 0 2px 8px rgba(217,119,87,0.3)'
        : '0 1px 4px rgba(196,102,62,0.25)',
      transition: 'box-shadow .3s',
    }}>
      <span style={{
        fontSize: 11, fontWeight: 800, color: '#fff',
        letterSpacing: '0.04em', lineHeight: 1, userSelect: 'none',
      }}>AI</span>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--primary-light)', border: '1px solid var(--primary-ring)', borderRadius: 20, fontSize: 12, color: 'var(--primary)', marginBottom: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', animation: 'blink .7s step-end infinite' }} />
      {text}
    </div>
  )
}

const CHAT_KEY = () => `pac_chat_${(localStorage.getItem('syncToken') ?? 'x').slice(0, 8)}`
const MAX_SAVED = 60

function saveHistory(msgs: Msg[]) {
  try {
    const toSave = msgs.slice(-MAX_SAVED).map(m => ({ ...m, images: undefined, streaming: false }))
    localStorage.setItem(CHAT_KEY(), JSON.stringify(toSave))
  } catch { /* quota exceeded */ }
}

function loadHistory(): Msg[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY())
    if (!raw) return []
    return JSON.parse(raw) as Msg[]
  } catch { return [] }
}

// 从服务端加载历史（跨设备同步）
async function fetchServerHistory(): Promise<Msg[]> {
  try {
    const r = await fetch('/api/chat-history?limit=60', { headers: { 'x-sync-token': tok() } })
    const d = await r.json()
    if (!d.success) return []
    return (d.data as Array<{ id: string; role: string; content: string; thinking?: string; msg_time?: string }>).map(row => ({
      id: row.id,
      role: row.role as 'user' | 'ai',
      content: row.content,
      thinking: row.thinking ?? undefined,
      time: row.msg_time ?? '',
    }))
  } catch { return [] }
}

// 把新消息推送到服务端（只推文字，忽略图片）
function pushToServer(msgs: Msg[]) {
  const payload = msgs.slice(-MAX_SAVED)
    .filter(m => !m.streaming && !m.error && m.content)
    .map(m => ({ id: m.id, role: m.role, content: m.content, thinking: m.thinking, msg_time: m.time }))
  if (payload.length === 0) return
  fetch('/api/chat-history', {
    method: 'POST',
    headers: { 'x-sync-token': tok(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: payload }),
  }).catch(() => {})
}

// Web Speech API type shim
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}
interface SpeechRecognitionResultList { length: number; [i: number]: SpeechRecognitionResult }
interface SpeechRecognitionResult { isFinal: boolean; [i: number]: SpeechRecognitionAlternative }
interface SpeechRecognitionAlternative { transcript: string }
interface SpeechRecognitionInstance extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean
  start(): void; stop(): void; abort(): void
  onstart: ((e: Event) => void) | null
  onend: ((e: Event) => void) | null
  onerror: ((e: Event) => void) | null
  onresult: ((e: SpeechRecognitionEvent) => void) | null
}

function getSR(): (new () => SpeechRecognitionInstance) | null {
  const w = window as unknown as Record<string, unknown>
  return (w['SpeechRecognition'] ?? w['webkitSpeechRecognition'] ?? null) as (new () => SpeechRecognitionInstance) | null
}

export default function Chat({ minimal = false }: { minimal?: boolean }): React.ReactElement {
  const { toast } = useToast()
  const { role } = useUser()
  const isStudent = role === 'student'
  const location = useLocation()
  const [msgs, setMsgs] = useState<Msg[]>(() => loadHistory())
  const [input, setInput] = useState((location.state as { prefill?: string } | null)?.prefill || '')
  const [pendingImages, setPendingImages] = useState<MsgImage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [relayItems, setRelayItems] = useState<RelayMeta[]>([])
  const [recording, setRecording] = useState(false)
  const [liveText, setLiveText] = useState('')        // interim text shown while holding
  const [reviewText, setReviewText] = useState('')    // editable text after release
  const [showReview, setShowReview] = useState(false)
  const [srsOpen, setSrsOpen] = useState<string | null>(null)   // message id with SRS panel open
  const [srsTopic, setSrsTopic] = useState('')
  const [srsSubject, setSrsSubject] = useState('通用')
  const [srsSaving, setSrsSaving] = useState(false)
  const [srsDone, setSrsDone] = useState<Record<string, true>>({}) // saved message ids
  const [sandboxMode, setSandboxMode] = useState(false)
  const [preSandboxMsgs, setPreSandboxMsgs] = useState<Msg[]>([])
  const [showSandboxIntro, setShowSandboxIntro] = useState(false)
  const sandboxModeRef = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const reviewRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const srRef = useRef<SpeechRecognitionInstance | null>(null)
  const finalAccumRef = useRef('')
  const msgsRef = useRef<Msg[]>(msgs)
  const serverSyncedRef = useRef(false)

  const initial = 'U'

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  // Keep msgsRef and sandboxModeRef in sync so unmount cleanup can access latest state
  useEffect(() => { msgsRef.current = msgs }, [msgs])
  useEffect(() => { sandboxModeRef.current = sandboxMode }, [sandboxMode])

  // 首次加载：从服务端拉历史，与本地缓存合并（服务端优先，本地补充）
  useEffect(() => {
    fetchServerHistory().then(serverMsgs => {
      if (serverMsgs.length > 0) {
        setMsgs(prev => {
          // 合并：服务端消息为基础，本地有而服务端没有的消息（streaming 中断的）也保留
          const serverIds = new Set(serverMsgs.map(m => m.id))
          const localOnly = prev.filter(m => !serverIds.has(m.id) && !m.streaming)
          const merged = [...serverMsgs, ...localOnly].sort((a, b) => a.id.localeCompare(b.id))
          saveHistory(merged)
          return merged
        })
      }
      serverSyncedRef.current = true
    })
  }, [])

  // Save on unmount even if mid-stream (prevents message loss on navigation)
  useEffect(() => {
    return () => {
      if (sandboxModeRef.current) return  // 沙盒模式不保存
      const finalMsgs = msgsRef.current.map(m =>
        m.streaming ? { ...m, streaming: false, time: m.time || new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) } : m
      )
      saveHistory(finalMsgs)
    }
  }, [])

  // 从首页带过来的 prefill → 自动 focus
  useEffect(() => {
    const prefill = (location.state as { prefill?: string } | null)?.prefill
    if (prefill) setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  // 持久化：每次 msgs 变动（且非 streaming）保存本地 + 推服务端（沙盒模式跳过）
  useEffect(() => {
    if (!streaming && !sandboxMode) {
      saveHistory(msgs)
      if (serverSyncedRef.current) pushToServer(msgs)
    }
  }, [msgs, streaming, sandboxMode])

  // 拉取待接收的转发图片
  useEffect(() => {
    function fetchRelay() {
      fetch('/api/relay/pending', { headers: { 'x-sync-token': tok() } })
        .then(r => r.json())
        .then(d => { if (d.success) setRelayItems(d.data) })
        .catch(() => {})
    }
    fetchRelay()
    const t = setInterval(fetchRelay, 30_000)
    return () => clearInterval(t)
  }, [])

  const buildHistory = (current: Msg[]): ApiMessage[] => {
    // 只有最后一条含图消息才带图发给 API，其余历史消息图片剥离为文字占位
    let lastImgId: string | null = null
    for (let i = current.length - 1; i >= 0; i--) {
      if (current[i].role === 'user' && current[i].images?.length) { lastImgId = current[i].id; break }
    }
    return current
      .filter(m => !m.error && (m.content || m.images?.length))
      .map(m => {
        const keepImages = m.id === lastImgId && !!m.images?.length
        return {
          role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: keepImages
            ? [...m.images!, { type: 'text' as const, text: m.content }]
            : (m.content || (m.images?.length ? '[图片]' : ''))
        }
      })
  }

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
          setMsgs(m => {
            const updated = m.map(msg => msg.id === aiId ? { ...msg, streaming: false, thinking: undefined, time: now() } : msg)
            // 非沙盒模式才检测知识点更新关键词
            if (!sandboxModeRef.current) {
              const aiMsg = updated.find(msg => msg.id === aiId)
              const SRS_TRIGGER = /已更新.*知识点|置信度.*%|掌握度.*更新|加入复习|记录.*知识点/
              if (aiMsg && SRS_TRIGGER.test(aiMsg.content)) {
                const topicMatch = aiMsg.content.match(/「([^」]{2,20})」|"([^"]{2,20})"/)
                const hint = topicMatch ? (topicMatch[1] || topicMatch[2]) : ''
                setSrsTopic(hint)
                setSrsOpen(aiId)
              }
            }
            return updated
          })
          setStreaming(false)
          setTimeout(() => inputRef.current?.focus(), 0)
        },
        err => {
          setMsgs(m => m.map(msg => msg.id === aiId ? { ...msg, content: err, streaming: false, thinking: undefined, error: true, time: now() } : msg))
          setStreaming(false)
        },
        (_toolName, display) => setMsgs(m => m.map(msg => msg.id === aiId ? { ...msg, thinking: display } : msg)),
        sandboxModeRef.current ? { sandbox: true } : undefined
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
    const MAX_PX = 1568  // Anthropic/OpenAI 最优尺寸上限
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, MAX_PX / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      canvas.toBlob(blob => {
        if (!blob) return
        const reader = new FileReader()
        reader.onload = () => {
          const data = (reader.result as string).split(',')[1]
          setPendingImages(prev => [...prev, { type: 'image', data, mediaType: 'image/jpeg' }])
        }
        reader.readAsDataURL(blob)
      }, 'image/jpeg', 0.85)
    }
    img.onerror = () => {
      // fallback：直接读原文件
      URL.revokeObjectURL(url)
      const reader = new FileReader()
      reader.onload = () => {
        const data = (reader.result as string).split(',')[1]
        setPendingImages(prev => [...prev, { type: 'image', data, mediaType: file.type }])
      }
      reader.readAsDataURL(file)
    }
    img.src = url
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

  const SANDBOX_INTRO_KEY = 'pac_sandbox_intro_seen'

  function enterSandbox(): void {
    if (streaming) stopStream()
    setPreSandboxMsgs(msgsRef.current)
    setSandboxMode(true)
    sandboxModeRef.current = true
    const firstTime = !localStorage.getItem(SANDBOX_INTRO_KEY)
    if (firstTime) {
      localStorage.setItem(SANDBOX_INTRO_KEY, '1')
      setShowSandboxIntro(true)
    } else {
      setMsgs(prev => [...prev, {
        id: uid(), role: 'ai',
        content: '已进入小黑屋模式。对话和操作不会被记录，退出后将恢复至进入前的状态。',
        time: now()
      }])
    }
  }

  function exitSandbox(): void {
    if (streaming) stopStream()
    setSandboxMode(false)
    sandboxModeRef.current = false
    setShowSandboxIntro(false)
    setMsgs(preSandboxMsgs)
    setPreSandboxMsgs([])
  }

  const startRecording = (e: React.PointerEvent): void => {
    e.preventDefault()
    if (recording || showReview) return
    const SR = getSR()
    if (!SR) { toast('您的浏览器不支持语音输入，请使用 Chrome 或 Edge', 'error'); return }
    finalAccumRef.current = ''
    const r = new SR()
    r.lang = 'zh-CN'
    r.continuous = true
    r.interimResults = true
    r.onstart = () => setRecording(true)
    r.onresult = (e: SpeechRecognitionEvent) => {
      let final = ''; let interim = ''
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) final += res[0].transcript
        else interim += res[0].transcript
      }
      finalAccumRef.current = final
      setLiveText(final + interim)
    }
    r.onend = () => {
      setRecording(false)
      setLiveText('')
      const result = finalAccumRef.current.trim()
      if (result) {
        setReviewText(result)
        setShowReview(true)
        setTimeout(() => { reviewRef.current?.focus(); reviewRef.current?.select() }, 50)
      }
    }
    r.onerror = () => { setRecording(false); setLiveText('') }
    srRef.current = r
    r.start()
  }

  const stopRecording = (): void => {
    srRef.current?.stop()
  }

  const confirmReview = (): void => {
    const text = reviewText.trim()
    if (!text) { setShowReview(false); return }
    setInput(prev => prev ? prev + ' ' + text : text)
    setShowReview(false)
    setReviewText('')
    setTimeout(() => {
      const t = inputRef.current
      if (t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px'; t.focus() }
    }, 0)
  }

  const sendReview = (): void => {
    const text = reviewText.trim()
    if (!text) return
    setShowReview(false)
    setReviewText('')
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
        () => { setMsgs(m => m.map(msg => msg.id === aiId ? { ...msg, streaming: false, thinking: undefined, time: now() } : msg)); setStreaming(false); setTimeout(() => inputRef.current?.focus(), 0) },
        err => { setMsgs(m => m.map(msg => msg.id === aiId ? { ...msg, content: err, streaming: false, thinking: undefined, error: true, time: now() } : msg)); setStreaming(false) },
        (_toolName, display) => setMsgs(m => m.map(msg => msg.id === aiId ? { ...msg, thinking: display } : msg)),
        sandboxModeRef.current ? { sandbox: true } : undefined
      )
      abortRef.current = ctrl
      return [...next, placeholder]
    })
  }

  async function saveSrs(msgId: string) {
    if (!srsTopic.trim()) return
    setSrsSaving(true)
    try {
      await fetch('/api/srs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sync-token': tok() },
        body: JSON.stringify({ topic: srsTopic.trim(), subject: srsSubject })
      })
      setSrsDone(prev => ({ ...prev, [msgId]: true }))
      setSrsOpen(null)
      setSrsTopic('')
    } catch { /* ignore */ } finally { setSrsSaving(false) }
  }

  function openSrs(msgId: string, lastUserMsg: string) {
    const hint = lastUserMsg.slice(0, 30).trim()
    setSrsTopic(hint)
    setSrsOpen(msgId)
  }

  const height = minimal ? '100vh' : 'calc(100vh - 56px)'

  return (
    <>
    {/* 小黑屋首次使用介绍弹窗 */}
    {isStudent && showSandboxIntro && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
      }}>
        <div style={{
          width: '100%', maxWidth: 400,
          background: 'var(--bg-card)', borderRadius: 16,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '28px 28px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>小黑屋模式</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>专属私人空间</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              {[
                { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, text: '所有工具照常使用，问题、练习、分析都支持' },
                { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>, text: '退出后对话自动消失，恢复进入前的记录' },
                { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, text: '不会向家长或监护人汇报任何内容' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-secondary)' }}>
                    {item.icon}
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, paddingTop: 5 }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: '0 28px 28px' }}>
            <button
              className="btn btn-primary"
              style={{ width: '100%', height: 42, fontSize: 14, fontWeight: 600 }}
              onClick={() => {
                setShowSandboxIntro(false)
                setMsgs(prev => [...prev, {
                  id: uid(), role: 'ai',
                  content: '已进入小黑屋模式。在这里可以自由探索，对话不会被记录，退出后将恢复至进入前的状态。',
                  time: now()
                }])
              }}>
              开始使用
            </button>
          </div>
        </div>
      </div>
    )}

    <div style={{ display: 'flex', flexDirection: 'column', height }}>
      <style>{`
        @keyframes blink { 50% { opacity: 0 } }
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); opacity: .4 }
          30% { transform: translateY(-5px); opacity: 1 }
        }
        @keyframes micRing {
          0% { box-shadow: 0 0 0 0 rgba(220,38,38,0.5), 0 0 0 0 rgba(220,38,38,0.25) }
          70% { box-shadow: 0 0 0 6px rgba(220,38,38,0), 0 0 0 12px rgba(220,38,38,0) }
          100% { box-shadow: 0 0 0 0 rgba(220,38,38,0), 0 0 0 0 rgba(220,38,38,0) }
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {msgs.length > 0 && !sandboxMode && (
              <button className="btn btn-ghost btn-sm" onClick={() => { if (streaming) stopStream(); setMsgs([]); localStorage.removeItem(CHAT_KEY()); fetch('/api/chat-history', { method: 'DELETE', headers: { 'x-sync-token': tok() } }).catch(() => {}) }} style={{ color: 'var(--text-secondary)' }}>清空</button>
            )}
            {isStudent && (!sandboxMode ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={enterSandbox}
                title="进入小黑屋：对话不记录、不汇报"
                style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                小黑屋
              </button>
            ) : (
              <button
                className="btn btn-sm"
                onClick={exitSandbox}
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--text)', color: 'var(--bg)', border: 'none' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                退出小黑屋
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 小黑屋模式横幅 */}
      {isStudent && sandboxMode && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
          padding: '7px 12px', borderRadius: 8,
          background: 'var(--text)', color: 'var(--bg)',
          fontSize: 12, fontWeight: 500, flexShrink: 0
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span>小黑屋模式 · 对话不保存、不汇报给家长</span>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-card)', borderRadius: minimal ? 0 : 'var(--radius-lg)', border: minimal ? 'none' : '1px solid var(--border)', padding: minimal ? '16px 20px' : '20px', marginBottom: 12 }}>
        {msgs.length === 0 && relayItems.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', userSelect: 'none' }}>
            <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--primary-light)', border: '1px solid var(--primary-ring)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>开始对话</div>
            <div style={{ fontSize: 13 }}>问问题，或发送一张截图让 AI 分析</div>
          </div>
        ) : msgs.map((msg, msgIdx) => {
          // Find the last user message before this AI message (for SRS topic hint)
          const lastUserContent = msg.role === 'ai'
            ? (msgs.slice(0, msgIdx).filter(m => m.role === 'user').pop()?.content ?? '')
            : ''
          return (
          <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 20, alignItems: 'flex-start' }}>
            {msg.role === 'ai' && <AIAvatar pulse={msg.streaming} />}
            <div style={{ maxWidth: '74%' }}>
              {/* 等待首个 token 时显示三点动画 */}
              {msg.role === 'ai' && msg.streaming && !msg.content && (
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
                background: msg.role === 'user' ? 'var(--primary)' : msg.error ? 'var(--danger-bg)' : 'var(--bg)',
                color: msg.role === 'user' ? '#fff' : msg.error ? 'var(--danger)' : 'var(--text)',
                fontSize: 14, lineHeight: 1.7, wordBreak: 'break-word',
                border: msg.role === 'ai' ? `1px solid ${msg.error ? 'var(--danger-border)' : 'var(--border)'}` : 'none',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{msg.time}</span>
                  {msg.role === 'ai' && !msg.error && !srsDone[msg.id] && (
                    <button
                      onClick={() => srsOpen === msg.id ? setSrsOpen(null) : openSrs(msg.id, lastUserContent)}
                      style={{ fontSize: 11, color: srsOpen === msg.id ? 'var(--primary)' : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                      {srsOpen === msg.id ? '取消' : '加入复习'}
                    </button>
                  )}
                  {msg.role === 'ai' && !msg.error && srsDone[msg.id] && (
                    <span style={{ fontSize: 11, color: 'var(--success)' }}>已加入复习</span>
                  )}
                </div>
              )}
              {/* SRS inline form */}
              {msg.role === 'ai' && srsOpen === msg.id && (
                <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    autoFocus
                    className="form-control"
                    value={srsTopic}
                    onChange={e => setSrsTopic(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveSrs(msg.id) }}
                    placeholder="知识点名称，如：牛顿第二定律"
                    style={{ fontSize: 13, padding: '5px 9px' }}
                  />
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select
                      className="form-control"
                      value={srsSubject}
                      onChange={e => setSrsSubject(e.target.value)}
                      style={{ fontSize: 12, padding: '4px 8px', flex: 1, paddingRight: 28 }}>
                      {['通用','数学','语文','英语','物理','化学','生物','历史','地理','政治'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => saveSrs(msg.id)}
                      disabled={srsSaving || !srsTopic.trim()}
                      style={{ padding: '4px 14px', borderRadius: 6, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 500, cursor: srsTopic.trim() ? 'pointer' : 'default', opacity: srsTopic.trim() ? 1 : 0.5 }}>
                      {srsSaving ? '保存…' : '加入'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {msg.role === 'user' && <UserAvatar initial={initial} />}
          </div>
          )
        })}
        {/* Relay messages inline in conversation */}
        {!sandboxMode && relayItems.map(item => (
          <RelayBubble key={item.id} item={item} onDismiss={id => setRelayItems(prev => prev.filter(r => r.id !== id))} />
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
                style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'var(--text)', color: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ flexShrink: 0 }}>

        {/* ── Recording overlay ── */}
        {recording && (
          <div style={{ marginBottom: 8, padding: '10px 14px', borderRadius: 10, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0, animation: 'micRing 1s ease-out infinite', display: 'inline-block' }} />
            <span style={{ fontSize: 13, color: liveText ? 'var(--text)' : 'var(--text-muted)', flex: 1, fontStyle: liveText ? 'normal' : 'italic', lineHeight: 1.5 }}>
              {liveText || '正在聆听，松开停止…'}
            </span>
          </div>
        )}

        {/* ── Review panel ── */}
        {showReview && (
          <div style={{ marginBottom: 8, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 6px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/>
                </svg>
                识别结果 · 可直接编辑
              </span>
              <button onClick={() => { setShowReview(false); setReviewText('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', borderRadius: 4 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <textarea ref={reviewRef} value={reviewText} onChange={e => setReviewText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReview() } }}
              rows={2}
              style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', background: 'transparent', fontSize: 14, lineHeight: 1.6, color: 'var(--text)', fontFamily: 'inherit', padding: '10px 12px', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 6, padding: '0 12px 10px' }}>
              <button onClick={confirmReview}
                style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
                加入输入框
              </button>
              <button onClick={sendReview}
                style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', background: 'var(--primary)', cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 500 }}>
                直接发送
              </button>
            </div>
          </div>
        )}

        {/* ── Input bar ── */}
        <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: recording ? '1px solid rgba(220,38,38,0.35)' : '1px solid var(--border)', padding: '10px 12px', display: 'flex', alignItems: 'flex-end', gap: 8, transition: 'border-color .15s' }}>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFilePick} />
          <button onClick={() => fileRef.current?.click()}
            style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}
            title="上传图片">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
          </button>
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey} onPaste={handlePaste}
            placeholder="输入消息，或粘贴/上传图片…" disabled={streaming} rows={1}
            style={{ flex: 1, border: 'none', outline: 'none', resize: 'none', background: 'transparent', fontSize: 14, lineHeight: 1.6, color: 'var(--text)', fontFamily: 'inherit', padding: '2px 0', maxHeight: 160, overflowY: 'auto', opacity: streaming ? 0.5 : 1 }}
            onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px' }} />
          {/* Mic — long press to talk */}
          <button
            onPointerDown={startRecording}
            onPointerUp={stopRecording}
            onPointerLeave={stopRecording}
            onPointerCancel={stopRecording}
            onContextMenu={e => e.preventDefault()}
            disabled={streaming || showReview}
            title="长按说话"
            style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 7, border: recording ? 'none' : '1px solid var(--border)', background: recording ? 'var(--danger)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: recording ? '#fff' : 'var(--text-secondary)', transition: 'all .15s', animation: recording ? 'micRing 1s ease-out infinite' : 'none', touchAction: 'none', userSelect: 'none' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="11" rx="3"/>
              <path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>
            </svg>
          </button>
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
    </div>
    </>
  )
}
