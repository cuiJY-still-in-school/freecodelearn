import React, { useEffect, useState } from 'react'
import { getAuth } from '../App'
import { agentApi, type AgentLog } from '../api/ipc'

const ACTION_TYPE_OPTIONS = [
  { value: 'all', label: '全部类型' },
  { value: 'push_suggestion', label: '推送建议' },
  { value: 'send_bot_message', label: '发送消息' },
  { value: 'set_schedule', label: '设置定时' },
  { value: 'update_weakness', label: '更新薄弱点' },
  { value: 'no_action', label: '无动作' }
]

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'pending', label: '进行中' }
]

function AgentLogs(): React.ReactElement {
  const auth = getAuth()
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  // Filters
  const [actionTypeFilter, setActionTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [limit, setLimit] = useState(50)

  useEffect(() => {
    loadLogs()
  }, [limit])

  const loadLogs = async (): Promise<void> => {
    if (!auth.userId) return
    setLoading(true)
    try {
      const result = await agentApi.getLogs(auth.userId, limit)
      if (result.success && Array.isArray(result.data)) {
        setLogs(result.data as AgentLog[])
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRunCycle = async (): Promise<void> => {
    if (!auth.userId || running) return
    setRunning(true)
    try {
      await agentApi.runCycle(auth.userId)
      setTimeout(() => {
        loadLogs()
        setRunning(false)
      }, 3000)
    } catch {
      setRunning(false)
    }
  }

  const filteredLogs = logs.filter((log) => {
    if (actionTypeFilter !== 'all' && log.action_type !== actionTypeFilter) return false
    if (statusFilter !== 'all' && log.status !== statusFilter) return false
    return true
  })

  const formatDateTime = (ts: number): string => {
    const d = new Date(ts)
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const getActionLabel = (type: string): string => {
    const found = ACTION_TYPE_OPTIONS.find((o) => o.value === type)
    return found ? found.label : type
  }

  const getActionIcon = (type: string): string => {
    const icons: Record<string, string> = {
      push_suggestion: '💡',
      send_bot_message: '💬',
      set_schedule: '⏰',
      update_weakness: '📊',
      no_action: '⏸️'
    }
    return icons[type] || '🤖'
  }

  const getTriggerLabel = (type: string): string => {
    if (type === 'autonomous') return '自主触发'
    if (type.startsWith('schedule:')) return '定时触发'
    if (type === 'event') return '事件触发'
    return type
  }

  const getStatusColor = (status: string): string => {
    if (status === 'success') return '#10b981'
    if (status === 'failed') return '#ef4444'
    return '#f59e0b'
  }

  const getStatusLabel = (status: string): string => {
    if (status === 'success') return '成功'
    if (status === 'failed') return '失败'
    return '进行中'
  }

  return (
    <div>
      <div
        className="page-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <div>
          <h1>Agent 行为日志</h1>
          <p>查看 AI Agent 的自主决策和执行记录</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {auth.role === 'student' && (
            <button className="btn btn-primary" onClick={handleRunCycle} disabled={running}>
              {running ? (
                <>
                  <div className="spinner" style={{ width: 14, height: 14 }} />
                  分析中...
                </>
              ) : (
                '🤖 立即分析'
              )}
            </button>
          )}
          <button className="btn btn-secondary" onClick={loadLogs} disabled={loading}>
            🔄 刷新
          </button>
        </div>
      </div>

      {/* Stats Row */}
      {logs.length > 0 && (
        <div className="grid-4" style={{ marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">总记录</div>
            <div className="stat-value">{logs.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">成功</div>
            <div className="stat-value" style={{ color: '#10b981' }}>
              {logs.filter((l) => l.status === 'success').length}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">失败</div>
            <div className="stat-value" style={{ color: '#ef4444' }}>
              {logs.filter((l) => l.status === 'failed').length}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">推送建议次数</div>
            <div className="stat-value">
              {logs.filter((l) => l.action_type === 'push_suggestion').length}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div
        className="card"
        style={{
          marginBottom: 16,
          padding: '12px 16px',
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'center'
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>动作类型：</span>
          <select
            className="form-control"
            value={actionTypeFilter}
            onChange={(e) => setActionTypeFilter(e.target.value)}
            style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }}
          >
            {ACTION_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>状态：</span>
          <select
            className="form-control"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>显示条数：</span>
          <select
            className="form-control"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }}
          >
            <option value={20}>20 条</option>
            <option value={50}>50 条</option>
            <option value={100}>100 条</option>
          </select>
        </div>
        <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 'auto' }}>
          显示 {filteredLogs.length} / {logs.length} 条
        </span>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="loading">
          <div className="spinner" />
          加载中...
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">🤖</div>
            <h3>暂无日志记录</h3>
            <p>
              {logs.length === 0
                ? 'Agent 尚未执行任何操作。配置 AI 后，Agent 将在有学习数据时自动运行。'
                : '当前筛选条件下没有记录'}
            </p>
            {logs.length === 0 && auth.role === 'student' && (
              <button
                className="btn btn-primary"
                onClick={handleRunCycle}
                disabled={running}
                style={{ marginTop: 12 }}
              >
                {running ? '分析中...' : '立即触发 Agent 分析'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {/* Timeline line */}
          <div
            style={{
              position: 'absolute',
              left: 20,
              top: 0,
              bottom: 0,
              width: 2,
              background: '#e5e7eb'
            }}
          />

          {filteredLogs.map((log, index) => (
            <div
              key={log.id}
              style={{
                display: 'flex',
                gap: 16,
                marginBottom: index < filteredLogs.length - 1 ? 12 : 0,
                position: 'relative'
              }}
            >
              {/* Timeline dot */}
              <div style={{ flexShrink: 0, paddingTop: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: `${getStatusColor(log.status)}20`,
                    border: `2px solid ${getStatusColor(log.status)}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    position: 'relative',
                    zIndex: 1
                  }}
                >
                  {getActionIcon(log.action_type)}
                </div>
              </div>

              {/* Log Card */}
              <div
                className="card"
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderLeft: `3px solid ${getStatusColor(log.status)}`
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 6,
                    gap: 8
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>
                      {getActionLabel(log.action_type)}
                    </span>
                    <span
                      className="badge"
                      style={{
                        background: `${getStatusColor(log.status)}20`,
                        color: getStatusColor(log.status)
                      }}
                    >
                      {getStatusLabel(log.status)}
                    </span>
                    <span className="badge badge-gray">{getTriggerLabel(log.trigger_type)}</span>
                    {log.model_used && (
                      <span className="badge badge-blue" style={{ fontSize: 10 }}>
                        {log.model_used.split('/').pop() || log.model_used}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {formatDateTime(log.create_time)}
                  </span>
                </div>

                {log.action_detail && (
                  <p
                    style={{
                      fontSize: 13,
                      color: '#374151',
                      lineHeight: 1.6,
                      background: '#f9fafb',
                      padding: '8px 12px',
                      borderRadius: 6,
                      marginTop: 4,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}
                  >
                    {log.action_detail}
                  </p>
                )}
              </div>
            </div>
          ))}

          {/* Load more */}
          {filteredLogs.length >= limit && (
            <div style={{ textAlign: 'center', marginTop: 16, paddingLeft: 56 }}>
              <button
                className="btn btn-secondary"
                onClick={() => setLimit((l) => l + 50)}
              >
                加载更多
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AgentLogs
