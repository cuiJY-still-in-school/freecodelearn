import React, { useEffect, useState } from 'react'
import {
  settingsApi,
  emailApi,
  goalsApi,
  type AIModel,
  type AIConfig,
  type EmailConfig,
  type EmailStatus,
  type StudentGoal
} from '../api/http'

type TabKey = 'ai' | 'email' | 'goal'

function Config(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabKey>('ai')

  const tabStyle = (key: TabKey): React.CSSProperties => ({
    padding: '7px 18px',
    borderRadius: 'var(--radius)',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: activeTab === key ? 600 : 400,
    background: activeTab === key ? 'var(--primary)' : 'transparent',
    color: activeTab === key ? '#fff' : 'var(--text-secondary)',
    transition: 'all 0.13s',
    fontFamily: 'inherit'
  })

  return (
    <div>
      <div className="page-header">
        <h1>系统配置</h1>
        <p>配置 AI 模型与邮件服务</p>
      </div>

      {/* Tab Bar */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          background: 'var(--bg)',
          padding: 4,
          borderRadius: 8,
          marginBottom: 24,
          width: 'fit-content',
          border: '1px solid var(--border)'
        }}
      >
        <button style={tabStyle('ai')} onClick={() => setActiveTab('ai')}>
          AI 配置
        </button>
        <button style={tabStyle('email')} onClick={() => setActiveTab('email')}>
          Email 插件
        </button>
        <button style={tabStyle('goal')} onClick={() => setActiveTab('goal')}>
          学习目标
        </button>
      </div>

      {activeTab === 'ai' && <AITab />}
      {activeTab === 'email' && <EmailTab />}
      {activeTab === 'goal' && <GoalTab />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AI Config Tab
// ---------------------------------------------------------------------------

// ── 搜索输入框（带图标）────────────────────────────────────────────────
function SearchInput({
  value, onChange, placeholder
}: { value: string; onChange: (v: string) => void; placeholder?: string }): React.ReactElement {
  return (
    <div style={{ position: 'relative' }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '6px 10px 6px 28px',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          background: 'var(--bg)', color: 'var(--text)',
          fontSize: 13, outline: 'none', fontFamily: 'inherit'
        }}
      />
    </div>
  )
}

function AITab(): React.ReactElement {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [models, setModels] = useState<AIModel[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [providerSearch, setProviderSearch] = useState('')
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
        if (cfg.provider) setSelectedProvider(cfg.provider)
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
        const list = res.data as AIModel[]
        setModels(list)
        // 自动选中已配置的 provider
        if (aiConfig?.provider && list.some(m => m.provider === aiConfig.provider)) {
          setSelectedProvider(aiConfig.provider)
        } else if (list.length > 0) {
          setSelectedProvider(list[0].provider)
        }
      }
    } finally {
      setLoadingModels(false)
    }
  }

  const handleSaveAI = async (): Promise<void> => {
    setError('')
    setSuccess('')
    if (!apiKey.trim() && !aiConfig?.apiKey) { setError('请输入 API Key'); return }
    const selected = models.find(m => m.id === selectedModelId)
    const finalProvider = selected?.provider || selectedProvider || 'openai'
    const finalModelName = selected?.name || selectedModelId
    const finalApiKey = apiKey.trim() || aiConfig?.apiKey || ''
    setSavingAI(true)
    try {
      const res = await settingsApi.saveAIConfig(finalProvider, selectedModelId, finalModelName, finalApiKey, baseUrl || undefined)
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

  // Provider 列表：去重 + 排序
  const providers = Array.from(new Set(models.map(m => m.provider))).sort()
  const filteredProviders = providers.filter(p =>
    !providerSearch || p.toLowerCase().includes(providerSearch.toLowerCase())
  )

  // 当前 Provider 下的模型
  const modelsInProvider = selectedProvider ? models.filter(m => m.provider === selectedProvider) : []
  const filteredModels = modelsInProvider.filter(m =>
    !modelSearch ||
    m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
    m.id.toLowerCase().includes(modelSearch.toLowerCase())
  )

  const selectedModel = models.find(m => m.id === selectedModelId)

  const panelStyle: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    overflow: 'hidden', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column'
  }
  const listStyle: React.CSSProperties = {
    flex: 1, overflowY: 'auto', maxHeight: 220
  }
  const emptyStyle: React.CSSProperties = {
    padding: '28px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13
  }

  if (loading) {
    return <div className="loading"><div className="spinner" />加载中...</div>
  }

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>AI 模型配置</h3>

        {/* 当前配置摘要 */}
        {aiConfig?.modelId && (
          <div style={{ marginBottom: 14, padding: '8px 12px', background: 'rgba(217,119,87,0.06)', borderRadius: 'var(--radius)', border: '1px solid rgba(217,119,87,0.15)', fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)' }}>当前</span>
            <span style={{ fontWeight: 600, color: 'var(--primary)', margin: '0 6px' }}>
              {aiConfig.modelName || aiConfig.modelId}
            </span>
            {aiConfig.provider && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>via {aiConfig.provider}</span>}
            {aiConfig.apiKeyMasked && <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 8 }}>· {aiConfig.apiKeyMasked}</span>}
          </div>
        )}

        {/* 拉取按钮 */}
        <div style={{ marginBottom: 14 }}>
          <button className="btn btn-secondary btn-sm" onClick={handleLoadModels} disabled={loadingModels}>
            {loadingModels
              ? <><span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .6s linear infinite', marginRight: 6, verticalAlign: 'middle' }} />拉取中…</>
              : models.length > 0 ? `已加载 ${models.length} 个模型 · 点击刷新` : '从 models.dev 拉取模型列表'
            }
          </button>
        </div>

        {/* 双栏选择器 */}
        {models.length > 0 && (
          <div className="form-group">
            <label style={{ marginBottom: 8, display: 'block' }}>
              选择模型
              {selectedModel && (
                <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--primary)', marginLeft: 8 }}>
                  ✓ {selectedModel.name}
                  {selectedModel.supportsImages && <span style={{ marginLeft: 4, color: 'var(--text-muted)' }}>📷</span>}
                  {selectedModel.supportsTools && <span style={{ marginLeft: 2, color: 'var(--text-muted)' }}>🔧</span>}
                </span>
              )}
            </label>

            <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
              {/* ── 左：Provider ── */}
              <div style={{ ...panelStyle, width: 200, flexShrink: 0 }}>
                <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                  <SearchInput value={providerSearch} onChange={v => { setProviderSearch(v); }} placeholder="搜索提供商…" />
                </div>
                <div style={listStyle}>
                  {filteredProviders.length === 0 && <div style={emptyStyle}>无结果</div>}
                  {filteredProviders.map(p => {
                    const isActive = selectedProvider === p
                    return (
                      <div key={p} onClick={() => { setSelectedProvider(p); setModelSearch('') }}
                        style={{
                          padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                          background: isActive ? 'rgba(217,119,87,0.08)' : 'transparent',
                          borderLeft: `3px solid ${isActive ? 'var(--primary)' : 'transparent'}`,
                          color: isActive ? 'var(--primary)' : 'var(--text)',
                          fontWeight: isActive ? 600 : 400,
                          borderBottom: '1px solid var(--border)',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                        <span>{p}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                          {models.filter(m => m.provider === p).length}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ── 右：Model ── */}
              <div style={{ ...panelStyle, flex: 1 }}>
                <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
                  <SearchInput
                    value={modelSearch}
                    onChange={setModelSearch}
                    placeholder={selectedProvider ? `在 ${selectedProvider} 中搜索…` : '请先选择提供商'}
                  />
                </div>
                <div style={listStyle}>
                  {!selectedProvider && (
                    <div style={emptyStyle}>← 先选一个提供商</div>
                  )}
                  {selectedProvider && filteredModels.length === 0 && (
                    <div style={emptyStyle}>无匹配模型</div>
                  )}
                  {filteredModels.map(m => {
                    const isActive = selectedModelId === m.id
                    return (
                      <div key={m.id}
                        onClick={() => {
                          setSelectedModelId(m.id)
                          if (m.baseUrl) { setBaseUrl(m.baseUrl); setBaseUrlAutoFilled(true) }
                          else { setBaseUrl(''); setBaseUrlAutoFilled(false) }
                        }}
                        style={{
                          padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                          background: isActive ? 'rgba(217,119,87,0.08)' : 'transparent',
                          borderLeft: `3px solid ${isActive ? 'var(--primary)' : 'transparent'}`,
                          borderBottom: '1px solid var(--border)',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                        <span style={{ color: isActive ? 'var(--primary)' : 'var(--text)', fontWeight: isActive ? 600 : 400 }}>
                          {m.name}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, display: 'flex', gap: 4 }}>
                          {m.supportsImages && <span title="支持图片">📷</span>}
                          {m.supportsTools && <span title="支持工具调用">🔧</span>}
                          {/thinking|reason|o1|o3|o4/i.test(m.id) && <span title="推理模型">🧠</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* API Key */}
        <div className="form-group">
          <label>
            API Key
            {aiConfig?.apiKeyMasked && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12, marginLeft: 6 }}>当前：{aiConfig.apiKeyMasked}，留空不修改</span>}
          </label>
          <input className="form-control" type="password" value={apiKey}
            onChange={e => setApiKey(e.target.value)} placeholder="sk-..." />
        </div>

        {/* Base URL */}
        <div className="form-group">
          <label>
            Base URL
            {baseUrlAutoFilled
              ? <span style={{ fontWeight: 400, color: 'var(--success)', fontSize: 11, marginLeft: 6 }}>自动填充自 models.dev</span>
              : <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11, marginLeft: 6 }}>可选，默认 OpenAI</span>
            }
          </label>
          <input className="form-control" type="text" value={baseUrl}
            onChange={e => { setBaseUrl(e.target.value); setBaseUrlAutoFilled(false) }}
            placeholder="https://api.openai.com/v1" />
        </div>

        <button className="btn btn-primary" onClick={handleSaveAI} disabled={savingAI || !selectedModelId}>
          {savingAI ? '保存中...' : '保存 AI 配置'}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
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
      const res = await settingsApi.saveEmailConfig(
        email.trim(),
        authCode.trim(),
        imapHost.trim(),
        imapPort
      )
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
        setSuccess('连接测试成功')
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
            <div style={{ fontSize: 13 }}>
              {emailStatus?.polling ? (
                <span style={{ color: 'var(--success)' }}>正在轮询（每 5 分钟检查一次新邮件）</span>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>已停止</span>
              )}
            </div>
            {emailStatus?.lastCheck && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                上次检查：{new Date(emailStatus.lastCheck).toLocaleString('zh-CN')}
              </div>
            )}
            {emailStatus?.error && (
              <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>
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
          <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
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
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              支持自动填充 IMAP：Gmail、QQ邮箱、163、Outlook
            </div>
          </div>

          <div className="form-group">
            <label>授权码 / 密码{emailConfig?.configured && '（留空不修改）'}</label>
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
          borderRadius: 'var(--radius)',
          padding: '12px 16px',
          fontSize: 13,
          color: '#1d4ed8'
        }}
      >
        <strong>说明：</strong>开启邮件轮询后，系统每 5 分钟自动检查新邮件。邮件中的附件会被自动保存到 Workspace，并注册为学习资源，Agent 将收到通知并生成资源简报。
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Goal Tab
// ---------------------------------------------------------------------------

const EXAM_TYPES = ['高考', '中考', '竞赛', '期末考试', '日常学习']

function GoalTab(): React.ReactElement {
  const [examType, setExamType] = useState('')
  const [examDate, setExamDate] = useState('')
  const [schoolProgress, setSchoolProgress] = useState('')
  const [guardianNotes, setGuardianNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    goalsApi.get().then(res => {
      if (res.success && res.data) {
        const g = res.data as StudentGoal
        setExamType(g.exam_type ?? '')
        setExamDate(g.exam_date ? new Date(g.exam_date).toISOString().slice(0, 10) : '')
        setSchoolProgress(g.school_progress ?? '')
        setGuardianNotes(g.guardian_notes ?? '')
      }
      setLoading(false)
    })
  }, [])

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    const res = await goalsApi.save({
      examType: examType || undefined,
      examDate: examDate ? new Date(examDate).getTime() : undefined,
      schoolProgress: schoolProgress || undefined,
      guardianNotes: guardianNotes || undefined
    })
    setSaving(false)
    if (res.success) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
    else setError(res.error ?? '保存失败')
  }

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>加载中…</div>

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="card" style={{ padding: '24px 28px' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>学习目标</h3>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          AI 用这些信息决定当前讲解的范围和优先级。只填你知道的，留空也没关系。
        </p>

        <div className="form-group">
          <label style={{ fontWeight: 600 }}>目标考试</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: 4 }}>
            {EXAM_TYPES.map(t => (
              <button key={t} onClick={() => setExamType(examType === t ? '' : t)} style={{
                padding: '5px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                border: `1px solid ${examType === t ? 'var(--primary)' : 'var(--border)'}`,
                background: examType === t ? 'rgba(217,119,87,0.08)' : 'transparent',
                color: examType === t ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: examType === t ? 600 : 400
              }}>{t}</button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label style={{ fontWeight: 600 }}>考试日期 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>（可选）</span></label>
          <input className="form-control" type="date" value={examDate} onChange={e => setExamDate(e.target.value)} />
        </div>

        <div className="form-group">
          <label style={{ fontWeight: 600 }}>学校当前进度 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>（可选）</span></label>
          <input className="form-control" type="text"
            placeholder="例如：高一下学期，数学必修二第三章向量"
            value={schoolProgress} onChange={e => setSchoolProgress(e.target.value)} />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>
            帮助 AI 了解当前教学进度，避免讲超前或滞后的内容
          </div>
        </div>

        <div className="form-group">
          <label style={{ fontWeight: 600 }}>备注 <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>（可选）</span></label>
          <textarea className="form-control" rows={3}
            placeholder="例如：数学老师说代数基础较弱；英语听力需要加强"
            value={guardianNotes} onChange={e => setGuardianNotes(e.target.value)}
            style={{ resize: 'vertical' }} />
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ minWidth: 100 }}>
          {saving ? '保存中…' : saved ? '已保存' : '保存'}
        </button>
      </div>
    </div>
  )
}

export default Config
