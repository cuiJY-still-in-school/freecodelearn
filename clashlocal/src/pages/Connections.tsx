import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Chip, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import { api, fmtBytes, openWs } from '../api/controller'

interface Conn {
  id: string
  metadata: {
    host: string
    destinationIP: string
    destinationPort: string
    network: string
    type: string
  }
  upload: number
  download: number
  chains: string[]
  rule: string
  start: string
}
interface ConnResp {
  downloadTotal: number
  uploadTotal: number
  connections: Conn[] | null
}

function fmtDur(start: string): string {
  const t = Date.parse(start)
  if (!t) return ''
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${(s / 3600).toFixed(1)}h`
}

export default function Connections() {
  const [data, setData] = useState<ConnResp | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('time')
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    let alive = true
    openWs('/connections')
      .then((ws) => {
        if (!alive) {
          ws.close()
          return
        }
        wsRef.current = ws
        ws.onmessage = (e) => {
          try {
            setData(JSON.parse(e.data))
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

  const closeAll = async () => {
    try {
      await api('/connections', { method: 'DELETE' })
    } catch {
      /* ignore */
    }
  }
  const closeOne = async (id: string) => {
    try {
      await api(`/connections/${id}`, { method: 'DELETE' })
    } catch {
      /* ignore */
    }
  }

  const allConns = data?.connections ?? []
  const conns = useMemo(() => {
    const q = search.toLowerCase()
    const list = q
      ? allConns.filter((c) => {
          const m = c.metadata
          return (
            (m.host || '').toLowerCase().includes(q) ||
            (m.destinationIP || '').toLowerCase().includes(q) ||
            (c.chains?.join(' ') || '').toLowerCase().includes(q) ||
            (c.rule || '').toLowerCase().includes(q)
          )
        })
      : allConns
    const arr = [...list]
    arr.sort((a, b) => {
      if (sort === 'download') return b.download - a.download
      if (sort === 'upload') return b.upload - a.upload
      return Date.parse(b.start) - Date.parse(a.start)
    })
    return arr
  }, [allConns, search, sort])

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        连接
      </Typography>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 2, my: 2 }}>
        <TextField
          size="small"
          label="搜索(域名/IP/规则/节点)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, maxWidth: 320 }}
        />
        <TextField
          select
          size="small"
          label="排序"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          sx={{ width: 100 }}
        >
          <MenuItem value="time">时间</MenuItem>
          <MenuItem value="download">下载</MenuItem>
          <MenuItem value="upload">上传</MenuItem>
        </TextField>
        <Typography color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {conns.length}/{allConns.length} · ↑ {fmtBytes(data?.uploadTotal ?? 0)} · ↓ {fmtBytes(data?.downloadTotal ?? 0)}
        </Typography>
        <Button size="small" color="error" onClick={closeAll} disabled={!allConns.length}>
          全部断开
        </Button>
      </Stack>
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Stack spacing={0.5}>
          {conns.map((c) => (
            <Box
              key={c.id}
              sx={{
                p: 1,
                borderRadius: 1,
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, alignItems: 'center' }}>
                <Typography
                  variant="body2"
                  sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
                >
                  {c.metadata.host || c.metadata.destinationIP}:{c.metadata.destinationPort}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                  {fmtDur(c.start)} · ↑ {fmtBytes(c.upload)} ↓ {fmtBytes(c.download)}
                </Typography>
                <Tooltip title="断开">
                  <IconButton size="small" onClick={() => closeOne(c.id)} sx={{ flexShrink: 0 }}>
                    <CloseRoundedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                <Chip size="small" label={c.metadata.network} />
                <Chip size="small" variant="outlined" label={c.chains?.join(' → ') || c.rule} />
              </Stack>
            </Box>
          ))}
          {!allConns.length && (
            <Typography color="text.secondary">暂无活动连接(内核需在运行)。</Typography>
          )}
        </Stack>
      </Box>
    </Box>
  )
}
