import { useEffect, useRef, useState } from 'react'
import { Box, Chip, Typography } from '@mui/material'
import { openWs } from '../api/controller'

interface LogMsg {
  type: string
  payload: string
}

const LEVEL_COLOR: Record<string, string> = {
  info: 'success.main',
  warning: 'warning.main',
  error: 'error.main',
  debug: 'text.secondary',
}

export default function Logs() {
  const [logs, setLogs] = useState<LogMsg[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let alive = true
    openWs('/logs?level=info')
      .then((ws) => {
        if (!alive) {
          ws.close()
          return
        }
        wsRef.current = ws
        ws.onmessage = (e) => {
          try {
            const m = JSON.parse(e.data) as LogMsg
            setLogs((p) => [...p.slice(-499), m])
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {})
    return () => {
      alive = false
      wsRef.current?.close()
    }
  }, [])

  useEffect(() => {
    const el = boxRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        日志
      </Typography>
      <Box
        ref={boxRef}
        sx={{
          mt: 2,
          flex: 1,
          overflow: 'auto',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12.5,
        }}
      >
        {logs.map((l, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, py: 0.25, alignItems: 'baseline' }}>
            <Chip
              size="small"
              label={l.type}
              sx={{ height: 18, flexShrink: 0, '& .MuiChip-label': { px: 0.75, fontSize: 10 } }}
            />
            <Box component="span" sx={{ color: LEVEL_COLOR[l.type] || 'text.primary', wordBreak: 'break-all' }}>
              {l.payload}
            </Box>
          </Box>
        ))}
        {!logs.length && <Typography color="text.secondary">等待日志…(内核需在运行)</Typography>}
      </Box>
    </Box>
  )
}
