import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { disable as autoDisable, enable as autoEnable, isEnabled as autoIsEnabled } from '@tauri-apps/plugin-autostart'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'

interface AppSettings {
  auto_start_core: boolean
  mixed_port: number
  local_mode: string
}

function Row({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', py: 1 }}>
      <Box sx={{ pr: 2 }}>
        <Typography>{label}</Typography>
        <Typography variant="body2" color="text.secondary">
          {desc}
        </Typography>
      </Box>
      <Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </Stack>
  )
}

export default function Settings() {
  const [autostart, setAutostart] = useState(false)
  const [autoCore, setAutoCore] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [themeMode, setThemeMode] = useState<string>(() => localStorage.getItem('theme-mode') || 'system')
  const [coreVer, setCoreVer] = useState<string | null>(null)
  const [testUrl, setTestUrl] = useState(
    () => localStorage.getItem('clash-test-url') || 'http://www.gstatic.com/generate_204',
  )
  const [busy, setBusy] = useState(false)
  const [port, setPort] = useState(7893)
  const [adminOk, setAdminOk] = useState(false)
  const [localMode, setLocalMode] = useState('system')

  const restartCore = async () => {
    setBusy(true)
    setErr(null)
    try {
      await invoke('restart_core')
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  const saveTestUrl = (v: string) => {
    setTestUrl(v)
    localStorage.setItem('clash-test-url', v)
  }

  const savePort = async () => {
    setBusy(true)
    setErr(null)
    try {
      await invoke('save_mixed_port', { port })
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  const changeLocalMode = async (v: string | null) => {
    if (!v || v === localMode) return
    setBusy(true)
    setErr(null)
    try {
      await invoke('set_local_mode', { mode: v })
      setLocalMode(v)
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  const doGrant = async () => {
    setBusy(true)
    setErr(null)
    try {
      await invoke('grant_admin')
      setAdminOk(await invoke<boolean>('admin_granted'))
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  const changeTheme = (v: string | null) => {
    if (!v) return
    localStorage.setItem('theme-mode', v)
    setThemeMode(v)
    window.dispatchEvent(new Event('thememode'))
  }

  useEffect(() => {
    ;(async () => {
      try {
        setAutostart(await autoIsEnabled())
        const s = await invoke<AppSettings>('get_settings')
        setAutoCore(s.auto_start_core)
        setPort(s.mixed_port || 7893)
        setLocalMode(s.local_mode || 'system')
        setAdminOk(await invoke<boolean>('admin_granted'))
        const cs = await invoke<{ version: string | null }>('core_status')
        setCoreVer(cs.version)
      } catch (e) {
        setErr(String(e))
      }
    })()
  }, [])

  const toggleAutostart = async (v: boolean) => {
    setErr(null)
    try {
      if (v) await autoEnable()
      else await autoDisable()
      setAutostart(v)
    } catch (e) {
      setErr(String(e))
    }
  }

  const toggleAutoCore = async (v: boolean) => {
    setErr(null)
    try {
      await invoke('set_auto_start_core', { enable: v })
      setAutoCore(v)
    } catch (e) {
      setErr(String(e))
    }
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        设置
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        常规
      </Typography>

      {err && (
        <Alert severity="error" sx={{ mb: 2, maxWidth: 680 }} onClose={() => setErr(null)}>
          {err}
        </Alert>
      )}

      <Card sx={{ maxWidth: 680 }}>
        <CardContent>
          <Row
            label="开机自启动"
            desc="登录系统后自动启动 clashlocal(后台到托盘)"
            checked={autostart}
            onChange={toggleAutostart}
          />
          <Divider />
          <Row
            label="启动后自动开启内核"
            desc="打开应用即拉起 mihomo 内核"
            checked={autoCore}
            onChange={toggleAutoCore}
          />
        </CardContent>
      </Card>

      <Card sx={{ maxWidth: 680, mt: 2 }}>
        <CardContent>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ pr: 2 }}>
              <Typography>本机网络模式</Typography>
              <Typography variant="body2" color="text.secondary">
                系统代理:改系统代理设置走 VPN,免管理员。
                <br />TUN:虚拟网卡接管本机全部流量(含不认代理的程序),需先完成下方「一次性授权」。
                <br />关闭:本机直连,不走 VPN。
              </Typography>
            </Box>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={localMode}
              onChange={(_, v) => changeLocalMode(v)}
              disabled={busy}
            >
              <ToggleButton value="system">系统代理</ToggleButton>
              <ToggleButton value="tun">TUN</ToggleButton>
              <ToggleButton value="none">关闭</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ maxWidth: 680, mt: 2 }}>
        <CardContent>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography>主题</Typography>
              <Typography variant="body2" color="text.secondary">
                外观模式
              </Typography>
            </Box>
            <ToggleButtonGroup size="small" exclusive value={themeMode} onChange={(_, v) => changeTheme(v)}>
              <ToggleButton value="system">跟随系统</ToggleButton>
              <ToggleButton value="light">浅色</ToggleButton>
              <ToggleButton value="dark">深色</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ maxWidth: 680, mt: 2 }}>
        <CardContent>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography>内核</Typography>
              <Typography variant="body2" color="text.secondary">
                mihomo {coreVer ?? '未运行 / 未知'}
              </Typography>
            </Box>
            <Button size="small" variant="outlined" onClick={restartCore} disabled={busy}>
              重启内核
            </Button>
          </Stack>
          <Divider sx={{ my: 1.5 }} />
          <Typography sx={{ mb: 1 }}>测速 URL</Typography>
          <TextField
            fullWidth
            size="small"
            value={testUrl}
            onChange={(e) => saveTestUrl(e.target.value)}
            helperText="代理页「测延迟」使用此地址"
          />
          <Divider sx={{ my: 1.5 }} />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography sx={{ flex: 1 }}>混合端口</Typography>
            <TextField
              size="small"
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value) || 0)}
              sx={{ width: 120 }}
            />
            <Button size="small" variant="outlined" onClick={savePort} disabled={busy}>
              应用
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            系统代理 + 局域网共享共用端口(修改后会重启内核)
          </Typography>
        </CardContent>
      </Card>

      <Card sx={{ maxWidth: 680, mt: 2 }}>
        <CardContent>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ pr: 2 }}>
              <Typography>一次性管理员授权</Typography>
              <Typography variant="body2" color="text.secondary">
                {adminOk
                  ? '已授权 ✓ 透明代理等特权操作不再弹密码'
                  : '仅透明代理(让局域网设备零配置走 VPN)需要;授权一次后永久免密。日常用「系统代理 / 局域网代理」无需授权。'}
              </Typography>
            </Box>
            <Button
              size="small"
              variant={adminOk ? 'outlined' : 'contained'}
              color={adminOk ? 'success' : 'primary'}
              onClick={doGrant}
              disabled={busy || adminOk}
            >
              {adminOk ? '已授权' : '授权'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ maxWidth: 680, mt: 2 }}>
        <CardContent>
          <Typography variant="overline" color="text.secondary">
            关于
          </Typography>
          <Typography variant="body2" color="text.secondary">
            clashlocal v0.1.0 · mihomo 内核 · 系统代理 + 局域网/热点共享
            <br />关闭窗口会最小化到系统托盘;从托盘「退出」可完整清理。
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
