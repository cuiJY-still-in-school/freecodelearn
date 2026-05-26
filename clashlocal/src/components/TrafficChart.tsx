import { Box } from '@mui/material'

interface Sample {
  up: number
  down: number
}

/** 轻量 SVG 折线图:上行(蓝)/下行(绿)。无第三方依赖。 */
export default function TrafficChart({
  data,
  height = 88,
}: {
  data: Sample[]
  height?: number
}) {
  const W = 600
  const n = data.length
  const max = Math.max(1, ...data.flatMap((d) => [d.up, d.down]))
  const line = (key: 'up' | 'down') =>
    data
      .map((d, i) => `${(i / Math.max(1, n - 1)) * W},${height - (d[key] / max) * (height - 4) - 2}`)
      .join(' ')

  return (
    <Box sx={{ width: '100%' }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        {n > 1 && (
          <>
            <polyline fill="none" stroke="#38d39f" strokeWidth="1.5" points={line('down')} />
            <polyline fill="none" stroke="#6172ff" strokeWidth="1.5" points={line('up')} />
          </>
        )}
      </svg>
    </Box>
  )
}
