import { useState, useEffect } from 'react'
import { Box, Typography, TextField, Button, Card, CardContent, Avatar, Alert, Chip } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { authApi } from '../../api/http'
import Sidebar from '../../components/shared/Sidebar'
import type { User } from '../../context/UserContext'

export default function Students({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [students, setStudents] = useState<any[]>([])
  const [name, setName] = useState('')
  const [grade, setGrade] = useState('')
  const [status, setStatus] = useState('')

  async function load() { const res = await authApi.students(); if (res.success) setStudents(res.data || []) }
  useEffect(() => { load() }, [])

  async function handleCreate() {
    if (!name.trim()) { setStatus('请输入学生姓名'); return }
    const res = await authApi.createStudent(name.trim(), grade || undefined)
    if (res.success) { setName(''); setGrade(''); setStatus(`学生 ${name} 创建成功！令牌：${res.data.sync_token?.slice(0, 10)}...`); load() }
    else setStatus('失败：' + (res.error || '未知'))
    setTimeout(() => setStatus(''), 4000)
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', bgcolor: 'var(--canvas)' }}>
      <Sidebar role="guardian" onLogout={onLogout} />
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Box sx={{ maxWidth: 600, mx: 'auto', p: 4 }}>
          <Typography variant="h4" sx={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--ink)', mb: 1 }}>学生管理</Typography>
          <Typography variant="body2" color="var(--muted)" sx={{ mb: 3 }}>创建和管理学生账户。每个学生有独立的白板和学伴。</Typography>
          {status && <Alert severity={status.includes('成功') ? 'success' : 'info'} sx={{ mb: 2 }} onClose={() => setStatus('')}>{status}</Alert>}

          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>添加学生</Typography>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <TextField size="small" label="学生姓名" value={name} onChange={e => setName(e.target.value)} sx={{ flex: 1, minWidth: 150 }} />
                <TextField size="small" label="年级" value={grade} onChange={e => setGrade(e.target.value)} placeholder="高二" sx={{ width: 100 }} />
                <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate} sx={{ height: 40 }}>添加</Button>
              </Box>
            </CardContent>
          </Card>

          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>
            已有学生 ({students.length})
          </Typography>
          {students.length === 0 ? (
            <Card variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="var(--muted-soft)">暂无学生</Typography>
            </Card>
          ) : students.map((s: any) => (
            <Card key={s.id} variant="outlined" sx={{ mb: 1.5 }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar sx={{ bgcolor: 'var(--primary)', width: 36, height: 36, fontSize: 15 }}>{s.display_name?.[0] || '?'}</Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography fontWeight={500} fontSize={14}>{s.display_name}</Typography>
                  <Typography variant="body2" color="var(--muted-soft)" sx={{ fontSize: 12 }}>{s.student_grade || '未设年级'}</Typography>
                </Box>
                <Chip label={`令牌 ${s.sync_token?.slice(0, 8)}…`} size="small" variant="outlined" sx={{ fontFamily: 'var(--font-mono)', fontSize: 11 }} />
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>
    </Box>
  )
}
