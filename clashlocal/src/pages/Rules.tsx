import { useEffect, useState } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import { api } from '../api/controller'

interface Rule {
  type: string
  payload: string
  proxy: string
}

export default function Rules() {
  const [rules, setRules] = useState<Rule[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api<{ rules: Rule[] }>('/rules')
      .then((r) => setRules(r.rules || []))
      .catch((e) => setErr(String(e)))
  }, [])

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        规则
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {rules.length} 条
      </Typography>
      {err && (
        <Typography color="error.main" sx={{ mb: 2 }}>
          {err}
        </Typography>
      )}
      <Stack spacing={0.5}>
        {rules.slice(0, 1000).map((r, i) => (
          <Stack key={i} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Chip size="small" label={r.type} sx={{ width: 140, justifyContent: 'flex-start', flexShrink: 0 }} />
            <Typography
              variant="body2"
              sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {r.payload || '—'}
            </Typography>
            <Typography variant="caption" color="primary.main" sx={{ flexShrink: 0 }}>
              {r.proxy}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  )
}
