import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { api, fmtBytes, openWs } from '../api/controller'
import TrafficChart from '../components/TrafficChart'

interface CoreStatus {
  running: boolean
  version: string | null
  present: boolean
  uptime: number
}
interface RuntimeConfig {
  mixed_port: number
  controller: string
  secret: string
}

function fmtUptime(s: number): string {
  if (!s) return '—'
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`
}

const MODES = [
  { v: 'rule', label: '规则' },
  { v: 'global', label: '全局' },
  { v: 'direct', label: '直连' },
]

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card sx={{ flex: '1 1 140px', minWidth: 128 }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h6" sx={{ color: color || 'text.primary', fontWeight: 600, lineHeight: 1.25 }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  )
}

export default function Home() {
  const [status, setStatus] = useState<CoreStatus | null>(null)
  const [rt, setRt] = useState<RuntimeConfig | null>(null)
  const [sysProxy, setSysProxy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [mode, setMode] = useState('rule')
  const [traffic, setTraffic] = useState({ up: 0, down: 0 })
  const [mem, setMem] = useState(0)
  const [lanIp, setLanIp] = useState<string | null>(null)
  const [history, setHistory] = useState<{ up: number; down: number }[]>([])
  const [conns, setConns] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const [s, r, sp, ip] = await Promise.all([
        invoke<CoreStatus>('core_status'),
        invoke<RuntimeConfig>('get_runtime_config'),
        invoke<boolean>('system_proxy_status'),
        invoke<string | null>('lan_ip'),
      ])
      setStatus(s)
      setRt(r)
      setSysProxy(sp)
      setLanIp(ip)
    } catch (e) {
      setErr(String(e))
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const running = status?.running ?? false
  const port = rt?.mixed_port ?? 7893

  // 内核运行时:取当前模式 + 订阅实时流量/内存/连接
  useEffect(() => {
    if (!running) {
      setTraffic({ up: 0, down: 0 })
      setMem(0)
      setHistory([])
      setConns(0)
      return
    }
    let alive = true
    const sockets: WebSocket[] = []
    api<{ mode: string }>('/configs')
      .then((c) => {
        if (alive && c?.mode) setMode(c.mode)
      })
      .catch(() => {})
    openWs('/traffic')
      .then((ws) => {
        if (!alive) return ws.close()
        sockets.push(ws)
        ws.onmessage = (e) => {
          try {
            const t = JSON.parse(e.data)
            setTraffic(t)
            setHistory((h) => [...h.slice(-59), { up: t.up || 0, down: t.down || 0 }])
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {})
    openWs('/memory')
      .then((ws) => {
        if (!alive) return ws.close()
        sockets.push(ws)
        ws.onmessage = (e) => {
          try {
            setMem(JSON.parse(e.data).inuse || 0)
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {})
    openWs('/connections')
      .then((ws) => {
        if (!alive) return ws.close()
        sockets.push(ws)
        ws.onmessage = (e) => {
          try {
            setConns((JSON.parse(e.data).connections || []).length)
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {})
    const statusTimer = setInterval(() => {
      invoke<CoreStatus>('core_status')
        .then(setStatus)
        .catch(() => {})
    }, 5000)
    return () => {
      alive = false
      sockets.forEach((s) => s.close())
      clearInterval(statusTimer)
    }
  }, [running])

  const toggleCore = async () => {
    setBusy(true)
    setErr(null)
    try {
      if (running) {
        await invoke('stop_core')
        if (sysProxy) await invoke('set_system_proxy', { enable: false })
      } else {
        await invoke('start_core')
      }
      await refresh()
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  const toggleSysProxy = async (enable: boolean) => {
    setErr(null)
    try {
      await invoke('set_system_proxy', { enable })
      setSysProxy(enable)
    } catch (e) {
      setErr(String(e))
      await refresh()
    }
  }

  const downloadCore = async () => {
    setBusy(true)
    setErr(null)
    try {
      await invoke('download_core')
      await refresh()
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  const changeMode = async (m: string | null) => {
    if (!m) return
    setMode(m)
    try {
      await api('/configs', { method: 'PATCH', body: JSON.stringify({ mode: m }) })
    } catch (e) {
      setErr(String(e))
    }
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        首页
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        mihomo 内核 · 系统代理模式 · 局域网共享
      </Typography>

      {err && (
        <Alert severity="error" sx={{ mb: 2, maxWidth: 920 }} onClose={() => setErr(null)}>
          {err}
        </Alert>
      )}

      {status && !status.present ? (
        <Card sx={{ maxWidth: 680 }}>
          <CardContent>
            <Typography color="warning.main" gutterBottom>
              ● 未检测到 mihomo 内核
            </Typography>
            <Button variant="contained" onClick={downloadCore} disabled={busy}>
              {busy ? '下载中…' : '下载内核'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ maxWidth: 920 }}>
          {/* 内核控制 */}
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Stack
                direction="row"
                sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}
              >
                <Box>
                  <Typography variant="overline" color="text.secondary">
                    内核
                  </Typography>
                  <Typography variant="h6" color={running ? 'success.main' : 'text.primary'}>
                    {running ? '● 运行中' : '○ 已停止'}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  {running && (
                    <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, m) => changeMode(m)}>
                      {MODES.map((m) => (
                        <ToggleButton key={m.v} value={m.v} sx={{ px: 2 }}>
                          {m.label}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  )}
                  <Button
                    variant={running ? 'outlined' : 'contained'}
                    color={running ? 'error' : 'primary'}
                    onClick={toggleCore}
                    disabled={busy}
                    sx={{ minWidth: 96 }}
                  >
                    {busy ? <CircularProgress size={20} color="inherit" /> : running ? '停止' : '启动'}
                  </Button>
                </Stack>
              </Stack>
              <Divider sx={{ my: 2 }} />
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                <Chip size="small" label={`版本 ${status?.version ?? '—'}`} />
                <Chip size="small" label={`混合端口 ${port}`} />
                <Chip size="small" label={`控制器 ${rt?.controller ?? '—'}`} />
              </Stack>
            </CardContent>
          </Card>

          {/* 统计磁贴 + 流量图 */}
          {running && (
            <>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
                <StatCard label="下载" value={`${fmtBytes(traffic.down)}/s`} color="#38d39f" />
                <StatCard label="上传" value={`${fmtBytes(traffic.up)}/s`} color="#6172ff" />
                <StatCard label="内存" value={fmtBytes(mem)} />
                <StatCard label="连接" value={String(conns)} />
                <StatCard label="运行" value={fmtUptime(status?.uptime ?? 0)} />
              </Box>
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Stack direction="row" spacing={2} sx={{ mb: 1, alignItems: 'center' }}>
                    <Typography variant="overline" color="text.secondary">
                      实时流量
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#38d39f' }}>
                      ● 下载
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#6172ff' }}>
                      ● 上传
                    </Typography>
                  </Stack>
                  <TrafficChart data={history} />
                </CardContent>
              </Card>
            </>
          )}

          {/* 系统代理 */}
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ pr: 2 }}>
                  <Typography variant="overline" color="text.secondary">
                    系统代理
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    把本机系统代理指向 clashlocal(127.0.0.1:{port})。关闭时自动还原原有代理设置。
                  </Typography>
                </Box>
                <Switch
                  checked={sysProxy}
                  onChange={(e) => toggleSysProxy(e.target.checked)}
                  disabled={!running && !sysProxy}
                />
              </Stack>
            </CardContent>
          </Card>

          {/* 局域网共享 */}
          <Card>
            <CardContent>
              <Typography variant="overline" color="text.secondary">
                局域网共享
              </Typography>
              <Typography variant="body2" color="text.secondary">
                同一 WiFi/网络下的设备,把 HTTP/SOCKS 代理设为「{lanIp ?? '本机IP'}:{port}」即可走 VPN,无需热点。
              </Typography>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  )
}
