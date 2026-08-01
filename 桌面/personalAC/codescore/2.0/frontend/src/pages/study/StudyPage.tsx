import { useState, useEffect, useCallback, useRef } from 'react'
import { Box, Typography, IconButton, Tooltip, Paper } from '@mui/material'
import ChatIcon from '@mui/icons-material/Chat'
import CloseIcon from '@mui/icons-material/Close'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import MicIcon from '@mui/icons-material/Mic'
import SendIcon from '@mui/icons-material/Send'
import { companionApi, chatApi } from '../../api/http'
import { useUser } from '../../context/UserContext'
import CanvasBoard, { CanvasElement, Stroke, AITextElement, AIHighlight } from '../../components/whiteboard/CanvasBoard'
import CanvasToolbar from '../../components/whiteboard/CanvasToolbar'
import Sidebar from '../../components/shared/Sidebar'

type Tool = 'pen' | 'eraser' | 'move'

interface Message { role: 'user' | 'assistant'; content: string }

export default function StudyPage({ onLogout, mode: initialMode = 'study' }: { onLogout: () => void; mode?: 'study' | 'homework' }) {
  const { user } = useUser()
  const [mode] = useState<'study' | 'homework'>(initialMode)
  const [elements, setElements] = useState<CanvasElement[]>([])
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 })
  const [tool, setTool] = useState<Tool>('pen')
  const [penColor, setPenColor] = useState('#141413')
  const [penWidth, setPenWidth] = useState(3)
  const [companionState, setCompanionState] = useState('idle')
  const [chatOpen, setChatOpen] = useState(true)
  const captureRef = useRef<(() => string) | null>(null)

  // Chat state
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [currentResponse, setCurrentResponse] = useState('')
  const [listening, setListening] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user || user.role !== 'student') return
    companionApi.getState(user.id).then(res => {
      if (res.success?.data) setCompanionState(res.data.current_state || 'idle')
    })
  }, [user])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, currentResponse])

  // ── Canvas actions ────────────────────────────

  function handleStrokeAdd(stroke: Stroke) { setElements(prev => [...prev, stroke]) }
  function handleUndo() { setElements(prev => { for (let i = prev.length - 1; i >= 0; i--) { if (prev[i].type === 'stroke') return prev.slice(0, i).concat(prev.slice(i + 1)) } return prev }) }
  function handleClearAI() { setElements(prev => prev.filter(el => el.type === 'stroke')) }
  function handleDeleteElement(id: string) { setElements(prev => prev.filter(el => el.id !== id)) }

  function handleBoardAction(action: any) {
    const id = 'ai_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    if (action.type === 'add_text') {
      setElements(prev => [...prev, { type: 'ai_text', id, x: action.x || 100, y: action.y || 100, text: action.text || '', width: action.width || 300 } as AITextElement])
    } else if (action.type === 'highlight') {
      setElements(prev => [...prev, { type: 'ai_highlight', id, x: action.x || 50, y: action.y || 50, w: action.w || 200, h: action.h || 100, color: action.color || '#cc785c', note: action.note || '' } as AIHighlight])
    } else if (action.type === 'clear_ai') {
      handleClearAI()
    }
  }

  const getCanvasImage = useCallback((): string | null => {
    return captureRef.current?.() || null
  }, [])

  // ── Chat ───────────────────────────────────────

  function toggleVoice() {
    if (listening) { setListening(false); return }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const rec = new SR(); rec.lang = 'zh-CN'; rec.interimResults = false
    rec.onresult = (e: any) => { setInput(e.results[0][0].transcript); setListening(false) }
    rec.onerror = () => setListening(false); rec.onend = () => setListening(false)
    setListening(true); rec.start()
  }

  async function handleSend() {
    if (!input.trim() || streaming) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setStreaming(true)
    setCurrentResponse('')

    const canvasImage = getCanvasImage()
    let response = ''

    chatApi.streamWithImage(
      [...messages, { role: 'user', content: userMsg }], mode, canvasImage, user?.id,
      (t) => { response += t; setCurrentResponse(response) },
      (a) => handleBoardAction(a),
      (s) => setCompanionState(s),
      () => { setMessages(prev => [...prev, { role: 'assistant', content: response }]); setCurrentResponse(''); setStreaming(false) },
      (e) => { setMessages(prev => [...prev, { role: 'assistant', content: '抱歉：' + e }]); setCurrentResponse(''); setStreaming(false) },
    )
  }

  const companionText: Record<string, string> = {
    idle: '在你旁边', watching: '看白板中…', thinking: '思考中…', writing: '写东西…',
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', bgcolor: 'var(--canvas)' }}>
      {/* 左侧边栏 */}
      <Sidebar role="student" onLogout={onLogout} />

      {/* 中央画布区 */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* 顶栏 */}
        <Box sx={{
          display: 'flex', alignItems: 'center', px: 2, py: 1,
          borderBottom: '0.5px solid var(--hairline)', bgcolor: '#ffffff',
          gap: 1.5,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%',
              bgcolor: companionState === 'idle' ? 'var(--muted-soft)' : companionState === 'thinking' ? '#d4a017' : '#5db872' }} />
            <Typography variant="body2" color="var(--muted)" sx={{ fontSize: 13 }}>
              学伴{companionText[companionState] || ''}
            </Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Typography variant="body2" color="var(--muted-soft)" sx={{ fontSize: 11 }}>
            {mode === 'homework' ? '作业模式' : '学习模式'}
          </Typography>
        </Box>

        {/* Canvas */}
        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <CanvasBoard
            elements={elements} viewport={viewport}
            tool={tool} penColor={penColor} penWidth={penWidth}
            onStrokeAdd={handleStrokeAdd} onViewportChange={setViewport}
            onAIDelete={handleDeleteElement}
            captureRef={captureRef}
          />
        </Box>

        {/* 底部工具栏 */}
        <CanvasToolbar
          tool={tool} penColor={penColor} penWidth={penWidth} zoom={viewport.zoom}
          onToolChange={setTool} onColorChange={setPenColor} onWidthChange={setPenWidth}
          onUndo={handleUndo} onClearAI={handleClearAI}
        />
      </Box>

      {/* 右侧聊天面板 */}
      {chatOpen && (
        <Box sx={{
          width: 340, display: 'flex', flexDirection: 'column',
          bgcolor: '#ffffff', borderLeft: '0.5px solid var(--hairline)',
        }}>
          {/* 聊天头 */}
          <Box sx={{
            display: 'flex', alignItems: 'center', px: 2, py: 1.5,
            borderBottom: '0.5px solid var(--hairline)', gap: 1,
          }}>
            <SmartToyIcon sx={{ color: 'var(--primary)', fontSize: 18 }} />
            <Typography variant="subtitle2" fontWeight={500} sx={{ flex: 1, color: 'var(--ink)', fontSize: 13 }}>学伴</Typography>
            <IconButton size="small" onClick={() => setChatOpen(false)}><CloseIcon sx={{ fontSize: 16 }} /></IconButton>
          </Box>

          {/* 消息 */}
          <Box sx={{ flex: 1, overflow: 'auto', px: 2.5, py: 2 }}>
            {messages.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <SmartToyIcon sx={{ fontSize: 32, color: 'var(--hairline)', mb: 1 }} />
                <Typography variant="body2" color="var(--muted-soft)" sx={{ fontSize: 13 }}>
                  在白板上写点东西，随时跟我聊
                </Typography>
              </Box>
            )}
            {messages.map((msg, i) => (
              <Box key={i} sx={{ mb: 2 }}>
                {msg.role === 'user' ? (
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Box sx={{ bgcolor: 'var(--primary)', color: '#fff', px: 1.5, py: 1, borderRadius: '12px 12px 3px 12px', maxWidth: '80%', fontSize: 13, lineHeight: 1.45 }}>{msg.content}</Box>
                  </Box>
                ) : (
                  <Box sx={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{msg.content}</Box>
                )}
              </Box>
            ))}
            {streaming && currentResponse && (
              <Box sx={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink)' }}>{currentResponse}</Box>
            )}
            <div ref={messagesEndRef} />
          </Box>

          {/* 输入 */}
          <Box sx={{ p: 1.5, borderTop: '0.5px solid var(--hairline)' }}>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <IconButton size="small" onClick={toggleVoice} sx={{ color: listening ? 'var(--error)' : 'var(--muted)' }}>
                <MicIcon sx={{ fontSize: 18 }} />
              </IconButton>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="跟学伴说话..."
                style={{
                  flex: 1, border: '0.5px solid var(--hairline)', borderRadius: 8,
                  padding: '8px 12px', fontFamily: 'var(--font-body)', fontSize: 13,
                  outline: 'none', color: 'var(--ink)',
                }}
              />
              <IconButton size="small" onClick={handleSend} disabled={streaming || !input.trim()}
                sx={{ color: 'var(--primary)', '&:hover': { bgcolor: 'rgba(204,120,92,0.08)' } }}>
                <SendIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
          </Box>
        </Box>
      )}

      {/* 聊天折叠按钮 */}
      {!chatOpen && (
        <Tooltip title="打开聊天" placement="left">
          <IconButton
            onClick={() => setChatOpen(true)}
            sx={{
              position: 'fixed', right: 16, bottom: 80, zIndex: 50,
              bgcolor: '#ffffff', border: '0.5px solid var(--hairline)',
              boxShadow: '0 2px 8px rgba(20,20,19,0.08)',
              '&:hover': { bgcolor: 'var(--surface-soft)' },
            }}
          >
            <ChatIcon sx={{ color: 'var(--primary)' }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  )
}
