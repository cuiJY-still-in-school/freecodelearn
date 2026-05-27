import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { QRCodeSVG } from 'qrcode.react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'

interface Settings {
  transparent: boolean
  mixed_port: number
  hotspot_ssid: string
  hotspot_password: string
  hotspot_ifname: string
  hotspot_band: string
}
interface HotspotStatus {
  active: boolean
  subnet: string | null
  gateway: string | null
}
interface WifiCap {
  detected: boolean
  ap_supported: boolean
  concurrent: boolean
  same_channel_only: boolean
  band_24: boolean
  band_5: boolean
  sta_band: string
  level: string
  advice: string
}

const BANDS = [
  { v: '', label: '自动' },
  { v: 'bg', label: '2.4 GHz' },
  { v: 'a', label: '5 GHz' },
]

export default function Hotspot() {
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const [ifname, setIfname] = useState('wlan0')
  const [band, setBand] = useState('')
  const [devices, setDevices] = useState<string[]>([])
  const [transparent, setTransparent] = useState(false)
  const [platform, setPlatform] = useState('linux')
  const [lanIp, setLanIp] = useState<string | null>(null)
  const [port, setPort] = useState(7893)
  const [status, setStatus] = useState<HotspotStatus | null>(null)
  const [cap, setCap] = useState<WifiCap | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const s = await invoke<Settings>('get_settings')
      setSsid(s.hotspot_ssid)
      setPassword(s.hotspot_password)
      setIfname(s.hotspot_ifname || 'wlan0')
      setBand(s.hotspot_band || '')
      setTransparent(s.transparent)
      setPort(s.mixed_port || 7893)
      setStatus(await invoke<HotspotStatus>('hotspot_status'))
      setDevices(await invoke<string[]>('list_wifi_devices'))
      setPlatform(await invoke<string>('os_platform'))
      try {
        setLanIp(await invoke<string>('lan_ip'))
      } catch {
        setLanIp(null)
      }
      try {
        setCap(await invoke<WifiCap>('wifi_capability'))
      } catch {
        setCap(null)
      }
    } catch (e) {
      setErr(String(e))
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const active = status?.active ?? false
  const isLinux = platform === 'linux'
  const ifOptions = devices.length ? Array.from(new Set([ifname, ...devices])) : [ifname]
  const blocked = !!cap?.detected && cap.level === 'block'
  const capSeverity = (cap?.level === 'block' ? 'error' : cap?.level === 'warn' ? 'warning' : 'success') as
    | 'error'
    | 'warning'
    | 'success'

  const toggleHotspot = async () => {
    setBusy(true)
    setErr(null)
    try {
      if (active) {
        await invoke('hotspot_stop')
      } else {
        await invoke('save_hotspot_config', { ssid, password, ifname, band })
        await invoke('hotspot_start')
      }
      await refresh()
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  const toggleTransparent = async (en: boolean) => {
    setBusy(true)
    setErr(null)
    try {
      await invoke('set_transparent', { enable: en })
      setTransparent(en)
      await refresh()
    } catch (e) {
      setErr(String(e))
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const wifiQr = `WIFI:T:WPA;S:${ssid};P:${password};;`

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        共享
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        把本机的 VPN 共享给同一局域网/WiFi 下的其它设备
      </Typography>

      <Alert severity="success" sx={{ mb: 2, maxWidth: 720 }}>
        推荐:<b>局域网代理</b>(下方)。本机与手机连同一个 WiFi/路由器,手机把代理填成「本机IP:{port}」即可走 VPN,
        <b>无需管理员、无需开热点</b>。热点能否使用取决于网卡能力,下方已自动检测。
      </Alert>

      {err && (
        <Alert severity="error" sx={{ mb: 2, maxWidth: 720 }} onClose={() => setErr(null)}>
          {err}
        </Alert>
      )}

      <Stack spacing={2} sx={{ maxWidth: 720 }}>
        <Card sx={{ borderLeft: '3px solid', borderColor: 'success.main' }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              局域网代理(推荐 · 免管理员)
            </Typography>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {lanIp ? `${lanIp}:${port}` : '未获取到本机局域网 IP'}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1, color: 'success.main' }}>
              本机始终连着原来的 WiFi,网络完全不受影响——只是帮局域网里的其它设备转发流量。
            </Typography>
            <Typography variant="body2" color="text.secondary">
              确保内核已启动、本机与设备在同一 WiFi/路由器下,然后在设备上手动设置 HTTP/SOCKS 代理:
              <br />· iPhone:设置 → 无线局域网 → 点当前 WiFi 的 ⓘ → 配置代理 → 手动 → 服务器填上面 IP、端口填 {port}
              <br />· Android:WiFi → 修改网络 → 高级 → 代理「手动」→ 同样填写
              <br />· 电脑:浏览器/系统代理填「{lanIp ?? '本机IP'}:{port}」
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="overline" color="text.secondary">
                  WiFi 热点
                </Typography>
                <Typography variant="h6" color={active ? 'success.main' : 'text.primary'}>
                  {active ? '● 已开启' : '○ 已关闭'}
                </Typography>
              </Box>
              <Button
                variant={active ? 'outlined' : 'contained'}
                color={active ? 'error' : 'primary'}
                onClick={toggleHotspot}
                disabled={busy || (!active && blocked)}
                sx={{ minWidth: 100 }}
              >
                {active ? '关闭热点' : '开启热点'}
              </Button>
            </Stack>
            {isLinux && cap && (
              <Alert
                severity={cap.detected ? capSeverity : 'info'}
                sx={{ mb: 2 }}
                icon={false}
              >
                <Typography variant="body2">
                  <b>网卡检测</b>:{cap.advice}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  注意:本机是单网卡,开启热点会把网卡切到 AP 模式,<b>本机会暂时脱离当前 WiFi</b>。
                  想让本机一直保持原来的网络,请用上面的「局域网代理」。
                </Typography>
                {cap.detected && (
                  <Typography variant="caption" color="text.secondary">
                    AP 模式 {cap.ap_supported ? '✓' : '✗'} · 边上网边开热点{' '}
                    {cap.concurrent ? (cap.same_channel_only ? '受限(需同信道)' : '✓') : '✗'} · 频段{' '}
                    {[cap.band_24 && '2.4G', cap.band_5 && '5G'].filter(Boolean).join('/') || '—'}
                    {cap.sta_band && ` · 当前 ${cap.sta_band}`}
                  </Typography>
                )}
              </Alert>
            )}
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <TextField
                size="small"
                label="名称 (SSID)"
                value={ssid}
                onChange={(e) => setSsid(e.target.value)}
                disabled={active}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                label="密码 (≥8 位)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={active}
                sx={{ flex: 1 }}
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                select
                size="small"
                label="AP 网卡"
                value={ifname}
                onChange={(e) => setIfname(e.target.value)}
                disabled={active}
                sx={{ width: 160 }}
              >
                {ifOptions.map((d) => (
                  <MenuItem key={d} value={d}>
                    {d}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="频段"
                value={band}
                onChange={(e) => setBand(e.target.value)}
                disabled={active}
                sx={{ width: 140 }}
              >
                {BANDS.map((b) => (
                  <MenuItem key={b.v} value={b.v}>
                    {b.label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            {active && status?.gateway && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                网关 {status.gateway} · 子网 {status.subnet}
              </Typography>
            )}
          </CardContent>
        </Card>

        {active && (
          <Card>
            <CardContent>
              <Stack direction="row" spacing={3} sx={{ alignItems: 'center' }}>
                <Box sx={{ p: 1.5, bgcolor: '#fff', borderRadius: 1, lineHeight: 0 }}>
                  <QRCodeSVG value={wifiQr} size={140} />
                </Box>
                <Box>
                  <Typography variant="overline" color="text.secondary">
                    扫码连接
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    用 <b>iPhone 自带相机</b> 或系统扫码器对准即可加入热点(微信扫码常把它当文本、识别不了,不要用微信)。
                    <br />SSID:{ssid}
                    <br />密码:{password}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Box sx={{ pr: 2 }}>
                <Typography variant="overline" color="text.secondary">
                  透明代理
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {isLinux
                    ? '开启后,连入热点的设备无需任何配置,全部 TCP/UDP 流量自动走 VPN(nft TPROXY + setcap,需 root 授权)。'
                    : '透明代理仅支持 Linux。本平台请用代理模式:设备手动把代理设为「网关IP:7893」。'}
                </Typography>
              </Box>
              <Switch
                checked={transparent}
                onChange={(e) => toggleTransparent(e.target.checked)}
                disabled={busy || !isLinux}
              />
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              连接说明
            </Typography>
            <Typography variant="body2" color="text.secondary">
              · 开启「透明代理」:设备连上热点即自动走 VPN,零配置。
              <br />· 不开透明代理:设备手动把代理设为「网关IP:7893」也可走 VPN。
              <br />· 从托盘「退出」会自动清理透明代理规则。
            </Typography>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  )
}
