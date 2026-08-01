import React, { useEffect, useState } from 'react'
import {
  settingsApi,
  emailApi,
  type AIModel,
  type AIConfig,
  type EmailConfig,
  type EmailStatus
} from '../api/ipc'

type TabKey = 'ai' | 'email'


function Config(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabKey>('ai')

  const tabStyle = (key: TabKey): React.CSSProperties => ({
    padding: '8px 20px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: activeTab === key ? 600 : 400,
    background: activeTab === key ? '#4f46e5' : 'transparent',
    color: activeTab === key ? 'white' : '#6b7280',
    transition: 'all 0.15s'
  })

  return (
    <div>
      <div className="page-header">
        <h1>系统配置</h1>
        <p>管理 AI 模型和邮件插件</p>
      </div>

      {/* Tab Bar */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          background: '#f3f4f6',
          padding: 4,
          borderRadius: 8,
          marginBottom: 24,
          width: 'fit-content'
        }}
      >
        <button style={tabStyle('ai')} onClick={() => setActiveTab('ai')}>
          AI 配置
        </button>
        <button style={tabStyle('email')} onClick={() => setActiveTab('email')}>
          Email 插件
        </button>
      </div>

      {activeTab === 'ai' && <AITab />}
      {activeTab === 'email' && <EmailTab />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AI Config Tab
// ---------------------------------------------------------------------------

function AITab(): React.ReactElement {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [models, setModels] = useState<AIModel[]>([])
  const [modelSearch, setModelSearch] = useState('')
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null)
  const [selectedModelId, setSelectedModelId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [baseUrlAutoFilled, setBaseUrlAutoFilled] = useState(false)
  const [savingAI, setSavingAI] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)

  useEffect(() => { loadData() }, [])

  const loadData = async (): Promise<void> => {
    setLoading(true)
    try {
      const aiRes = await settingsApi.getAIConfig()
      if (aiRes.success && aiRes.data) {
        const cfg = aiRes.data as AIConfig
        setAiConfig(cfg)
        setSelectedModelId(cfg.modelId || '')
        setBaseUrl(cfg.baseUrl || '')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLoadModels = async (): Promise<void> => {
    setLoadingModels(true)
    try {
      const res = await settingsApi.getModels()
      if (res.success && Array.isArray(res.data)) {
        setModels(res.data as AIModel[])
      }
    } finally {
      setLoadingModels(false)
    }
  }

  const handleSaveAI = async (): Promise<void> => {
    setError('')
    setSuccess('')
    if (!apiKey.trim() && !aiConfig?.apiKey) {
      setError('请输入 API Key')
      return
    }
    const selected = models.find((m) => m.id === selectedModelId)
    const finalProvider = selected?.provider || 'openai'
    const finalModelName = selected?.name || selectedModelId
    const finalApiKey = apiKey.trim() || aiConfig?.apiKey || ''

    setSavingAI(true)
    try {
      const res = await settingsApi.saveAIConfig(
        finalProvider,
        selectedModelId,
        finalModelName,
        finalApiKey,
        baseUrl || undefined
      )
      if (res.success) {
        setSuccess('AI 配置已保存')
        setApiKey('')
        await loadData()
      } else {
        setError(res.error || '保存失败')
      }
    } finally {
      setSavingAI(false)
    }
  }


  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        加载中...
      </div>
    )
  }

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* AI Config Section */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>AI 模型配置</h3>

        {aiConfig?.modelId && (
          <div className="alert alert-success" style={{ marginBottom: 12 }}>
            当前模型：{aiConfig.modelId}
            {aiConfig.apiKeyMasked && ` · API Key: ${aiConfig.apiKeyMasked}`}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={handleLoadModels} disabled={loadingModels}>
            {loadingModels ? '拉取中...' : '从 models.dev 拉取模型列表'}
          </button>
        </div>

        {models.length > 0 && (
          <div className="form-group">
            <label>
              选择模型
              <span style={{ fontWeight: 400, color: '#888', marginLeft: 8, fontSize: 12 }}>
                共 {models.length} 个
              </span>
            </label>
            <input
              className="form-control"
              type="text"
              placeholder="搜索模型名称或提供商..."
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              style={{ marginBottom: 6 }}
            />
            {selectedModelId && (
              <div style={{ fontSize: 12, color: '#059669', marginBottom: 6 }}>
                已选：{models.find((m) => m.id === selectedModelId)?.name ?? selectedModelId}
              </div>
            )}
            <div style={{
              border: '1px solid #d1d5db',
              borderRadius: 6,
              maxHeight: 220,
              overflowY: 'auto',
              background: '#fff'
            }}>
              {models
                .filter((m) => {
                  const q = modelSearch.toLowerCase()
                  return !q || m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
                })
                .slice(0, 200)
                .map((m) => (
                  <div
                    key={m.id}
                    onClick={() => {
                      setSelectedModelId(m.id)
                      if (m.baseUrl) {
                        setBaseUrl(m.baseUrl)
                        setBaseUrlAutoFilled(true)
                      } else {
                        setBaseUrl('')
                        setBaseUrlAutoFilled(false)
                      }
                    }}
                    style={{
                      padding: '7px 12px',
                      cursor: 'pointer',
                      background: selectedModelId === m.id ? '#eff6ff' : 'transparent',
                      borderLeft: selectedModelId === m.id ? '3px solid #3b82f6' : '3px solid transparent',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 13,
                      borderBottom: '1px solid #f3f4f6'
                    }}
                  >
                    <span>
                      <span style={{ color: '#6b7280', fontSize: 11, marginRight: 6 }}>[{m.provider}]</span>
                      {m.name}
                    </span>
                    <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>
                      {m.supportsImages ? '👁 ' : ''}{m.supportsTools ? '🔧' : ''}
                    </span>
                  </div>
                ))}
              {models.filter((m) => {
                const q = modelSearch.toLowerCase()
                return !q || m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
              }).length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                  无匹配结果
                </div>
              )}
            </div>
          </div>
        )}

        <div className="form-group">
          <label>API Key {aiConfig?.apiKeyMasked && `（当前: ${aiConfig.apiKeyMasked}，留空不修改）`}</label>
          <input
            className="form-control"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
          />
        </div>

        <div className="form-group">
          <label>
            Base URL
            {baseUrlAutoFilled && (
              <span style={{ fontWeight: 400, color: '#059669', marginLeft: 6, fontSize: 11 }}>
                自动填充自 models.dev
              </span>
            )}
            {!baseUrlAutoFilled && (
              <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6, fontSize: 11 }}>
                可选，默认 OpenAI
              </span>
            )}
          </label>
          <input
            className="form-control"
            type="text"
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value)
              setBaseUrlAutoFilled(false)
            }}
            placeholder="https://api.openai.com/v1"
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={handleSaveAI}
          disabled={savingAI || !selectedModelId}
        >
          {savingAI ? '保存中...' : '保存 AI 配置'}
        </button>
      </div>

    </div>
  )
}

// ---------------------------------------------------------------------------
// Email Tab
// ---------------------------------------------------------------------------

function EmailTab(): React.ReactElement {
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null)
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [togglingPoll, setTogglingPoll] = useState(false)

  // Form state
  const [email, setEmail] = useState('')
  const [authCode, setAuthCode] = useState('')
  const [imapHost, setImapHost] = useState('')
  const [imapPort, setImapPort] = useState(993)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async (): Promise<void> => {
    setLoading(true)
    try {
      const [cfgRes, statusRes] = await Promise.all([
        settingsApi.getEmailConfig(),
        emailApi.getStatus()
      ])
      if (cfgRes.success && cfgRes.data) {
        const cfg = cfgRes.data as EmailConfig
        setEmailConfig(cfg)
        if (cfg.configured) {
          setEmail(cfg.email || '')
          setImapHost(cfg.imapHost || '')
          setImapPort(cfg.imapPort || 993)
        }
      }
      if (statusRes.success && statusRes.data) {
        const st = statusRes.data as EmailStatus
        setEmailStatus(st)
        setEnabled(st.polling)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!email.trim() || !authCode.trim() || !imapHost.trim()) {
      setError('请填写完整的邮件配置')
      return
    }
    setSaving(true)
    try {
      const res = await settingsApi.saveEmailConfig(email.trim(), authCode.trim(), imapHost.trim(), imapPort)
      if (res.success) {
        setSuccess('邮件配置已保存')
        setAuthCode('')
        await loadData()
      } else {
        setError(res.error || '保存失败')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async (): Promise<void> => {
    setError('')
    setSuccess('')
    setTesting(true)
    try {
      const res = await settingsApi.testEmailConnection()
      if (res.success) {
        setSuccess('连接测试成功！')
      } else {
        setError(res.error || '连接失败')
      }
    } finally {
      setTesting(false)
    }
  }

  const handleTogglePolling = async (): Promise<void> => {
    setError('')
    setTogglingPoll(true)
    try {
      const res = enabled ? await emailApi.stopPolling() : await emailApi.startPolling()
      if (res.success) {
        setEnabled(!enabled)
        await loadData()
      } else {
        setError(res.error || '操作失败')
      }
    } finally {
      setTogglingPoll(false)
    }
  }

  const COMMON_IMAP_HOSTS: Record<string, { host: string; port: number }> = {
    'gmail.com': { host: 'imap.gmail.com', port: 993 },
    'qq.com': { host: 'imap.qq.com', port: 993 },
    '163.com': { host: 'imap.163.com', port: 993 },
    '126.com': { host: 'imap.126.com', port: 993 },
    'outlook.com': { host: 'outlook.office365.com', port: 993 },
    'hotmail.com': { host: 'outlook.office365.com', port: 993 }
  }

  const handleEmailChange = (val: string): void => {
    setEmail(val)
    const domain = val.split('@')[1]?.toLowerCase()
    if (domain && COMMON_IMAP_HOSTS[domain]) {
      setImapHost(COMMON_IMAP_HOSTS[domain].host)
      setImapPort(COMMON_IMAP_HOSTS[domain].port)
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        加载中...
      </div>
    )
  }

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Current Status */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>邮件轮询状态</h3>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              {emailStatus?.polling ? (
                <span style={{ color: '#10b981' }}>正在轮询（每5分钟检查一次新邮件）</span>
              ) : (
                <span style={{ color: '#9ca3af' }}>已停止</span>
              )}
            </div>
            {emailStatus?.lastCheck && (
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                上次检查：{new Date(emailStatus.lastCheck).toLocaleString('zh-CN')}
              </div>
            )}
            {emailStatus?.error && (
              <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>
                最近错误：{emailStatus.error}
              </div>
            )}
          </div>

          {emailConfig?.configured && (
            <button
              className={`btn ${enabled ? 'btn-danger' : 'btn-primary'}`}
              onClick={handleTogglePolling}
              disabled={togglingPoll}
            >
              {togglingPoll ? '操作中...' : enabled ? '停止轮询' : '启动轮询'}
            </button>
          )}
        </div>
      </div>

      {/* Config Form */}
      <div className="card">
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
          邮箱配置
          {emailConfig?.configured && (
            <span className="badge badge-green" style={{ marginLeft: 8, fontSize: 11 }}>
              已配置
            </span>
          )}
        </h3>

        {emailConfig?.configured && (
          <div style={{ marginBottom: 16, fontSize: 13, color: '#6b7280' }}>
            当前邮箱：{emailConfig.email} · IMAP：{emailConfig.imapHost}:{emailConfig.imapPort}
          </div>
        )}

        <form onSubmit={handleSave}>
          <div className="form-group">
            <label>邮箱地址</label>
            <input
              className="form-control"
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              placeholder="your@email.com"
            />
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              支持自动填充 IMAP：Gmail、QQ邮箱、163、Outlook
            </div>
          </div>

          <div className="form-group">
            <label>授权码 / 密码 {emailConfig?.configured && '（留空不修改）'}</label>
            <input
              className="form-control"
              type="password"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              placeholder="邮箱授权码（非登录密码）"
            />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>IMAP 服务器</label>
              <input
                className="form-control"
                type="text"
                value={imapHost}
                onChange={(e) => setImapHost(e.target.value)}
                placeholder="imap.example.com"
              />
            </div>
            <div className="form-group" style={{ flex: '0 0 100px', marginBottom: 0 }}>
              <label>端口</label>
              <input
                className="form-control"
                type="number"
                value={imapPort}
                onChange={(e) => setImapPort(Number(e.target.value))}
                placeholder="993"
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '保存中...' : '保存配置'}
            </button>
            {emailConfig?.configured && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleTest}
                disabled={testing}
              >
                {testing ? '测试中...' : '测试连接'}
              </button>
            )}
          </div>
        </form>
      </div>

      <div
        style={{
          marginTop: 16,
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 8,
          padding: '12px 16px',
          fontSize: 13,
          color: '#1d4ed8'
        }}
      >
        <strong>说明：</strong>开启邮件轮询后，系统每5分钟自动检查新邮件。邮件中的附件会被自动保存到 Workspace，并注册为学习资源，Agent 将收到通知并生成资源简报。
      </div>
    </div>
  )
}

export default Config
