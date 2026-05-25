import { useCallback, useEffect, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material'
import SpeedRoundedIcon from '@mui/icons-material/SpeedRounded'
import { api } from '../api/controller'

interface ProxyNode {
  name: string
  type: string
  now?: string
  all?: string[]
  history?: { delay: number }[]
}
interface ProxiesResp {
  proxies: Record<string, ProxyNode>
}

const GROUP_TYPES = ['Selector', 'URLTest', 'Fallback', 'LoadBalance', 'Relay']
const TEST_URL = 'http://www.gstatic.com/generate_204'

function delayColor(d?: number): 'success' | 'warning' | 'error' | 'default' {
  if (d == null) return 'default'
  if (d <= 0) return 'error'
  if (d < 200) return 'success'
  if (d < 500) return 'warning'
  return 'error'
}

export default function Proxies() {
  const [proxies, setProxies] = useState<Record<string, ProxyNode>>({})
  const [err, setErr] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await api<ProxiesResp>('/proxies')
      setProxies(r.proxies || {})
    } catch (e) {
      setErr(String(e))
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const groups = Object.values(proxies).filter((p) => GROUP_TYPES.includes(p.type) && p.all)

  const select = async (group: string, node: string) => {
    setErr(null)
    try {
      await api(`/proxies/${encodeURIComponent(group)}`, {
        method: 'PUT',
        body: JSON.stringify({ name: node }),
      })
      await refresh()
    } catch (e) {
      setErr(String(e))
    }
  }

  const lastDelay = (name: string) => {
    const h = proxies[name]?.history
    return h && h.length ? h[h.length - 1].delay : undefined
  }

  const testGroup = async (g: ProxyNode) => {
    setTesting(g.name)
    try {
      await Promise.all(
        (g.all || []).map((n) =>
          api(`/proxies/${encodeURIComponent(n)}/delay?url=${encodeURIComponent(TEST_URL)}&timeout=5000`).catch(
            () => {},
          ),
        ),
      )
      await refresh()
    } finally {
      setTesting(null)
    }
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        代理
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        代理组与节点
      </Typography>

      {err && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr(null)}>
          {err}
        </Alert>
      )}

      {groups.length === 0 && (
        <Typography color="text.secondary">
          无代理组。导入订阅并启动内核后,这里会显示节点。
        </Typography>
      )}

      <Stack spacing={2}>
        {groups.map((g) => (
          <Card key={g.name}>
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Box>
                  <Typography sx={{ fontWeight: 600 }}>{g.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {g.type} · 当前 {g.now ?? '—'}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  startIcon={<SpeedRoundedIcon />}
                  onClick={() => testGroup(g)}
                  disabled={testing === g.name}
                >
                  {testing === g.name ? '测速中…' : '测延迟'}
                </Button>
              </Stack>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {(g.all || []).map((n) => {
                  const d = lastDelay(n)
                  const selected = g.now === n
                  return (
                    <Chip
                      key={n}
                      label={d != null && d > 0 ? `${n} · ${d}ms` : n}
                      onClick={() => select(g.name, n)}
                      color={selected ? 'primary' : delayColor(d)}
                      variant={selected ? 'filled' : 'outlined'}
                      size="small"
                    />
                  )
                })}
              </Box>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  )
}
