import { useCallback, useEffect, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, IconButton, Stack, Typography } from '@mui/material'
import SpeedRoundedIcon from '@mui/icons-material/SpeedRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded'
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
const testUrl = () => localStorage.getItem('clash-test-url') || 'http://www.gstatic.com/generate_204'

function delayHex(d?: number): string {
  if (d == null) return 'text.secondary'
  if (d <= 0) return '#ff6b6b'
  if (d < 200) return '#38d39f'
  if (d < 500) return '#f5a623'
  return '#ff6b6b'
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

  const [sortDelay, setSortDelay] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
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
  const delayVal = (name: string) => {
    const d = lastDelay(name)
    return d && d > 0 ? d : 1e9
  }

  const testGroup = async (g: ProxyNode) => {
    setTesting(g.name)
    try {
      await Promise.all(
        (g.all || []).map((n) =>
          api(`/proxies/${encodeURIComponent(n)}/delay?url=${encodeURIComponent(testUrl())}&timeout=5000`).catch(
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
                <Stack direction="row" sx={{ alignItems: 'center', minWidth: 0 }}>
                  <IconButton
                    size="small"
                    sx={{ mr: 0.5 }}
                    onClick={() => setCollapsed((c) => ({ ...c, [g.name]: !c[g.name] }))}
                  >
                    {collapsed[g.name] ? <ExpandMoreRoundedIcon /> : <ExpandLessRoundedIcon />}
                  </IconButton>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }}>{g.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {g.type} · {g.all?.length ?? 0} 节点 · 当前 {g.now ?? '—'}
                    </Typography>
                  </Box>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant={sortDelay ? 'contained' : 'text'}
                    onClick={() => setSortDelay((s) => !s)}
                  >
                    按延迟排序
                  </Button>
                  <Button
                    size="small"
                    startIcon={<SpeedRoundedIcon />}
                    onClick={() => testGroup(g)}
                    disabled={testing === g.name}
                  >
                    {testing === g.name ? '测速中…' : '测延迟'}
                  </Button>
                </Stack>
              </Stack>
              {!collapsed[g.name] && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                {(sortDelay ? [...(g.all || [])].sort((a, b) => delayVal(a) - delayVal(b)) : g.all || []).map((n) => {
                  const d = lastDelay(n)
                  const selected = g.now === n
                  return (
                    <Box
                      key={n}
                      onClick={() => select(g.name, n)}
                      sx={{
                        flex: '1 1 160px',
                        minWidth: 150,
                        maxWidth: 240,
                        p: 1,
                        borderRadius: 1.5,
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: selected ? 'primary.main' : 'divider',
                        bgcolor: selected ? 'action.selected' : 'transparent',
                        transition: 'border-color .15s',
                        '&:hover': { borderColor: 'primary.main' },
                      }}
                    >
                      <Typography variant="body2" noWrap title={n} sx={{ fontWeight: selected ? 600 : 400 }}>
                        {n}
                      </Typography>
                      <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          {proxies[n]?.type || ''}
                        </Typography>
                        <Typography variant="caption" sx={{ color: delayHex(d) }}>
                          {d != null && d > 0 ? `${d}ms` : '—'}
                        </Typography>
                      </Stack>
                    </Box>
                  )
                })}
              </Box>
              )}
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  )
}
