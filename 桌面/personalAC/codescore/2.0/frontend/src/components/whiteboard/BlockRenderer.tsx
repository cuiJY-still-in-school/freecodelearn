import React, { useState, useEffect } from 'react'
import { Box, TextField, IconButton, Typography } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import CheckIcon from '@mui/icons-material/Check'
import SmartToyIcon from '@mui/icons-material/SmartToy'

interface Block {
  id: string; block_type: string; content: string
  created_by: 'student' | 'ai'; ai_metadata?: string | null
}

export default function BlockRenderer({ block, index, onUpdate, onDelete }: {
  block: Block; index: number; onUpdate: (c: any) => void; onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const content = JSON.parse(block.content || '{}')

  useEffect(() => { setText(content.text || content.latex || content.code || '') }, [block.content])

  function handleSave() {
    if (block.block_type === 'mathBlock') onUpdate({ latex: text })
    else if (block.block_type === 'codeBlock') onUpdate({ ...content, code: text })
    else onUpdate({ text })
    setEditing(false)
  }

  const isAI = block.created_by === 'ai'
  const isMath = block.block_type === 'mathBlock'
  const isCode = block.block_type === 'codeBlock'

  // AI card 包裹
  const inner = (
    <Box
      sx={{
        p: 1.5, borderRadius: 2, position: 'relative',
        border: isAI ? 'none' : '0.5px solid',
        borderColor: 'divider', bgcolor: isAI ? 'transparent' : '#ffffff',
        '&:hover .block-actions': { opacity: 1 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        {isMath && <Typography variant="caption" color="primary.main" fontWeight={500}>公式</Typography>}
        {isCode && <Typography variant="caption" sx={{ color: 'var(--accent-teal)' }} fontWeight={500}>代码</Typography>}
        {isAI && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <SmartToyIcon sx={{ fontSize: 13, color: 'primary.main' }} />
            <Typography variant="caption" color="primary.main" fontWeight={500}>学伴</Typography>
          </Box>
        )}
      </Box>

      {editing ? (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField fullWidth multiline size="small" value={text} onChange={e => setText(e.target.value)} autoFocus
            placeholder={isMath ? 'LaTeX 公式...' : isCode ? '代码...' : '写点什么...'}
          />
          <IconButton size="small" onClick={handleSave} color="primary"><CheckIcon fontSize="small" /></IconButton>
        </Box>
      ) : isMath ? (
        <Box onClick={() => setEditing(true)} sx={{ cursor: 'pointer', p: 1.5, bgcolor: '#faf9f5', borderRadius: 1, fontFamily: 'var(--font-mono)', fontSize: 14, overflow: 'auto', minHeight: 36 }}>
          {content.latex || '点击编辑公式'}
        </Box>
      ) : isCode ? (
        <Box onClick={() => setEditing(true)} sx={{ cursor: 'pointer', p: 1.5, bgcolor: '#1a1a18', color: '#e8e6dc', borderRadius: 1, fontFamily: 'var(--font-mono)', fontSize: 13, whiteSpace: 'pre-wrap', overflow: 'auto' }}>
          {content.code || '点击编辑代码'}
        </Box>
      ) : (
        <Box onClick={() => setEditing(true)} sx={{ cursor: 'pointer', minHeight: 24, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: content.text ? 'text.primary' : 'text.disabled', lineHeight: 1.6 }}>
          {content.text || '点击编辑...'}
        </Box>
      )}

      <Box className="block-actions" sx={{ position: 'absolute', top: 6, right: 6, opacity: 0, transition: 'opacity 0.15s', display: 'flex', gap: 0.5 }}>
        <IconButton size="small" onClick={onDelete} sx={{ color: 'var(--muted-soft)', '&:hover': { color: 'var(--error)' } }}>
          <DeleteIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </Box>
    </Box>
  )

  if (isAI) return <Box className="ai-card">{inner}</Box>
  return inner
}
