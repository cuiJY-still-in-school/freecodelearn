import React, { useEffect, useState } from 'react'
import { agentApi, type AgentLog } from '../api/http'
import { useToast } from '../context/ToastContext'

const ACTION_TYPE_OPTIONS = [
  { value: 'all', label: '全部类型' },
  { value: 'push_suggestion', label: '推送建议' },
  { value: 'send_bot_message', label: '发送消息' },
  { value: 'set_schedule', label: '设置定时' },
  { value: 'update_weakness', label: '更新薄弱点' },
  { value: 'no_action', label: '无动作' },
  { value: 'proactive_report', label: '主动报告' },
  { value: 'daily_review', label: '每日回顾' },
  { value: 'weakness_quiz', label: '薄弱点测验' },
  { value: 'generate_diagram', label: '生成图表' },
  { value: 'resource_brief', label: '资源简报' }
]

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'pending', label: '进行中' }
]

function AgentLogs(): React.ReactElement {
  const { toast } = useToast()
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const [actionTypeFilter, setActionTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [limit, setLimit] = useState(50)

  useEffect(() => {
    loadLogs()
  }, [limit])

  const loadLogs = async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await agentApi.getLogs(limit)
      if (result.success && Array.isArray(result.data)) {
        setLogs(result.data as AgentLog[])
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRunCycle = async (): Promise<void> => {
    if (running) return
    setRunning(true)
    try {
      await agentApi.runCycle()
      toast('Agent 执行完毕，正在刷新日志…', 'info')
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

  const getTriggerLabel = (type: string): string => {
    if (type === 'autonomous') return '自主触发'
    if (type.startsWith('schedule:')) return '定时触发'
    if (type === 'event') return '事件触发'
    if (type === 'manual') return '手动触发'
    return type
  }

  const getStatusBadgeClass = (status: string): string => {
    if (status === 'success') return 'badge badge-green'
    if (status === 'failed') return 'badge badge-red'
    return 'badge badge-yellow'
  }

  const getStatusLabel = (status: string): string => {
    if (status === 'success') return '成功'
    if (status === 'failed') return '失败'
    return '进行中'
  }

  const getStatusDotColor = (status: string): string => {
    if (status === 'success') return 'var(--success)'
    if (status === 'failed') return 'var(--danger)'
    return 'var(--warning)'
  }

  const successCount = logs.filter((l) => l.status === 'success').length
  const failedCount = logs.filter((l) => l.status === 'failed').length
  const pushCount = logs.filter((l) => l.action_type === 'push_suggestion').length

  return (
    <div className="page-enter">
      {/* ── Page Header ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 28,
          paddingBottom: 20,
          borderBottom: '1px solid var(--border)'
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: '-0.035em',
              color: 'var(--text)',
              lineHeight: 1.2
            }}
          >
            Agent 日志
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 5, fontSize: 13 }}>
            AI Agent 自主决策与执行的完整行为记录
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={loadLogs}
            disabled={loading}
            style={{ color: 'var(--text-secondary)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
              <path d="M3 21v-5h5"/>
            </svg>
            刷新
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleRunCycle} disabled={running}>
            {running ? (
              <>
                <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
                分析中...
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                触发一次
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      {logs.length > 0 && (
        <div className="grid-4" style={{ marginBottom: 20 }}>
          <div className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: 'var(--primary-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary)',
                  flexShrink: 0
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </div>
              <span className="stat-label">总记录</span>
            </div>
            <div className="stat-value">{logs.length}</div>
            <div className="stat-sub">共 {filteredLogs.length} 条筛选结果</div>
          </div>

          <div className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: 'var(--success-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--success)',
                  flexShrink: 0
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <span className="stat-label">成功</span>
            </div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>{successCount}</div>
            <div className="stat-sub">成功率 {logs.length > 0 ? Math.round((successCount / logs.length) * 100) : 0}%</div>
          </div>

          <div className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: 'var(--danger-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--danger)',
                  flexShrink: 0
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </div>
              <span className="stat-label">失败</span>
            </div>
            <div className="stat-value" style={{ color: 'var(--danger)' }}>{failedCount}</div>
            <div className="stat-sub">失败率 {logs.length > 0 ? Math.round((failedCount / logs.length) * 100) : 0}%</div>
          </div>

          <div className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: 'var(--primary-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary)',
                  flexShrink: 0
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 11.23 19.79 19.79 0 0 1 1.61 2.62 2 2 0 0 1 3.59 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l.77-.77a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </div>
              <span className="stat-label">推送建议</span>
            </div>
            <div className="stat-value">{pushCount}</div>
            <div className="stat-sub">占总量 {logs.length > 0 ? Math.round((pushCount / logs.length) * 100) : 0}%</div>
          </div>
        </div>
      )}

      {/* ── Filter Toolbar ── */}
      <div
        className="card"
        style={{
          marginBottom: 16,
          padding: '10px 16px',
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center'
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>动作类型</span>
          <select
            className="form-control"
            value={actionTypeFilter}
            onChange={(e) => setActionTypeFilter(e.target.value)}
            style={{ width: 'auto', padding: '4px 28px 4px 8px', fontSize: 12 }}
          >
            {ACTION_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>状态</span>
          <select
            className="form-control"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 'auto', padding: '4px 28px 4px 8px', fontSize: 12 }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>显示条数</span>
          <select
            className="form-control"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ width: 'auto', padding: '4px 28px 4px 8px', fontSize: 12 }}
          >
            <option value={20}>20 条</option>
            <option value={50}>50 条</option>
            <option value={100}>100 条</option>
          </select>
        </div>

        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {filteredLogs.length} / {logs.length} 条
        </span>
      </div>

      {/* ── Timeline / Loading / Empty ── */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ display: 'flex', gap: 14 }}>
              <div className="skeleton" style={{ width: 40, height: 38, borderRadius: 6, flexShrink: 0 }} />
              <div className="skeleton" style={{ flex: 1, height: 56, borderRadius: 8 }} />
            </div>
          ))}
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <h3>暂无日志记录</h3>
            <p>
              {logs.length === 0
                ? 'Agent 尚未执行任何操作。配置 AI 后，Agent 将在有学习数据时自动运行。'
                : '当前筛选条件下没有记录'}
            </p>
            {logs.length === 0 && (
              <button
                className="btn btn-primary btn-sm"
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
          {/* Vertical timeline spine */}
          <div
            style={{
              position: 'absolute',
              left: 19,
              top: 16,
              bottom: 16,
              width: 2,
              background: 'var(--border)',
              borderRadius: 1
            }}
          />

          {filteredLogs.map((log, index) => (
            <div
              key={log.id}
              style={{
                display: 'flex',
                gap: 14,
                marginBottom: index < filteredLogs.length - 1 ? 8 : 0,
                position: 'relative'
              }}
            >
              {/* Status dot on timeline */}
              <div style={{ flexShrink: 0, paddingTop: 12, width: 40, display: 'flex', justifyContent: 'center' }}>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: getStatusDotColor(log.status),
                    border: `2px solid var(--bg)`,
                    boxShadow: `0 0 0 2px ${getStatusDotColor(log.status)}`,
                    position: 'relative',
                    zIndex: 1,
                    flexShrink: 0
                  }}
                />
              </div>

              {/* Log card */}
              <div
                className="card"
                style={{
                  flex: 1,
                  padding: '11px 15px',
                  borderLeft: `2px solid ${getStatusDotColor(log.status)}`,
                  marginBottom: 0
                }}
              >
                {/* Header row */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: log.action_detail ? 8 : 0
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                      {getActionLabel(log.action_type)}
                    </span>
                    <span className={getStatusBadgeClass(log.status)}>
                      {getStatusLabel(log.status)}
                    </span>
                    <span className="badge badge-gray">{getTriggerLabel(log.trigger_type)}</span>
                    {log.model_used && (
                      <span className="badge badge-blue" style={{ fontSize: 10 }}>
                        {log.model_used.split('/').pop() ?? log.model_used}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                      fontVariantNumeric: 'tabular-nums'
                    }}
                  >
                    {formatDateTime(log.create_time)}
                  </span>
                </div>

                {/* Detail block */}
                {log.action_detail && (
                  <p
                    style={{
                      fontSize: 12.5,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.65,
                      background: 'var(--bg)',
                      padding: '8px 11px',
                      borderRadius: 'var(--radius)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      border: '1px solid var(--border)',
                      margin: 0
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
            <div style={{ textAlign: 'center', marginTop: 16, paddingLeft: 54 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setLimit((l) => l + 50)}
                style={{ color: 'var(--text-secondary)' }}
              >
                加载更多
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AgentLogs
