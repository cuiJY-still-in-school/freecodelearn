import { useState, useRef, useEffect } from 'react'
import { Box, TextField, IconButton, Typography } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import CloseIcon from '@mui/icons-material/Close'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import { chatApi } from '../../api/http'
import { useUser } from '../../context/UserContext'

interface Message { role: 'user' | 'assistant'; content: string }

export default function ChatDrawer({ mode, boardBlocks, onBoardAction, onCompanionState, onClose }: {
  mode: 'study' | 'homework'; boardBlocks: any[]
  onBoardAction: (a: any) => void; onCompanionState: (s: string) => void; onClose: () => void
}) {
  const { user } = useUser()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [currentResponse, setCurrentResponse] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, currentResponse])

  async function handleSend() {
    if (!input.trim() || streaming) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setStreaming(true)
    setCurrentResponse('')

    let response = ''
    const allMessages = [...messages, { role: 'user', content: userMsg }]

    chatApi.streamWithImage(allMessages, mode, null, user?.role === 'guardian' ? undefined : user?.id,
      (token: string) => { response += token; setCurrentResponse(response) },
      (action: any) => { onBoardAction(action) },
      (state: string) => { onCompanionState(state) },
      () => { setMessages(prev => [...prev, { role: 'assistant', content: response }]); setCurrentResponse(''); setStreaming(false) },
      (err: string) => { setMessages(prev => [...prev, { role: 'assistant', content: `抱歉，出错了：${err}` }]); setCurrentResponse(''); setStreaming(false) },
    )
  }

  return (
    <Box className="chat-drawer">
      <Box sx={{ p: 2, borderBottom: '0.5px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SmartToyIcon sx={{ color: 'primary.main', fontSize: 20 }} />
          <Typography variant="subtitle2" fontWeight={500} color="var(--ink)">学伴</Typography>
        </Box>
        <IconButton size="small" onClick={onClose}><CloseIcon sx={{ fontSize: 16 }} /></IconButton>
      </Box>

      <Box className="chat-messages">
        {messages.length === 0 && !streaming && (
          <Box sx={{ textAlign: 'center', pt: 6, px: 3 }}>
            <SmartToyIcon sx={{ fontSize: 36, color: 'var(--muted-soft)', mb: 1.5 }} />
            <Typography variant="body2" color="var(--muted)">跟学伴聊聊天吧！</Typography>
            <Typography variant="body2" color="var(--muted-soft)" sx={{ mt: 1, fontSize: 13 }}>
              试试说：帮我看看这道题 / 我不太懂这个 / 出个类似题
            </Typography>
          </Box>
        )}
        {messages.map((msg, i) => (
          <Box key={i} className={`chat-bubble ${msg.role}`}>
            {msg.content}
          </Box>
        ))}
        {streaming && currentResponse && (
          <Box className="chat-bubble assistant">{currentResponse}</Box>
        )}
        <div ref={messagesEndRef} />
      </Box>

      <Box sx={{ p: 2, borderTop: '0.5px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField fullWidth size="small" placeholder="跟学伴说话..."
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            multiline maxRows={4}
          />
          <IconButton onClick={handleSend} disabled={streaming || !input.trim()} sx={{ color: 'primary.main', '&:hover': { bgcolor: 'rgba(204,120,92,0.08)' } }}>
            <SendIcon />
          </IconButton>
        </Box>
      </Box>
    </Box>
  )
}
