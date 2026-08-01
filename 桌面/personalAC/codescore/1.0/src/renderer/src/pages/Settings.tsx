import React, { useEffect, useState } from 'react'
import { getAuth } from '../App'
import { settingsApi, agentApi, type AIModel, type AIConfig } from '../api/ipc'

function Settings(): React.ReactElement {
  const auth = getAuth()
  const [models, setModels] = useState<AIModel[]>([])
  const [currentConfig, setCurrentConfig] = useState<AIConfig | null>(null)
  const [loadingModels, setLoadingModels] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form state
  const [provider, setProvider] = useState('')
  const [modelId, setModelId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

  // DND settings
  const [dndStart, setDndStart] = useState('22:00')
  const [dndEnd, setDndEnd] = useState('08:00')
  const [savingDnd, setSavingDnd] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await settingsApi.getAIConfig()
      if (result.success && result.data) {
        const cfg = result.data as AIConfig
        setCurrentConfig(cfg)
        setProvider(cfg.provider || '')
        setModelId(cfg.modelId || '')
        setBaseUrl(cfg.baseUrl || '')
        // Don't prefill apiKey for security
      }
    } finally {
      setLoading(false)
    }
  }

  const handleFetchModels = async (): Promise<void> => {
    setLoadingModels(true)
    setError('')
    try {
      const result = await settingsApi.getModels()
      if (result.success && Array.isArray(result.data)) {
        setModels(result.data as AIModel[])
      } else {
        setError(result.error || '获取模型列表失败')
      }
    } finally {
      setLoadingModels(false)
    }
  }

  const handleSaveConfig = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!provider.trim()) {
      setError('请填写提供商名称')
      return
    }
    if (!modelId.trim()) {
      setError('请填写或选择模型 ID')
      return
    }
    if (!apiKey.trim()) {
      setError('请填写 API Key')
      return
    }

    if (!auth.token) return
    setSaving(true)

    try {
      const result = await settingsApi.saveAIConfig(
        auth.token,
        provider.trim(),
        modelId.trim(),
        apiKey.trim(),
        baseUrl.trim() || undefined
      )
      if (result.success) {
        setSuccess('AI 配置已保存')
        setApiKey('')
        await loadConfig()
      } else {
        setError(result.error || '保存失败')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSaveDnd = async (): Promise<void> => {
    setSavingDnd(true)
    setError('')
    try {
      const result = await agentApi.setDoNotDisturb(dndStart, dndEnd)
      if (result.success) {
        setSuccess(`免打扰时段已设置：${dndStart} - ${dndEnd}`)
      } else {
        setError(result.error || '设置失败')
      }
    } finally {
      setSavingDnd(false)
    }
  }

  const handleClearDnd = async (): Promise<void> => {
    const result = await agentApi.clearDoNotDisturb()
    if (result.success) {
      setSuccess('免打扰已关闭')
    }
  }

  const handleSelectModel = (model: AIModel): void => {
    setModelId(model.id)
    setProvider(model.provider)
  }

  const groupedModels = models.reduce(
    (acc, m) => {
      if (!acc[m.provider]) acc[m.provider] = []
      acc[m.provider].push(m)
      return acc
    },
    {} as Record<string, AIModel[]>
  )

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
      <div className="page-header">
        <h1>系统设置</h1>
        <p>配置 AI 模型和系统偏好</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Current Config */}
      {currentConfig && (currentConfig.provider || currentConfig.modelId) && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid #10b981' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: '#065f46' }}>
            ✅ 当前 AI 配置
          </h3>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
            <div>
              <span style={{ color: '#9ca3af' }}>提供商：</span>
              <strong>{currentConfig.provider || '-'}</strong>
            </div>
            <div>
              <span style={{ color: '#9ca3af' }}>模型：</span>
              <strong>{currentConfig.modelId || '-'}</strong>
            </div>
            <div>
              <span style={{ color: '#9ca3af' }}>API Key：</span>
              <strong>{currentConfig.apiKeyMasked || '（未设置）'}</strong>
            </div>
            {currentConfig.baseUrl && (
              <div>
                <span style={{ color: '#9ca3af' }}>Base URL：</span>
                <strong>{currentConfig.baseUrl}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Config Form */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>AI 模型配置</h2>

        {/* Fetch Models Button */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <button
              className="btn btn-secondary"
              onClick={handleFetchModels}
              disabled={loadingModels}
            >
              {loadingModels ? (
                <>
                  <div className="spinner" style={{ width: 14, height: 14 }} />
                  获取中...
                </>
              ) : (
                '🌐 从 models.dev 获取模型列表'
              )}
            </button>
            {models.length > 0 && (
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                已获取 {models.length} 个模型
              </span>
            )}
          </div>

          {/* Model List */}
          {models.length > 0 && (
            <div
              style={{
                maxHeight: 300,
                overflowY: 'auto',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: 8
              }}
            >
              {Object.entries(groupedModels).map(([prov, provModels]) => (
                <div key={prov} style={{ marginBottom: 10 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      padding: '4px 6px',
                      letterSpacing: '0.05em'
                    }}
                  >
                    {prov}
                  </div>
                  {provModels.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelectModel(m)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        background: modelId === m.id ? '#ede9fe' : 'transparent',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 13,
                        textAlign: 'left',
                        color: modelId === m.id ? '#4f46e5' : '#374151'
                      }}
                    >
                      <span style={{ fontWeight: modelId === m.id ? 600 : 400 }}>
                        {m.name || m.id}
                      </span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {m.supportsVision && (
                          <span className="badge badge-blue" style={{ fontSize: 10 }}>
                            多模态
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleSaveConfig}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 150px' }}>
              <label>提供商名称 *</label>
              <input
                className="form-control"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="如 openai / anthropic"
              />
            </div>
            <div className="form-group" style={{ flex: '2 1 200px' }}>
              <label>模型 ID *</label>
              <input
                className="form-control"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="如 gpt-4o / claude-3-5-sonnet-20241022"
              />
            </div>
          </div>

          <div className="form-group">
            <label>
              API Key *{' '}
              <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>
                （使用系统加密存储，安全保存）
              </span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-control"
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  currentConfig?.apiKeyMasked
                    ? `当前：${currentConfig.apiKeyMasked}（留空则不更改）`
                    : '请输入 API Key'
                }
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowApiKey(!showApiKey)}
                style={{ flexShrink: 0 }}
              >
                {showApiKey ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>
              自定义 Base URL{' '}
              <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>（选填）</span>
            </label>
            <input
              className="form-control"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="默认使用 https://api.openai.com/v1（兼容 OpenAI API 格式）"
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? '保存中...' : '保存配置'}
          </button>
        </form>
      </div>

      {/* Do Not Disturb */}
      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>🔕 免打扰设置</h2>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          在设定时段内，Agent 将不会主动发送消息或触发通知
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label
              style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}
            >
              开始时间
            </label>
            <input
              type="time"
              className="form-control"
              value={dndStart}
              onChange={(e) => setDndStart(e.target.value)}
              style={{ width: 130 }}
            />
          </div>
          <div>
            <label
              style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}
            >
              结束时间
            </label>
            <input
              type="time"
              className="form-control"
              value={dndEnd}
              onChange={(e) => setDndEnd(e.target.value)}
              style={{ width: 130 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleSaveDnd} disabled={savingDnd}>
              {savingDnd ? '保存中...' : '设置免打扰'}
            </button>
            <button className="btn btn-secondary" onClick={handleClearDnd}>
              关闭免打扰
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
