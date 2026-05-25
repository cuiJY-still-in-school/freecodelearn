import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { disable as autoDisable, enable as autoEnable, isEnabled as autoIsEnabled } from '@tauri-apps/plugin-autostart'
import { Alert, Box, Card, CardContent, Divider, Stack, Switch, Typography } from '@mui/material'

interface AppSettings {
  auto_start_core: boolean
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

  useEffect(() => {
    ;(async () => {
      try {
        setAutostart(await autoIsEnabled())
        const s = await invoke<AppSettings>('get_settings')
        setAutoCore(s.auto_start_core)
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
