import { useEffect, useRef, useState } from 'react'
import { Box, Button, Chip, Stack, Typography } from '@mui/material'
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
}
interface ConnResp {
  downloadTotal: number
  uploadTotal: number
  connections: Conn[] | null
}

export default function Connections() {
  const [data, setData] = useState<ConnResp | null>(null)
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

  const conns = data?.connections ?? []

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        连接
      </Typography>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 2, my: 2 }}>
        <Typography color="text.secondary">
          活动 {conns.length} · 总 ↑ {fmtBytes(data?.uploadTotal ?? 0)} · ↓ {fmtBytes(data?.downloadTotal ?? 0)}
        </Typography>
        <Button size="small" color="error" onClick={closeAll} disabled={!conns.length}>
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
              <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                <Typography
                  variant="body2"
                  sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {c.metadata.host || c.metadata.destinationIP}:{c.metadata.destinationPort}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                  ↑ {fmtBytes(c.upload)} ↓ {fmtBytes(c.download)}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                <Chip size="small" label={c.metadata.network} />
                <Chip size="small" variant="outlined" label={c.chains?.join(' → ') || c.rule} />
              </Stack>
            </Box>
          ))}
          {!conns.length && (
            <Typography color="text.secondary">暂无活动连接(内核需在运行)。</Typography>
          )}
        </Stack>
      </Box>
    </Box>
  )
}
