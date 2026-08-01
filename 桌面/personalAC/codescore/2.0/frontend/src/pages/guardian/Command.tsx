import { useState, useEffect } from 'react'
import { Box, AppBar, Toolbar, Typography, IconButton, TextField, Button, Card, CardContent, Chip, Alert, Select, MenuItem, FormControl, InputLabel } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import LogoutIcon from '@mui/icons-material/Logout'
import SendIcon from '@mui/icons-material/Send'
import DeleteIcon from '@mui/icons-material/Delete'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { guardianApi, authApi } from '../../api/http'
import type { User } from '../../context/UserContext'

export default function Command({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [students, setStudents] = useState<any[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState(searchParams.get('studentId') || '')
  const [instruction, setInstruction] = useState('')
  const [priority, setPriority] = useState('normal')
  const [commands, setCommands] = useState<any[]>([])
  const [status, setStatus] = useState('')

  useEffect(() => {
    authApi.students().then(res => {
      if (res.success) {
        setStudents(res.data || [])
        if (!selectedStudentId && res.data?.length > 0) {
          setSelectedStudentId(res.data[0].id)
        }
      }
    })
    loadCommands()
  }, [])

  async function loadCommands() {
    const res = await guardianApi.commands()
    if (res.success) setCommands(res.data || [])
  }

  async function handleSend() {
    if (!selectedStudentId || !instruction.trim()) {
      setStatus('请选择学生并输入指令')
      return
    }
    setStatus('')
    const res = await guardianApi.createCommand(selectedStudentId, instruction.trim(), priority)
    if (res.success) {
      setInstruction('')
      setStatus('指令已发送！AI 学伴会在合适时机执行')
      loadCommands()
    } else {
      setStatus('发送失败：' + (res.error || '未知错误'))
    }
  }

  async function handleDelete(id: string) {
    await guardianApi.deleteCommand(id)
    loadCommands()
  }

  const selectedStudent = students.find(s => s.id === selectedStudentId)
  const urgencyColors: Record<string, 'error' | 'warning' | 'info'> = { high: 'error', normal: 'warning', low: 'info' }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar>
          <IconButton edge="start" onClick={() => navigate('/guardian')} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" fontWeight={600} sx={{ flexGrow: 1 }}>
            AI 指令中心
          </Typography>
          <IconButton onClick={onLogout}><LogoutIcon /></IconButton>
        </Toolbar>
      </AppBar>

      <Box sx={{ maxWidth: 700, mx: 'auto', p: 3 }}>
        <Typography variant="h5" fontWeight={600} gutterBottom>告诉 AI 做什么</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          家长指令会注入学伴的系统提示，AI 会在与学生学习时自动执行。你可以随时添加或撤销指令。
        </Typography>

        {status && <Alert severity={status.includes('成功') ? 'success' : 'info'} sx={{ mb: 2 }}>{status}</Alert>}

        {/* 输入区域 */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>目标学生</InputLabel>
              <Select value={selectedStudentId} label="目标学生" onChange={e => setSelectedStudentId(e.target.value)}>
                {students.map((s: any) => (
                  <MenuItem key={s.id} value={s.id}>{s.display_name || s.id}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              fullWidth
              multiline
              rows={3}
              placeholder="例如：接下来一周帮小明重点复习数学导数章节，每天出一道综合题…"
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              sx={{ mb: 2 }}
            />

            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between' }}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>优先级</InputLabel>
                <Select value={priority} label="优先级" onChange={e => setPriority(e.target.value)}>
                  <MenuItem value="high">高优先</MenuItem>
                  <MenuItem value="normal">普通</MenuItem>
                  <MenuItem value="low">低优先</MenuItem>
                </Select>
              </FormControl>
              <Button variant="contained" endIcon={<SendIcon />} onClick={handleSend}>
                发送指令
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* 活跃指令 */}
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
          活跃指令 ({commands.length})
        </Typography>
        {commands.length === 0 ? (
          <Card variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">暂无活跃指令</Typography>
          </Card>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {commands.map((cmd: any) => (
              <Card key={cmd.id} variant="outlined">
                <CardContent sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2">{cmd.instruction}</Typography>
                    <Box sx={{ mt: 0.5, display: 'flex', gap: 1 }}>
                      <Chip label={cmd.priority} color={urgencyColors[cmd.priority]} size="small" />
                      {cmd.acknowledged ? <Chip label="AI 已接收" color="success" size="small" variant="outlined" /> : <Chip label="等待 AI 处理" size="small" variant="outlined" />}
                      <Chip label={`执行 ${cmd.executed_count} 次`} size="small" variant="outlined" />
                    </Box>
                  </Box>
                  <IconButton size="small" color="error" onClick={() => handleDelete(cmd.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}
