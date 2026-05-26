import { useEffect, useState } from 'react'
import { Box, Typography } from '@mui/material'
import { getRuntime } from '../api/controller'

export default function Dashboard() {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    getRuntime()
      .then((rt) => {
        const [host, port] = rt.controller.split(':')
        setUrl(
          `http://${rt.controller}/ui/?hostname=${host}&port=${port}&secret=${encodeURIComponent(rt.secret)}`,
        )
      })
      .catch(() => {})
  }, [])

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
        仪表盘
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        metacubexd 面板 —— 内核首次启动会自动下载;若显示空白,请确认内核已启动并稍候片刻。
      </Typography>
      {url && (
        <Box
          component="iframe"
          src={url}
          sx={{ flex: 1, width: '100%', border: 'none', borderRadius: 1, bgcolor: '#fff' }}
        />
      )}
    </Box>
  )
}
