import { useState, useRef, useEffect } from 'react'
import { Box, TextField, IconButton, Typography, Paper } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import CloseIcon from '@mui/icons-material/Close'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import MicIcon from '@mui/icons-material/Mic'
import { chatApi } from '../../api/http'
import { useUser } from '../../context/UserContext'

interface Message { role: 'user' | 'assistant'; content: string }

export default function ChatPanel({
  mode, getCanvasImage, onBoardAction, onCompanionState, onClose,
}: {
  mode: 'study' | 'homework'
  getCanvasImage: () => string | null
  onBoardAction: (a: any) => void
  onCompanionState: (s: string) => void
  onClose: () => void
}) {
  const { user } = useUser()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [currentResponse, setCurrentResponse] = useState('')
  const [listening, setListening] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 拖拽
  const [pos, setPos] = useState({ x: window.innerWidth - 420, y: 80 })
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, currentResponse])

  function handleMouseDown(e: React.MouseEvent) {
    dragging.current = true
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  function handleMouseMove(e: MouseEvent) {
    if (!dragging.current) return
    setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y })
  }

  function handleMouseUp() {
    dragging.current = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  // 语音输入
  function toggleVoice() {
    if (listening) { setListening(false); return }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) { setInput('语音输入不支持此浏览器'); return }
    const rec = new SpeechRecognition()
    rec.lang = 'zh-CN'
    rec.interimResults = false
    rec.onresult = (e: any) => { setInput(e.results[0][0].transcript); setListening(false) }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    setListening(true)
    rec.start()
  }

  async function handleSend() {
    if (!input.trim() || streaming) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setStreaming(true)
    setCurrentResponse('')

    // 截取白板
    const canvasImage = getCanvasImage()

    let response = ''
    chatApi.streamWithImage(
      [...messages, { role: 'user', content: userMsg }],
      mode,
      canvasImage,
      user?.id,
      (token) => { response += token; setCurrentResponse(response) },
      (action) => onBoardAction(action),
      (state) => onCompanionState(state),
      () => { setMessages(prev => [...prev, { role: 'assistant', content: response }]); setCurrentResponse(''); setStreaming(false) },
      (err) => { setMessages(prev => [...prev, { role: 'assistant', content: `抱歉：${err}` }]); setCurrentResponse(''); setStreaming(false) },
    )
  }

  return (
    <Paper
      elevation={1}
      sx={{
        position: 'fixed', left: pos.x, top: pos.y, zIndex: 100,
        width: 380, maxHeight: '70vh',
        display: 'flex', flexDirection: 'column',
        borderRadius: 3, overflow: 'hidden',
        border: '0.5px solid var(--hairline)',
      }}
    >
      {/* 标题栏（可拖拽） */}
      <Box
        onMouseDown={handleMouseDown}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5,
          bgcolor: '#faf9f5', borderBottom: '0.5px solid var(--hairline)',
          cursor: 'grab',
        }}
      >
        <DragIndicatorIcon sx={{ fontSize: 16, color: 'var(--muted-soft)' }} />
        <SmartToyIcon sx={{ color: 'var(--primary)', fontSize: 18 }} />
        <Typography variant="subtitle2" fontWeight={500} sx={{ flex: 1, color: 'var(--ink)', fontSize: 13 }}>学伴</Typography>
        <IconButton size="small" onClick={onClose}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
      </Box>

      {/* 消息区 */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 2.5, py: 2, bgcolor: '#ffffff', maxHeight: 400 }}>
        {messages.length === 0 && !streaming && (
          <Box sx={{ textAlign: 'center', pt: 3, pb: 2 }}>
            <SmartToyIcon sx={{ fontSize: 28, color: 'var(--muted-soft)', mb: 1 }} />
            <Typography variant="body2" color="var(--muted)" sx={{ fontSize: 13 }}>在白板上写点东西，然后跟我聊聊吧</Typography>
          </Box>
        )}
        {messages.map((msg, i) => (
          <Box key={i} sx={{ mb: 1.5 }}>
            {msg.role === 'user' ? (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Box sx={{ bgcolor: 'var(--primary)', color: '#fff', px: 1.5, py: 1, borderRadius: '12px 12px 3px 12px', maxWidth: '80%', fontSize: 13, lineHeight: 1.45 }}>{msg.content}</Box>
              </Box>
            ) : (
              <Box sx={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink)' }}>{msg.content}</Box>
            )}
          </Box>
        ))}
        {streaming && currentResponse && (
          <Box sx={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink)' }}>{currentResponse}</Box>
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* 输入区 */}
      <Box sx={{ p: 1.5, borderTop: '0.5px solid var(--hairline)', bgcolor: '#ffffff' }}>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" onClick={toggleVoice} sx={{ color: listening ? 'var(--error)' : 'var(--muted-soft)' }}>
            <MicIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <TextField
            fullWidth size="small" placeholder="跟学伴说话..."
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            sx={{ '& .MuiOutlinedInput-input': { fontSize: 13, py: 1 } }}
          />
          <IconButton size="small" onClick={handleSend} disabled={streaming || !input.trim()} sx={{ color: 'var(--primary)' }}>
            <SendIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </Box>
    </Paper>
  )
}
