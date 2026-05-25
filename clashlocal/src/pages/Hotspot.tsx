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
  const [status, setStatus] = useState<HotspotStatus | null>(null)
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
      setStatus(await invoke<HotspotStatus>('hotspot_status'))
      setDevices(await invoke<string[]>('list_wifi_devices'))
    } catch (e) {
      setErr(String(e))
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const active = status?.active ?? false
  const ifOptions = devices.length ? Array.from(new Set([ifname, ...devices])) : [ifname]

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
        热点
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        把本机变成 WiFi 热点,连入设备走 VPN
      </Typography>

      <Alert severity="info" sx={{ mb: 2, maxWidth: 720 }}>
        单网卡(wlan0 同时上网)时,AP 与上网需同频段并发,5GHz 宽频道常不支持 —— 可改用 2.4GHz、走网线上网,
        或插第二块网卡(下方可选接口/频段)。透明代理依赖 root,开启时会弹授权(pkexec)。
      </Alert>

      {err && (
        <Alert severity="error" sx={{ mb: 2, maxWidth: 720 }} onClose={() => setErr(null)}>
          {err}
        </Alert>
      )}

      <Stack spacing={2} sx={{ maxWidth: 720 }}>
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
                disabled={busy}
                sx={{ minWidth: 100 }}
              >
                {active ? '关闭热点' : '开启热点'}
              </Button>
            </Stack>
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
                    手机相机/微信扫码即可加入热点。
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
                  开启后,连入热点的设备无需任何配置,全部 TCP/UDP 流量自动走 VPN(nft TPROXY + setcap,需 root 授权)。
                </Typography>
              </Box>
              <Switch checked={transparent} onChange={(e) => toggleTransparent(e.target.checked)} disabled={busy} />
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
