import React, { useEffect, useState } from 'react'
import { getAuth } from '../App'
import {
  botApi,
  settingsApi,
  emailApi,
  authApi,
  type BotConfig,
  type AIModel,
  type AIConfig,
  type EmailConfig,
  type EmailStatus,
  type SystemUser
} from '../api/ipc'

type TabKey = 'bot' | 'binding' | 'email'

function Config(): React.ReactElement {
  const auth = getAuth()
  const [activeTab, setActiveTab] = useState<TabKey>('bot')

  if (!auth.token || auth.role !== 'admin') {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-icon">🔒</div>
          <h3>权限不足</h3>
          <p>只有管理员可以访问系统配置</p>
        </div>
      </div>
    )
  }

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
        <p>管理 Bot、用户绑定和邮件插件</p>
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
        <button style={tabStyle('bot')} onClick={() => setActiveTab('bot')}>
          Bot 配置
        </button>
        <button style={tabStyle('binding')} onClick={() => setActiveTab('binding')}>
          身份映射
        </button>
        <button style={tabStyle('email')} onClick={() => setActiveTab('email')}>
          Email 插件
        </button>
      </div>

      {activeTab === 'bot' && <BotTab token={auth.token} />}
      {activeTab === 'binding' && <BindingTab token={auth.token} />}
      {activeTab === 'email' && <EmailTab token={auth.token} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bot Tab
// ---------------------------------------------------------------------------

function BotTab({ token }: { token: string }): React.ReactElement {
  const [bots, setBots] = useState<BotConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // AI Config
  const [models, setModels] = useState<AIModel[]>([])
  const [modelSearch, setModelSearch] = useState('')
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null)
  const [selectedModelId, setSelectedModelId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [savingAI, setSavingAI] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)

  // Bot install form
  const [botType, setBotType] = useState<string>('telegram')
  const [credential, setCredential] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async (): Promise<void> => {
    setLoading(true)
    try {
      const [botsRes, aiRes] = await Promise.all([
        botApi.listBots(token),
        settingsApi.getAIConfig()
      ])
      if (botsRes.success && Array.isArray(botsRes.data)) {
        setBots(botsRes.data as BotConfig[])
      }
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
        token,
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

  const handleInstallBot = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!credential.trim()) {
      setError('请输入 Bot 凭证')
      return
    }
    setInstalling(true)
    try {
      const res = await botApi.install(token, botType, credential.trim())
      if (res.success) {
        setSuccess('Bot 安装成功')
        setCredential('')
        await loadData()
      } else {
        setError(res.error || '安装失败')
      }
    } finally {
      setInstalling(false)
    }
  }

  const handleUninstall = async (botId: string): Promise<void> => {
    setError('')
    setSuccess('')
    const res = await botApi.uninstall(token, botId)
    if (res.success) {
      setSuccess('Bot 已停用')
      await loadData()
    } else {
      setError(res.error || '操作失败')
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
                    onClick={() => setSelectedModelId(m.id)}
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
            {!modelSearch && models.length > 200 && (
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                显示前 200 条，请输入关键词精确搜索
              </div>
            )}
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
          <label>Base URL（可选，默认 OpenAI）</label>
          <input
            className="form-control"
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
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

      {/* Install Bot */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>安装 Bot</h3>
        <form onSubmit={handleInstallBot}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0, flex: '0 0 160px' }}>
              <label>Bot 类型</label>
              <select
                className="form-control"
                value={botType}
                onChange={(e) => setBotType(e.target.value)}
              >
                <option value="telegram">Telegram</option>
                <option value="slack">Slack</option>
                <option value="webhook">Webhook</option>
                <option value="email">Email (SMTP)</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
              <label>
                {botType === 'telegram' ? 'Bot Token' : botType === 'webhook' ? 'Webhook URL' : botType === 'slack' ? 'Bot Token' : 'SMTP 配置 JSON'}
              </label>
              <input
                className="form-control"
                type="text"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                placeholder={botType === 'telegram' ? '1234567890:ABC...' : botType === 'webhook' ? 'https://...' : '...'}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={installing} style={{ marginBottom: 0 }}>
              {installing ? '安装中...' : '安装'}
            </button>
          </div>
        </form>
      </div>

      {/* Bot List */}
      <div className="card">
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
          已安装 Bot（{bots.length} 个）
        </h3>
        {bots.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <div className="empty-icon">💬</div>
            <p>尚未安装任何 Bot</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bots.map((bot) => (
              <div
                key={bot.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: '#f9fafb',
                  borderRadius: 6,
                  border: '1px solid #e5e7eb'
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{bot.bot_type}</span>
                  <span
                    className={`badge ${bot.status === 'active' ? 'badge-green' : 'badge-gray'}`}
                    style={{ marginLeft: 8 }}
                  >
                    {bot.status === 'active' ? '活跃' : '已停用'}
                  </span>
                  {bot.binding_count !== undefined && (
                    <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>
                      {bot.binding_count} 个绑定
                    </span>
                  )}
                </div>
                {bot.status === 'active' && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleUninstall(bot.id)}
                  >
                    停用
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Binding Tab
// ---------------------------------------------------------------------------

function BindingTab({ token }: { token: string }): React.ReactElement {
  const [users, setUsers] = useState<SystemUser[]>([])
  const [bots, setBots] = useState<BotConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form state
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedBotId, setSelectedBotId] = useState('')
  const [platformUserId, setPlatformUserId] = useState('')
  const [binding, setBinding] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async (): Promise<void> => {
    setLoading(true)
    try {
      const [usersRes, botsRes] = await Promise.all([
        authApi.listUsers(token),
        botApi.listBots(token)
      ])
      if (usersRes.success && Array.isArray(usersRes.data)) {
        setUsers(usersRes.data as SystemUser[])
      }
      if (botsRes.success && Array.isArray(botsRes.data)) {
        setBots((botsRes.data as BotConfig[]).filter((b) => b.status === 'active'))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleBind = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!selectedUserId || !selectedBotId || !platformUserId.trim()) {
      setError('请填写完整的绑定信息')
      return
    }
    setBinding(true)
    try {
      const res = await botApi.bindUser(token, selectedUserId, selectedBotId, platformUserId.trim())
      if (res.success) {
        setSuccess('绑定成功')
        setPlatformUserId('')
      } else {
        setError(res.error || '绑定失败')
      }
    } finally {
      setBinding(false)
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

  const studentUsers = users.filter((u) => u.role === 'student' || u.role === 'guardian')

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card">
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>平台账号绑定</h3>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
          将系统用户与平台账号 ID 绑定，Bot 才能识别身份并回复消息。
        </p>

        {bots.length === 0 ? (
          <div className="alert alert-warning">
            没有活跃的 Bot，请先在「Bot 配置」Tab 安装 Bot。
          </div>
        ) : studentUsers.length === 0 ? (
          <div className="alert alert-warning">
            系统中还没有学生或监护人账号。
          </div>
        ) : (
          <form onSubmit={handleBind}>
            <div className="grid-3" style={{ gap: 12, marginBottom: 16 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>选择系统用户</label>
                <select
                  className="form-control"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  <option value="">-- 选择用户 --</option>
                  {studentUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username} ({u.role === 'student' ? '学生' : '监护人'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>选择 Bot</label>
                <select
                  className="form-control"
                  value={selectedBotId}
                  onChange={(e) => setSelectedBotId(e.target.value)}
                >
                  <option value="">-- 选择 Bot --</option>
                  {bots.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bot_type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>平台账号 ID</label>
                <input
                  className="form-control"
                  type="text"
                  value={platformUserId}
                  onChange={(e) => setPlatformUserId(e.target.value)}
                  placeholder="如 Telegram chat_id"
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={binding}>
              {binding ? '绑定中...' : '确认绑定'}
            </button>
          </form>
        )}
      </div>

      {/* Users Overview */}
      {users.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>系统用户列表</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {users.map((u) => (
              <div
                key={u.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: '#f9fafb',
                  borderRadius: 6,
                  fontSize: 13
                }}
              >
                <span style={{ fontWeight: 500 }}>{u.username}</span>
                <span className={`badge ${u.role === 'admin' ? 'badge-blue' : u.role === 'student' ? 'badge-green' : 'badge-yellow'}`}>
                  {u.role === 'admin' ? '管理员' : u.role === 'student' ? '学生' : '监护人'}
                </span>
                <span style={{ color: '#9ca3af', marginLeft: 'auto', fontSize: 11 }}>
                  {new Date(u.create_time).toLocaleDateString('zh-CN')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Email Tab
// ---------------------------------------------------------------------------

function EmailTab({ token }: { token: string }): React.ReactElement {
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
        settingsApi.getEmailConfig(token),
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
      const res = await settingsApi.saveEmailConfig(token, email.trim(), authCode.trim(), imapHost.trim(), imapPort)
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
      const res = await settingsApi.testEmailConnection(token)
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

      {/* Info */}
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
        <strong>说明：</strong>开启邮件轮询后，系统每5分钟自动检查新邮件。邮件中的附件会被自动保存到 Workspace，并注册为学习资源，Agent 将收到通知。
      </div>
    </div>
  )
}

export default Config
