import { useState, useEffect } from 'react'
import { Box, Typography, Card, CardContent, Chip, Button, TextField, Select, MenuItem, FormControl, Alert, Avatar, CircularProgress, IconButton, Divider } from '@mui/material'
import LogoutIcon from '@mui/icons-material/Logout'
import SendIcon from '@mui/icons-material/Send'
import DeleteIcon from '@mui/icons-material/Delete'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import { guardianApi, authApi, settingsApi } from '../../api/http'
import Sidebar from '../../components/shared/Sidebar'
import type { User } from '../../context/UserContext'

export default function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [students, setStudents] = useState<any[]>([])
  const [selectedSid, setSelectedSid] = useState('')
  const [overview, setOverview] = useState<any>(null)
  const [commands, setCommands] = useState<any[]>([])
  const [instruction, setInstruction] = useState('')
  const [priority, setPriority] = useState('normal')
  const [status, setStatus] = useState('')
  const [loadOv, setLoadOv] = useState(false)

  useEffect(() => {
    authApi.students().then(res => {
      if (res.success?.data) { setStudents(res.data); if (res.data[0]) setSelectedSid(res.data[0].id) }
    })
    loadCommands()
  }, [])

  useEffect(() => {
    if (!selectedSid) return
    setLoadOv(true)
    guardianApi.overview(selectedSid).then(res => { if (res.success) setOverview(res.data); setLoadOv(false) })
  }, [selectedSid])

  async function loadCommands() { const res = await guardianApi.commands(); if (res.success) setCommands(res.data || []) }

  async function handleSend() {
    if (!selectedSid || !instruction.trim()) return
    const res = await guardianApi.createCommand(selectedSid, instruction.trim(), priority)
    if (res.success) { setInstruction(''); setStatus('指令已发送'); loadCommands() }
    else setStatus('失败：' + (res.error || '未知'))
    setTimeout(() => setStatus(''), 3000)
  }

  async function handleDeleteCmd(id: string) { await guardianApi.deleteCommand(id); loadCommands() }

  const urgencyColors: Record<string, 'error' | 'warning' | 'success' | 'default'> = { urgent: 'error', attention: 'warning', normal: 'success', idle: 'default' }
  const selectedStudent = students.find(s => s.id === selectedSid)

  return (
    <Box sx={{ height: '100vh', display: 'flex', bgcolor: 'var(--canvas)' }}>
      <Sidebar role="guardian" onLogout={onLogout} />

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Box sx={{ maxWidth: 1000, mx: 'auto', p: 4 }}>
          {/* Header */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="h4" sx={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--ink)', mb: 0.5 }}>
              {user.display_name || '家长'}，下午好
            </Typography>
            <Typography variant="body2" color="var(--muted)">管理学生的学习，直接告诉 AI 你的期望</Typography>
          </Box>

          {status && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setStatus('')}>{status}</Alert>}

          {/* 学生选择 */}
          {students.length === 0 ? (
            <Card sx={{ mb: 3, textAlign: 'center', py: 3 }}>
              <Typography color="var(--muted)">暂无学生账户，请先创建</Typography>
            </Card>
          ) : (
            <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
              {students.map((s: any) => (
                <Card
                  key={s.id}
                  onClick={() => setSelectedSid(s.id)}
                  sx={{
                    cursor: 'pointer', minWidth: 160,
                    border: selectedSid === s.id ? '1.5px solid var(--primary)' : '0.5px solid var(--hairline)',
                    bgcolor: selectedSid === s.id ? 'var(--surface-soft)' : '#ffffff',
                    transition: 'all 0.15s',
                  }}
                >
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Avatar sx={{ bgcolor: 'var(--primary)', width: 32, height: 32, fontSize: 14 }}>{s.display_name?.[0] || '?'}</Avatar>
                    <Box>
                      <Typography fontWeight={500} fontSize={14}>{s.display_name || s.id}</Typography>
                      <Typography variant="caption" color="var(--muted-soft)">{s.student_grade || '未设年级'}</Typography>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}

          {/* 主体两栏 */}
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {/* 学习概览 */}
            <Box sx={{ flex: 1, minWidth: 300 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>学习概览</Typography>

              {loadOv ? <CircularProgress size={24} /> : overview ? (
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
                      <Typography variant="h6" fontWeight={500} fontSize={16}>{selectedStudent?.display_name}</Typography>
                      <Chip label={overview.urgency?.level || 'normal'} color={urgencyColors[overview.urgency?.level]} size="small" />
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                      <StatBox label="总记录" value={overview.totalRecords || 0} />
                      <StatBox label="白板块" value={overview.boardBlocks || 0} />
                      <StatBox label="上次活跃" value={overview.lastActiveAt ? new Date(overview.lastActiveAt).toLocaleDateString('zh-CN') : '—'} />
                      <StatBox label="活跃指令" value={overview.activeCommands?.length || 0} />
                    </Box>

                    {overview.weakPoints?.length > 0 && (
                      <Box sx={{ mt: 2.5 }}>
                        <Typography variant="caption" color="var(--muted)" fontWeight={500} sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 10 }}>薄弱点</Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                          {overview.weakPoints.map((kp: any, i: number) => (
                            <Chip key={i} label={`${kp.topic} ${Math.round(kp.confidence * 100)}%`} size="small" variant="outlined"
                              sx={{ borderColor: 'var(--warning)', color: 'var(--warning)', fontSize: 11 }} />
                          ))}
                        </Box>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              ) : <Card><CardContent><Typography color="var(--muted-soft)">选择学生查看</Typography></CardContent></Card>}
            </Box>

            {/* 指令中心 */}
            <Box sx={{ flex: 1, minWidth: 300 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>AI 指令</Typography>

              <Card sx={{ mb: 2.5 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <SmartToyIcon sx={{ color: 'var(--primary)', fontSize: 18 }} />
                    <Typography variant="subtitle2" fontWeight={500} fontSize={13}>告诉 AI 学伴做什么</Typography>
                  </Box>
                  <TextField fullWidth size="small" multiline rows={2}
                    placeholder="帮孩子复习数学导数章节，每天出一道综合题…"
                    value={instruction} onChange={e => setInstruction(e.target.value)}
                  />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1.5 }}>
                    <FormControl size="small" sx={{ minWidth: 100 }}>
                      <Select value={priority} onChange={e => setPriority(e.target.value)}>
                        <MenuItem value="high">高优先</MenuItem>
                        <MenuItem value="normal">普通</MenuItem>
                        <MenuItem value="low">低优先</MenuItem>
                      </Select>
                    </FormControl>
                    <Button variant="contained" size="small" endIcon={<SendIcon />} onClick={handleSend} disabled={!instruction.trim()}>发送</Button>
                  </Box>
                </CardContent>
              </Card>

              {/* 活跃指令列表 */}
              {commands.length === 0 ? (
                <Typography variant="body2" color="var(--muted-soft)" sx={{ fontSize: 13 }}>暂无活跃指令</Typography>
              ) : commands.map((cmd: any) => (
                <Card key={cmd.id} variant="outlined" sx={{ mb: 1 }}>
                  <CardContent sx={{ display: 'flex', gap: 1.5, py: 1.5, '&:last-child': { pb: 1.5 }, alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" sx={{ fontSize: 13 }}>{cmd.instruction}</Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                        <Chip label={cmd.priority} size="small" sx={{ fontSize: 10, height: 20,
                          bgcolor: cmd.priority === 'high' ? '#fcf0ef' : 'var(--surface-soft)',
                          color: cmd.priority === 'high' ? 'var(--error)' : 'var(--muted)',
                        }} />
                        {cmd.acknowledged ? <Chip label="AI 已接收" size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} /> : null}
                        {cmd.executed_count > 0 ? <Chip label={`执行 ${cmd.executed_count} 次`} size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} /> : null}
                      </Box>
                    </Box>
                    <IconButton size="small" onClick={() => handleDeleteCmd(cmd.id)}><DeleteIcon sx={{ fontSize: 15 }} /></IconButton>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

function StatBox({ label, value }: { label: string; value: any }) {
  return (
    <Box>
      <Typography variant="caption" color="var(--muted-soft)" sx={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Typography>
      <Typography variant="h6" fontWeight={500} sx={{ fontSize: 20, color: 'var(--ink)' }}>{value}</Typography>
    </Box>
  )
}
