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
}
interface RuntimeConfig {
  mixed_port: number
  controller: string
  secret: string
}

const MODES = [
  { v: 'rule', label: '规则' },
  { v: 'global', label: '全局' },
  { v: 'direct', label: '直连' },
]

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

  // 内核运行时:取当前模式 + 订阅实时流量/内存
  useEffect(() => {
    if (!running) {
      setTraffic({ up: 0, down: 0 })
      setMem(0)
      setHistory([])
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
    return () => {
      alive = false
      sockets.forEach((s) => s.close())
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
        <Alert severity="error" sx={{ mb: 2, maxWidth: 680 }} onClose={() => setErr(null)}>
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
        <Stack spacing={2} sx={{ maxWidth: 680 }}>
          <Card>
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="overline" color="text.secondary">
                    内核
                  </Typography>
                  <Typography variant="h6" color={running ? 'success.main' : 'text.primary'}>
                    {running ? '● 运行中' : '○ 已停止'}
                  </Typography>
                </Box>
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

              {running && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                    <ToggleButtonGroup
                      size="small"
                      exclusive
                      value={mode}
                      onChange={(_, m) => changeMode(m)}
                    >
                      {MODES.map((m) => (
                        <ToggleButton key={m.v} value={m.v} sx={{ px: 2 }}>
                          {m.label}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                    <Stack direction="row" spacing={2}>
                      <Typography variant="body2" color="text.secondary">
                        ↑ {fmtBytes(traffic.up)}/s
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        ↓ {fmtBytes(traffic.down)}/s
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        内存 {fmtBytes(mem)}
                      </Typography>
                    </Stack>
                  </Stack>
                  <Box sx={{ mt: 1.5 }}>
                    <Stack direction="row" spacing={2} sx={{ mb: 0.5 }}>
                      <Typography variant="caption" sx={{ color: '#38d39f' }}>
                        ● 下载
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6172ff' }}>
                        ● 上传
                      </Typography>
                    </Stack>
                    <TrafficChart data={history} />
                  </Box>
                </>
              )}

              <Divider sx={{ my: 2 }} />
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                <Chip size="small" label={`版本 ${status?.version ?? '—'}`} />
                <Chip size="small" label={`混合端口 ${port}`} />
                <Chip size="small" label={`控制器 ${rt?.controller ?? '—'}`} />
              </Stack>
            </CardContent>
          </Card>

          <Card>
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
        </Stack>
      )}
    </Box>
  )
}
