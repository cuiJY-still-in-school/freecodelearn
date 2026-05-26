import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Chip,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import PauseRoundedIcon from '@mui/icons-material/PauseRounded'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import ClearAllRoundedIcon from '@mui/icons-material/ClearAllRounded'
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
const LEVELS = ['all', 'info', 'warning', 'error']

export default function Logs() {
  const [logs, setLogs] = useState<LogMsg[]>([])
  const [level, setLevel] = useState('all')
  const [search, setSearch] = useState('')
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const wsRef = useRef<WebSocket | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

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
          if (pausedRef.current) return
          try {
            const m = JSON.parse(e.data) as LogMsg
            setLogs((p) => [...p.slice(-999), m])
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

  const filtered = useMemo(
    () =>
      logs.filter(
        (l) =>
          (level === 'all' || l.type === level) &&
          (!search || l.payload.toLowerCase().includes(search.toLowerCase())),
      ),
    [logs, level, search],
  )

  useEffect(() => {
    const el = boxRef.current
    if (el && !paused) el.scrollTop = el.scrollHeight
  }, [filtered, paused])

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        日志
      </Typography>
      <Stack direction="row" spacing={1} sx={{ my: 2, alignItems: 'center' }}>
        <TextField
          select
          size="small"
          label="级别"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          sx={{ width: 110 }}
        >
          {LEVELS.map((l) => (
            <MenuItem key={l} value={l}>
              {l === 'all' ? '全部' : l}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label="搜索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, maxWidth: 360 }}
        />
        <Tooltip title={paused ? '继续' : '暂停'}>
          <IconButton onClick={() => setPaused((p) => !p)}>
            {paused ? <PlayArrowRoundedIcon /> : <PauseRoundedIcon />}
          </IconButton>
        </Tooltip>
        <Tooltip title="清空">
          <IconButton onClick={() => setLogs([])}>
            <ClearAllRoundedIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="caption" color="text.secondary">
          {filtered.length}/{logs.length}
        </Typography>
      </Stack>
      <Box
        ref={boxRef}
        sx={{ flex: 1, overflow: 'auto', fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}
      >
        {filtered.map((l, i) => (
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
