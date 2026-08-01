import { useCallback, useRef } from 'react'
import { Box, Paper, IconButton, Tooltip, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import FunctionsIcon from '@mui/icons-material/Functions'
import CodeIcon from '@mui/icons-material/Code'
import BlockRenderer from './BlockRenderer'

interface WhiteboardBlock {
  id: string
  block_type: string
  content: string
  position: number
  created_by: 'student' | 'ai'
  ai_metadata?: string | null
  version: number
}

interface Props {
  blocks: WhiteboardBlock[]
  onAddBlock: (blockType: string, content: any, position?: number) => Promise<any>
  onUpdateBlock: (id: string, content: any) => Promise<void>
  onDeleteBlock: (id: string) => Promise<void>
  mode: 'study' | 'homework'
}

export default function Whiteboard({ blocks, onAddBlock, onUpdateBlock, onDeleteBlock, mode }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)

  const addParagraph = useCallback(async () => { await onAddBlock('paragraph', { text: '' }) }, [onAddBlock])
  const addMath = useCallback(async () => { await onAddBlock('mathBlock', { latex: 'x = \\\\frac{-b \\\\pm \\\\sqrt{b^2 - 4ac}}{2a}' }) }, [onAddBlock])
  const addCode = useCallback(async () => { await onAddBlock('codeBlock', { language: 'python', code: '# 写代码...' }) }, [onAddBlock])

  return (
    <Box className="whiteboard-container" ref={editorRef}>
      {/* 工具栏 — Anthropic 细边 */}
      <Paper
        elevation={0}
        sx={{
          display: 'flex', gap: 0.5, px: 1, py: 0.5, mb: 2.5,
          border: '0.5px solid', borderColor: 'divider',
          borderRadius: 2, bgcolor: '#ffffff',
          position: 'sticky', top: 8, zIndex: 10,
        }}
      >
        <Tooltip title="添加文本"><IconButton size="small" onClick={addParagraph}><AddIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
        <Tooltip title="添加数学公式"><IconButton size="small" onClick={addMath}><FunctionsIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
        <Tooltip title="添加代码块"><IconButton size="small" onClick={addCode}><CodeIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
      </Paper>

      {/* Block 列表 */}
      {blocks.length === 0 ? (
        <Box
          sx={{
            textAlign: 'center', py: 14,
            border: '1px dashed', borderColor: 'divider',
            borderRadius: 3, cursor: 'pointer',
          }}
          onClick={addParagraph}
        >
          <Typography variant="h4" sx={{ fontFamily: 'var(--font-display)', color: 'var(--muted)', mb: 1, fontSize: 24 }}>
            {mode === 'homework' ? '作业板' : '空白板'}
          </Typography>
          <Typography variant="body2" color="text.disabled">
            点击开始写内容，或使用上方工具栏
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
            按右侧聊天按钮与 AI 学伴对话
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {blocks.map((block) => (
            <BlockRenderer
              key={block.id}
              block={block}
              index={block.position}
              onUpdate={(content) => onUpdateBlock(block.id, content)}
              onDelete={() => onDeleteBlock(block.id)}
            />
          ))}
        </Box>
      )}

      <Box sx={{ height: 120 }} />
    </Box>
  )
}
