import { useState, useEffect } from 'react'
import { Box, Typography, TextField, Button, Card, CardContent, Select, MenuItem, FormControl, InputLabel, Alert } from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import { settingsApi } from '../../api/http'
import Sidebar from '../../components/shared/Sidebar'
import type { User } from '../../context/UserContext'

export default function Settings({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [provider, setProvider] = useState('minimax')
  const [modelId, setModelId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    settingsApi.getAI().then(res => {
      if (res.success?.data) { setProvider(res.data.provider || 'minimax'); setModelId(res.data.modelId || ''); setBaseUrl(res.data.baseUrl || '') }
    })
  }, [])

  async function handleSave() {
    if (!modelId || !apiKey) { setStatus('请填写 Model ID 和 API Key'); return }
    const res = await settingsApi.saveAI(provider, modelId, modelId, apiKey, baseUrl || undefined)
    setStatus(res.success ? 'AI 配置已保存' : '保存失败：' + (res.error || '未知'))
    if (res.success) setApiKey('')
    setTimeout(() => setStatus(''), 3000)
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', bgcolor: 'var(--canvas)' }}>
      <Sidebar role="guardian" onLogout={onLogout} />
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Box sx={{ maxWidth: 600, mx: 'auto', p: 4 }}>
          <Typography variant="h4" sx={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--ink)', mb: 1 }}>系统设置</Typography>
          <Typography variant="body2" color="var(--muted)" sx={{ mb: 3 }}>配置 AI 服务商。支持 MiniMax / OpenAI / Anthropic / DeepSeek 及任何兼容接口。</Typography>
          {status && <Alert severity={status.includes('成功') ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setStatus('')}>{status}</Alert>}
          <Card>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel>提供商</InputLabel>
                <Select value={provider} label="提供商" onChange={e => setProvider(e.target.value)}>
                  <MenuItem value="minimax">MiniMax</MenuItem>
                  <MenuItem value="openai">OpenAI</MenuItem>
                  <MenuItem value="anthropic">Anthropic</MenuItem>
                  <MenuItem value="deepseek">DeepSeek</MenuItem>
                  <MenuItem value="custom">自定义</MenuItem>
                </Select>
              </FormControl>
              <TextField fullWidth size="small" label="Model ID" value={modelId} onChange={e => setModelId(e.target.value)} placeholder="gpt-4o / claude-sonnet / deepseek-chat" />
              <TextField fullWidth size="small" label="API Key" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." />
              <TextField fullWidth size="small" label="Base URL（可选）" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
              <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave}>保存配置</Button>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  )
}
