import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'

interface Profile {
  uid: string
  name: string
  url: string | null
  updated: number
}
interface ProfileIndex {
  profiles: Profile[]
  active: string | null
}

export default function Profiles() {
  const [idx, setIdx] = useState<ProfileIndex>({ profiles: [], active: null })
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setIdx(await invoke<ProfileIndex>('list_profiles'))
    } catch (e) {
      setErr(String(e))
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setErr(null)
    try {
      await fn()
      await refresh()
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  const doImport = () => {
    if (!url.trim()) return
    run(async () => {
      await invoke('import_profile', { name: name.trim() || '订阅', url: url.trim() })
      setName('')
      setUrl('')
    })
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        配置
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        订阅管理(Clash / mihomo 格式)
      </Typography>

      {err && (
        <Alert severity="error" sx={{ mb: 2, maxWidth: 720 }} onClose={() => setErr(null)}>
          {err}
        </Alert>
      )}

      <Card sx={{ mb: 2, maxWidth: 720 }}>
        <CardContent>
          <Typography variant="overline" color="text.secondary">
            导入订阅
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <TextField
              size="small"
              label="名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              sx={{ width: 150 }}
            />
            <TextField
              size="small"
              label="订阅 URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              sx={{ flex: 1 }}
            />
            <Button variant="contained" onClick={doImport} disabled={busy}>
              导入
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Stack spacing={1.5} sx={{ maxWidth: 720 }}>
        {idx.profiles.length === 0 && (
          <Typography color="text.secondary">还没有订阅,粘贴 URL 导入。</Typography>
        )}
        {idx.profiles.map((p) => (
          <Card
            key={p.uid}
            sx={{ borderColor: idx.active === p.uid ? 'primary.main' : undefined }}
          >
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1, '&:last-child': { pb: 2 } }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography sx={{ fontWeight: 600 }}>{p.name}</Typography>
                  {idx.active === p.uid && (
                    <Chip size="small" color="primary" label="使用中" icon={<CheckCircleRoundedIcon />} />
                  )}
                </Stack>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {p.url}
                </Typography>
              </Box>
              {idx.active !== p.uid && (
                <Button size="small" onClick={() => run(() => invoke('activate_profile', { uid: p.uid }))} disabled={busy}>
                  激活
                </Button>
              )}
              <Tooltip title="更新">
                <span>
                  <IconButton
                    size="small"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await invoke('update_profile', { uid: p.uid })
                        if (idx.active === p.uid) await invoke('restart_core').catch(() => {})
                      })
                    }
                  >
                    <RefreshRoundedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="删除">
                <span>
                  <IconButton size="small" disabled={busy} onClick={() => run(() => invoke('delete_profile', { uid: p.uid }))}>
                    <DeleteOutlineRoundedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  )
}
