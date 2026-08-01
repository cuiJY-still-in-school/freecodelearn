import React, { useEffect, useState } from 'react'
import { getAuth } from '../App'
import { botApi, type BotConfig } from '../api/ipc'

type BotType = 'wechat' | 'telegram' | 'slack' | 'webhook' | 'email'

const BOT_TYPE_OPTIONS: { value: BotType; label: string; icon: string; credentialHint: string }[] = [
  {
    value: 'telegram',
    label: 'Telegram',
    icon: '✈️',
    credentialHint: 'Bot Token（从 @BotFather 获取）'
  },
  {
    value: 'wechat',
    label: '企业微信',
    icon: '💬',
    credentialHint: 'Webhook URL（企业微信机器人地址）'
  },
  {
    value: 'slack',
    label: 'Slack',
    icon: '🔷',
    credentialHint: 'Bot Token（xoxb-... 格式）'
  },
  {
    value: 'webhook',
    label: 'Webhook',
    icon: '🔗',
    credentialHint: '自定义 Webhook URL'
  },
  {
    value: 'email',
    label: '邮件',
    icon: '📧',
    credentialHint: 'JSON: {"host":"smtp.example.com","port":587,"user":"u","pass":"p","from":"f"}'
  }
]

function BotManager(): React.ReactElement {
  const auth = getAuth()
  const [bots, setBots] = useState<BotConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Install form
  const [showInstall, setShowInstall] = useState(false)
  const [botType, setBotType] = useState<BotType>('telegram')
  const [credential, setCredential] = useState('')
  const [installing, setInstalling] = useState(false)

  // Bind user form
  const [showBind, setShowBind] = useState(false)
  const [bindBotId, setBindBotId] = useState('')
  const [bindUserId, setBindUserId] = useState('')
  const [bindPlatformId, setBindPlatformId] = useState('')
  const [binding, setBinding] = useState(false)

  useEffect(() => {
    loadBots()
  }, [])

  const loadBots = async (): Promise<void> => {
    if (!auth.token) return
    setLoading(true)
    try {
      const result = await botApi.listBots(auth.token)
      if (result.success && Array.isArray(result.data)) {
        setBots(result.data as BotConfig[])
      } else {
        setError(result.error || '加载失败')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleInstall = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!credential.trim()) {
      setError('请输入 Bot 凭证')
      return
    }
    if (!auth.token) return

    setInstalling(true)
    try {
      const result = await botApi.install(auth.token, botType, credential.trim())
      if (result.success) {
        setSuccess('Bot 安装成功')
        setShowInstall(false)
        setCredential('')
        await loadBots()
      } else {
        setError(result.error || '安装失败')
      }
    } finally {
      setInstalling(false)
    }
  }

  const handleUninstall = async (botId: string): Promise<void> => {
    if (!auth.token || !confirm('确定停用该 Bot？相关绑定也将失效。')) return
    const result = await botApi.uninstall(auth.token, botId)
    if (result.success) {
      setSuccess('Bot 已停用')
      await loadBots()
    } else {
      setError(result.error || '操作失败')
    }
  }

  const handleBind = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!bindUserId.trim() || !bindBotId || !bindPlatformId.trim()) {
      setError('请填写完整绑定信息')
      return
    }
    if (!auth.token) return

    setBinding(true)
    try {
      const result = await botApi.bindUser(auth.token, bindUserId.trim(), bindBotId, bindPlatformId.trim())
      if (result.success) {
        setSuccess('用户绑定成功')
        setShowBind(false)
        setBindUserId('')
        setBindPlatformId('')
        setBindBotId('')
      } else {
        setError(result.error || '绑定失败')
      }
    } finally {
      setBinding(false)
    }
  }

  const getBotTypeInfo = (type: string) =>
    BOT_TYPE_OPTIONS.find((b) => b.value === type) || { label: type, icon: '🤖', credentialHint: '' }

  const formatDate = (ts: number): string => new Date(ts).toLocaleDateString('zh-CN')

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
      <div
        className="page-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <div>
          <h1>Bot 管理</h1>
          <p>安装和配置消息 Bot，实现 Agent 主动推送通知</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setShowBind(!showBind)
              setShowInstall(false)
              setError('')
              setSuccess('')
            }}
          >
            {showBind ? '取消' : '绑定用户'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowInstall(!showInstall)
              setShowBind(false)
              setError('')
              setSuccess('')
            }}
          >
            {showInstall ? '取消' : '+ 安装 Bot'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Install Form */}
      {showInstall && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>安装新 Bot</h2>
          <form onSubmit={handleInstall}>
            <div className="form-group">
              <label>Bot 类型</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {BOT_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setBotType(opt.value)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: `2px solid ${botType === opt.value ? '#4f46e5' : '#e5e7eb'}`,
                      background: botType === opt.value ? '#ede9fe' : 'white',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: botType === opt.value ? 600 : 400,
                      color: botType === opt.value ? '#4f46e5' : '#374151',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <span>{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>凭证 *</label>
              <textarea
                className="form-control"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                placeholder={getBotTypeInfo(botType).credentialHint}
                rows={3}
              />
              <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                提示：{getBotTypeInfo(botType).credentialHint}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={installing}>
                {installing ? '安装中...' : '安装'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowInstall(false)}
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bind User Form */}
      {showBind && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>绑定用户到 Bot</h2>
          <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
            将系统用户与 Bot 平台账号关联，Agent 将通过 Bot 向该用户发送消息
          </p>
          <form onSubmit={handleBind}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 180px' }}>
                <label>系统用户 ID *</label>
                <input
                  className="form-control"
                  value={bindUserId}
                  onChange={(e) => setBindUserId(e.target.value)}
                  placeholder="用户 UUID"
                />
              </div>
              <div className="form-group" style={{ flex: '1 1 160px' }}>
                <label>选择 Bot *</label>
                <select
                  className="form-control"
                  value={bindBotId}
                  onChange={(e) => setBindBotId(e.target.value)}
                >
                  <option value="">请选择</option>
                  {bots
                    .filter((b) => b.status === 'active')
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {getBotTypeInfo(b.bot_type).icon} {getBotTypeInfo(b.bot_type).label} (
                        {b.id.slice(0, 8)})
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 180px' }}>
                <label>平台用户 ID *</label>
                <input
                  className="form-control"
                  value={bindPlatformId}
                  onChange={(e) => setBindPlatformId(e.target.value)}
                  placeholder="如 Telegram Chat ID"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={binding}>
                {binding ? '绑定中...' : '绑定'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowBind(false)}
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bots List */}
      {bots.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">💬</div>
            <h3>还没有安装 Bot</h3>
            <p>安装 Bot 后，AI Agent 可以主动向学生推送学习提醒</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {bots.map((bot) => {
            const info = getBotTypeInfo(bot.bot_type)
            return (
              <div
                key={bot.id}
                className="card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: '#f3f4f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 22
                    }}
                  >
                    {info.icon}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{info.label}</span>
                      <span
                        className={`badge ${bot.status === 'active' ? 'badge-green' : 'badge-gray'}`}
                      >
                        {bot.status === 'active' ? '运行中' : '已停用'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>
                      ID: {bot.id.slice(0, 16)}... · 绑定用户: {bot.binding_count ?? 0} 个 · 安装于{' '}
                      {formatDate(bot.create_time)}
                    </div>
                    {bot.installed_by_name && (
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>
                        安装者：{bot.installed_by_name}
                      </div>
                    )}
                  </div>
                </div>
                {bot.status === 'active' && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleUninstall(bot.id)}
                    style={{ color: '#ef4444', borderColor: '#fecaca' }}
                  >
                    停用
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default BotManager
