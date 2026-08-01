import React, { useEffect, useState } from 'react'
import {
  settingsApi,
  type AIModel,
  type AIConfig,
} from '../api/http'
import { useToast } from '../context/ToastContext'

type TabKey = 'ai' | 'search' | 'wolfram' | 'vision' | 'backup'

function Config(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabKey>('ai')

  return (
    <div className="page-enter">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.035em', color: 'var(--text)', marginBottom: 4 }}>系统配置</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>配置 AI 模型与扩展服务</p>
        </div>
      </div>

      <div className="tab-bar" style={{ marginBottom: 24 }}>
        {(['ai', 'search', 'wolfram', 'vision', 'backup'] as TabKey[]).map(key => {
          const labels: Record<TabKey, string> = { ai: 'AI 配置', search: '网络搜索', wolfram: 'WolframAlpha', vision: '视觉模型', backup: '数据备份' }
          return (
            <button
              key={key}
              className={`tab-item${activeTab === key ? ' active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {labels[key]}
            </button>
          )
        })}
      </div>

      {activeTab === 'ai' && <AITab />}
      {activeTab === 'search' && <SearchTab />}
      {activeTab === 'wolfram' && <WolframTab />}
      {activeTab === 'vision' && <VisionTab />}
      {activeTab === 'backup' && <BackupTab />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AI Config Tab
// ---------------------------------------------------------------------------

function AITab(): React.ReactElement {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)

  const [models, setModels] = useState<AIModel[]>([])
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null)
  const [selectedModelId, setSelectedModelId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [])

  const loadData = async (): Promise<void> => {
    setLoading(true)
    try {
      const [aiRes, modelsRes] = await Promise.all([
        settingsApi.getAIConfig(),
        settingsApi.getModels()
      ])
      if (aiRes.success && aiRes.data) {
        const cfg = aiRes.data as AIConfig
        setAiConfig(cfg)
        setSelectedModelId(cfg.modelId || '')
      }
      if (modelsRes.success && Array.isArray(modelsRes.data)) {
        setModels(modelsRes.data as AIModel[])
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!selectedModelId) { toast('请选择模型', 'error'); return }
    const selected = models.find(m => m.id === selectedModelId)
    const finalProvider = selected?.provider || 'MiniMax'
    const finalModelName = selected?.name || selectedModelId
    const finalApiKey = apiKey.trim() || aiConfig?.apiKey || ''
    const finalBaseUrl = selected?.baseUrl || 'https://api.minimaxi.com/v1'
    setSaving(true)
    try {
      const res = await settingsApi.saveAIConfig(finalProvider, selectedModelId, finalModelName, finalApiKey, finalBaseUrl)
      if (res.success) {
        toast('AI 配置已保存')
        setApiKey('')
        await loadData()
      } else {
        toast(res.error || '保存失败', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="skeleton" style={{ height: 80, borderRadius: 10 }} />

  const selectedModel = models.find(m => m.id === selectedModelId)

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: 'var(--text)' }}>MiniMax 模型选择</h3>

        {aiConfig?.modelId && (
          <div style={{ marginBottom: 14, padding: '8px 12px', background: 'var(--primary-light)', borderRadius: 'var(--radius)', border: '1px solid var(--primary-ring)', fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)' }}>当前</span>
            <span style={{ fontWeight: 600, color: 'var(--primary)', margin: '0 6px' }}>
              {aiConfig.modelName || aiConfig.modelId}
            </span>
            {aiConfig.apiKeyMasked && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>· {aiConfig.apiKeyMasked}</span>}
          </div>
        )}

        <div className="form-group">
          <label>选择模型</label>
          <div style={{
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            overflow: 'hidden', background: 'var(--bg-card)'
          }}>
            {models.map((m, i) => {
              const isActive = selectedModelId === m.id
              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedModelId(m.id)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', fontSize: 13,
                    background: isActive ? 'var(--primary-light)' : 'transparent',
                    borderLeft: `3px solid ${isActive ? 'var(--primary)' : 'transparent'}`,
                    borderBottom: i < models.length - 1 ? '1px solid var(--border)' : 'none',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}
                >
                  <div>
                    <span style={{ color: isActive ? 'var(--primary)' : 'var(--text)', fontWeight: isActive ? 600 : 400 }}>
                      {m.name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                      {m.id}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
                    {m.contextLength && <span>{(m.contextLength / 1000).toFixed(0)}K ctx</span>}
                    {m.supportsImages && <span title="支持图片输入" style={{ color: 'var(--primary)' }}>图</span>}
                    {m.supportsTools && <span title="支持工具调用" style={{ color: 'var(--primary)' }}>工具</span>}
                  </div>
                </div>
              )
            })}
          </div>
          {selectedModel && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
              已选：{selectedModel.name}　上下文 {((selectedModel.contextLength || 0) / 1000).toFixed(0)}K tokens
            </div>
          )}
        </div>

        <div className="form-group">
          <label>
            API Key
            {aiConfig?.apiKeyMasked && (
              <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12, marginLeft: 6 }}>
                当前：{aiConfig.apiKeyMasked}，留空不修改
              </span>
            )}
          </label>
          <input
            className="form-control"
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="留空使用当前密钥"
          />
        </div>

        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !selectedModelId}>
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Search Tab
// ---------------------------------------------------------------------------

function SearchTab(): React.ReactElement {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(false)
  const [keyMasked, setKeyMasked] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch('/api/settings/serper', { headers: { 'x-sync-token': localStorage.getItem('syncToken') || '' } })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) { setConfigured(d.data.configured); setKeyMasked(d.data.keyMasked || '') }
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    if (!apiKey.trim()) { toast('请输入 API Key', 'error'); return }
    setSaving(true)
    const res = await fetch('/api/settings/serper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-token': localStorage.getItem('syncToken') || '' },
      body: JSON.stringify({ apiKey: apiKey.trim() })
    }).then(r => r.json())
    setSaving(false)
    if (res.success) { toast('Serper API Key 已保存'); setApiKey(''); setConfigured(true) }
    else toast(res.error || '保存失败', 'error')
  }

  if (loading) return <div className="skeleton" style={{ height: 80, borderRadius: 10 }} />

  return (
    <div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>
          AI 网络搜索
          {configured && <span className="badge badge-green" style={{ marginLeft: 8 }}>已配置</span>}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7 }}>
          配置后 AI 可主动调用 <code>web_search</code> 工具搜索题目解析、学科知识、资料等。<br/>
          未配置时自动使用中文维基百科（免费，但仅适合百科类查询）。
        </p>

        {configured && keyMasked && (
          <div style={{ marginBottom: 14, padding: '8px 12px', background: 'var(--primary-light)', borderRadius: 'var(--radius)', border: '1px solid var(--primary-ring)', fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)' }}>当前 Key：</span>
            <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{keyMasked}</span>
          </div>
        )}

        <div className="form-group">
          <label>Serper API Key{configured && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12, marginLeft: 6 }}>留空不修改</span>}</label>
          <input className="form-control" type="password" value={apiKey}
            onChange={e => setApiKey(e.target.value)} placeholder="your-serper-api-key" />
        </div>

        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !apiKey.trim()}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--text)' }}>获取 Serper API Key：</strong>
        前往 <span style={{ textDecoration: 'underline' }}>serper.dev</span> 注册，免费额度 2500 次/月，充值后无限使用。
        Serper 提供 Google 搜索质量的结果，特别适合中文学科查询。
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// WolframAlpha Tab
// ---------------------------------------------------------------------------

interface WolframConfig {
  configured: boolean
  appId?: string
  appIdMasked?: string
}

function WolframTab(): React.ReactElement {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<WolframConfig | null>(null)
  const [appId, setAppId] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => { loadData() }, [])

  const loadData = async (): Promise<void> => {
    setLoading(true)
    try {
      const res = await settingsApi.getWolframConfig()
      if (res.success && res.data) setConfig(res.data as WolframConfig)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!appId.trim()) { toast('请输入 App ID', 'error'); return }
    setSaving(true)
    try {
      const res = await settingsApi.saveWolframConfig(appId.trim())
      if (res.success) {
        toast('WolframAlpha 配置已保存')
        setAppId('')
        await loadData()
      } else {
        toast(res.error || '保存失败', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async (): Promise<void> => {
    const id = appId.trim() || config?.appId || ''
    if (!id) { toast('请先输入或保存 App ID', 'error'); return }
    setTesting(true)
    try {
      const res = await settingsApi.testWolframConfig(id)
      if (res.success) {
        const msg = (res.data as { message?: string })?.message || '连接成功'
        toast(msg)
      } else {
        toast(res.error || '测试失败', 'error')
      }
    } finally {
      setTesting(false)
    }
  }

  if (loading) return <div className="skeleton" style={{ height: 80, borderRadius: 10 }} />

  return (
    <div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>
          WolframAlpha 精确计算
          {config?.configured && <span className="badge badge-green" style={{ marginLeft: 8 }}>已配置</span>}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
          配置后 AI 可调用 <code>wolfram_query</code> 工具，获取数学计算、解方程、微积分、科学常量等的精确结果与解题步骤。
        </p>

        {config?.configured && config.appIdMasked && (
          <div style={{ marginBottom: 14, padding: '8px 12px', background: 'var(--primary-light)', borderRadius: 'var(--radius)', border: '1px solid var(--primary-ring)', fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)' }}>当前 App ID：</span>
            <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{config.appIdMasked}</span>
          </div>
        )}

        <div className="form-group">
          <label>
            App ID
            {config?.configured && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12, marginLeft: 6 }}>留空不修改</span>}
          </label>
          <input
            className="form-control"
            type="password"
            value={appId}
            onChange={e => setAppId(e.target.value)}
            placeholder="XXXXXX-XXXXXXXXXX"
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !appId.trim()}>
            {saving ? '保存中...' : '保存'}
          </button>
          {config?.configured && (
            <button className="btn btn-secondary" onClick={handleTest} disabled={testing}>
              {testing ? '测试中...' : '测试连接'}
            </button>
          )}
        </div>
      </div>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--text)' }}>获取 App ID：</strong>前往{' '}
        <span style={{ textDecoration: 'underline' }}>wolframalpha.com/api</span>{' '}
        注册免费开发者账户，每月可免费调用 2000 次。配置后支持：解方程、导数/积分、数列极限、化学式、物理常量、单位换算等。
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Backup Tab
// ---------------------------------------------------------------------------

interface BackupItem { filename: string; size: number; createdAt: number }

function BackupTab(): React.ReactElement {
  const { toast } = useToast()
  const tok = () => localStorage.getItem('syncToken') || ''
  const [backups, setBackups] = React.useState<BackupItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [backing, setBacking] = React.useState(false)

  React.useEffect(() => { loadBackups() }, [])

  async function loadBackups() {
    setLoading(true)
    try {
      const r = await fetch('/api/backup/list', { headers: { 'x-sync-token': tok() } })
      const d = await r.json()
      if (d.success) setBackups(d.data)
    } finally { setLoading(false) }
  }

  async function runBackup() {
    setBacking(true)
    try {
      const r = await fetch('/api/backup/now', { method: 'POST', headers: { 'x-sync-token': tok() } })
      const d = await r.json()
      if (d.success) { toast(`备份成功：${d.data.filename}`); setBackups(d.data.backups) }
      else toast(d.error || '备份失败', 'error')
    } finally { setBacking(false) }
  }

  function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  if (loading) return <div className="skeleton" style={{ height: 80, borderRadius: 10 }} />

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>数据库备份</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              自动每日凌晨 3:00 备份，保留最近 7 份。可手动下载备份文件。
            </p>
          </div>
          <button className="btn btn-primary" onClick={runBackup} disabled={backing} style={{ flexShrink: 0 }}>
            {backing ? '备份中...' : '立即备份'}
          </button>
        </div>

        {backups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            暂无备份文件
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            {backups.map((b, i) => (
              <div key={b.filename} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', fontSize: 13,
                borderBottom: i < backups.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div>
                  <div style={{ fontWeight: 500, color: 'var(--text)' }}>{b.filename}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {fmtSize(b.size)} · {new Date(b.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <a
                  href={`/api/backup/download/${b.filename}`}
                  download={b.filename}
                  onClick={e => { e.currentTarget.setAttribute('href', `/api/backup/download/${b.filename}`) }}
                  style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500, textDecoration: 'none' }}
                >
                  下载
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--text)' }}>备份说明：</strong>备份为 SQLite 数据库文件，包含所有学习记录、知识点、待办和配置。
        数据迁移时将备份文件放到新服务器 <code>data/</code> 目录即可。
      </div>
    </div>
  )
}

// ── 视觉模型（MiniCPM-V）────────────────────────────────────────────────────

function VisionTab(): React.ReactElement {
  const { toast } = useToast()
  const [apiKey, setApiKey]     = useState('')
  const [baseUrl, setBaseUrl]   = useState('http://localhost:11434/v1')
  const [model, setModel]       = useState('minicpm-v')
  const [enabled, setEnabled]   = useState(false)
  const [testing, setTesting]   = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)
  const tok = () => localStorage.getItem('syncToken') || ''

  useEffect(() => {
    fetch('/api/settings/vision', { headers: { 'x-sync-token': tok() } })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setApiKey(d.data.apiKeyMasked && d.data.apiKeyMasked !== '****' ? '' : '')
          setBaseUrl(d.data.baseUrl || 'http://localhost:11434/v1')
          setModel(d.data.model || 'minicpm-v')
          setEnabled(d.data.enabled ?? false)
        }
      })
  }, [])

  async function handleTest() {
    setTesting(true); setTestResult(null)
    try {
      // 用一张 1x1 白色 JPEG 的 base64 做连通性测试
      const tiny = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUEB'
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${tiny}` } },
            { type: 'text', text: '这是什么颜色？只回答颜色名。' }
          ] }],
          max_tokens: 20
        }),
        signal: AbortSignal.timeout(15000)
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        if (res.status === 404 && /model.*not.*found|not found/i.test(errText)) {
          setTestResult(`✗ 模型「${model}」未安装。请运行：ollama pull ${model}`)
        } else {
          setTestResult(`✗ HTTP ${res.status}：${errText.slice(0, 120) || '请求被拒绝'}`)
        }
        return
      }
      const d = await res.json()
      const text = d?.choices?.[0]?.message?.content
      if (text) setTestResult(`✓ 连通成功，模型回复：${text}`)
      else if (d?.error) setTestResult(`✗ ${d.error?.message ?? JSON.stringify(d.error)}`)
      else setTestResult(`✗ 模型无回复，请检查模型名称`)
    } catch (e) {
      const msg = (e as Error).message || ''
      if (/Failed to fetch|fetch failed|NetworkError|ECONNREFUSED/i.test(msg)) {
        setTestResult(`✗ 无法连接 ${baseUrl} —— 请先启动服务（Ollama：ollama serve）`)
      } else if (/timeout|AbortError/i.test(msg)) {
        setTestResult(`✗ 请求超时（15s）。模型可能正在加载，请稍后再试`)
      } else {
        setTestResult(`✗ 连接失败：${msg}`)
      }
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    const res = await fetch('/api/settings/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-token': tok() },
      body: JSON.stringify({ apiKey: apiKey || '', baseUrl, model, enabled })
    })
    const d = await res.json()
    setSaving(false)
    if (d.success) toast('视觉模型配置已保存')
    else toast(d.error || '保存失败', 'error')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid var(--border)',
    background: 'white', fontSize: 13, color: 'var(--text)', fontFamily: 'monospace', boxSizing: 'border-box'
  }

  return (
    <div style={{ maxWidth: 540 }}>
      <div className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>视觉模型（MiniCPM-V）</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
          上传图片时自动调用本地视觉模型识别内容，识别结果以文字形式追加给 AI，同时保留原始图片。
          AI 也可调用 <code>describe_image</code> 工具进行专项分析。
        </p>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>启用视觉模型</span>
        </label>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>
            Base URL（OpenAI 兼容接口）
          </label>
          <input style={inputStyle} value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
            placeholder="http://localhost:11434/v1" />
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Ollama 默认 <code>:11434/v1</code>；vllm 默认 <code>:8000/v1</code>
          </p>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>
            模型名称
          </label>
          <input style={inputStyle} value={model} onChange={e => setModel(e.target.value)}
            placeholder="minicpm-v" />
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Ollama：<code>ollama pull minicpm-v</code> 后填 <code>minicpm-v</code>
          </p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>
            API Key（本地部署可留空）
          </label>
          <input style={inputStyle} type="password" value={apiKey}
            onChange={e => setApiKey(e.target.value)} placeholder="本地部署无需填写" />
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleTest} disabled={testing}>
            {testing ? '测试中…' : '连通测试'}
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
          {testResult && (
            <span style={{ fontSize: 12, color: testResult.startsWith('✓') ? '#22C55E' : 'var(--error)' }}>
              {testResult}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default Config
