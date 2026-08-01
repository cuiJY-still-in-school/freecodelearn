import { Box, Typography } from '@mui/material'

type CompanionState = 'idle' | 'watching' | 'thinking' | 'writing'

const stateLabel: Record<CompanionState, string> = {
  idle: '在你旁边',
  watching: '正在看你的白板…',
  thinking: '正在思考…',
  writing: '正在白板上写东西…',
}

export default function CompanionAvatar({ state, name = '小伴', size = 36 }: { state: CompanionState; name?: string; size?: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box className={`companion-avatar ${state}`} sx={{ width: size, height: size }}>
        <Typography sx={{ fontSize: size * 0.4, lineHeight: 1 }}>
          {state === 'idle' ? '伴' : state === 'watching' ? '👀' : state === 'thinking' ? '🤔' : '✍️'}
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ color: 'var(--muted)', fontSize: 13 }}>
        {stateLabel[state]}
      </Typography>
    </Box>
  )
}
