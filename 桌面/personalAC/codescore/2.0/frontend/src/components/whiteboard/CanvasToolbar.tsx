import { Box, IconButton, Tooltip, Slider, Popover } from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import BackHandIcon from '@mui/icons-material/BackHand'
import UndoIcon from '@mui/icons-material/Undo'
import ZoomInIcon from '@mui/icons-material/ZoomIn'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import CircleIcon from '@mui/icons-material/Circle'
import { useState } from 'react'

type Tool = 'pen' | 'eraser' | 'move'

const COLORS = ['#141413', '#cc785c', '#3266ad', '#5db872', '#d4a017', '#c64545', '#8e8b82']
const WIDTHS = [2, 4, 6, 10]

interface Props {
  tool: Tool
  penColor: string
  penWidth: number
  zoom: number
  onToolChange: (t: Tool) => void
  onColorChange: (c: string) => void
  onWidthChange: (w: number) => void
  onUndo: () => void
  onClearAI: () => void
}

export default function CanvasToolbar({ tool, penColor, penWidth, zoom, onToolChange, onColorChange, onWidthChange, onUndo, onClearAI }: Props) {
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null)

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.5,
      bgcolor: '#ffffff', borderTop: '0.5px solid var(--hairline)',
      justifyContent: 'space-between',
    }}>
      {/* 工具组 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Tooltip title="笔">
          <IconButton size="small" onClick={() => onToolChange('pen')}
            sx={{ bgcolor: tool === 'pen' ? 'rgba(204,120,92,0.12)' : 'transparent', color: tool === 'pen' ? 'var(--primary)' : 'var(--muted)' }}>
            <EditIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="橡皮">
          <IconButton size="small" onClick={() => onToolChange('eraser')}
            sx={{ bgcolor: tool === 'eraser' ? 'rgba(204,120,92,0.12)' : 'transparent', color: tool === 'eraser' ? 'var(--primary)' : 'var(--muted)' }}>
            <DeleteSweepIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="移动/拖拽">
          <IconButton size="small" onClick={() => onToolChange('move')}
            sx={{ bgcolor: tool === 'move' ? 'rgba(204,120,92,0.12)' : 'transparent', color: tool === 'move' ? 'var(--primary)' : 'var(--muted)' }}>
            <BackHandIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        <Box sx={{ width: 1, height: 20, bgcolor: 'var(--hairline)', mx: 0.5 }} />

        {/* 颜色选择 */}
        <Tooltip title="颜色">
          <IconButton size="small" onClick={e => setColorAnchor(e.currentTarget)}>
            <CircleIcon sx={{ fontSize: 16, color: penColor }} />
          </IconButton>
        </Tooltip>
        <Popover open={!!colorAnchor} anchorEl={colorAnchor} onClose={() => setColorAnchor(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }} transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
          <Box sx={{ display: 'flex', gap: 0.5, p: 1 }}>
            {COLORS.map(c => (
              <Box key={c} onClick={() => { onColorChange(c); setColorAnchor(null) }}
                sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: c, cursor: 'pointer', border: c === penColor ? '2px solid var(--ink)' : '2px solid transparent', '&:hover': { opacity: 0.8 } }} />
            ))}
          </Box>
        </Popover>

        {/* 粗细 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.5 }}>
          {WIDTHS.map(w => (
            <Box key={w} onClick={() => onWidthChange(w)}
              sx={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 1, bgcolor: w === penWidth ? 'rgba(204,120,92,0.12)' : 'transparent' }}>
              <Box sx={{ width: w + 4, height: w + 4, borderRadius: '50%', bgcolor: penColor }} />
            </Box>
          ))}
        </Box>
      </Box>

      {/* 右侧操作 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Tooltip title="撤销">
          <IconButton size="small" onClick={onUndo}><UndoIcon sx={{ fontSize: 18 }} /></IconButton>
        </Tooltip>
        <Tooltip title="清除 AI 标记">
          <IconButton size="small" onClick={onClearAI}><DeleteSweepIcon sx={{ fontSize: 16 }} /></IconButton>
        </Tooltip>
        <Box sx={{ width: 1, height: 20, bgcolor: 'var(--hairline)', mx: 0.5 }} />
        <ZoomInIcon sx={{ fontSize: 14, color: 'var(--muted-soft)' }} />
        <Box component="span" sx={{ fontSize: 12, color: 'var(--muted-soft)', minWidth: 36, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </Box>
      </Box>
    </Box>
  )
}
