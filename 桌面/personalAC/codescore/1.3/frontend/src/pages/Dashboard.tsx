import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  planApi,
  dataApi,
  agentApi,
  emailApi,
  settingsApi,
  workspaceApi,
  type Plan,
  type SummaryData,
  type AgentLog,
  type EmailStatus,
  type WorkspaceStats,
  type AIConfig
} from '../api/http'

function Dashboard(): React.ReactElement {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null)
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null)
  const [workspaceStats, setWorkspaceStats] = useState<WorkspaceStats | null>(null)
  const [taskCount, setTaskCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [runningCycle, setRunningCycle] = useState(false)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async (): Promise<void> => {
    setLoading(true)
    try {
      const planResult = await planApi.getActive()
      if (planResult.success && planResult.data) {
        setPlan(planResult.data as Plan)
      }

      const now = Date.now()
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000
      const summaryResult = await dataApi.getSummary(thirtyDaysAgo, now)
      if (summaryResult.success && summaryResult.data) {
        setSummary(summaryResult.data as SummaryData)
      }

      const logsResult = await agentApi.getLogs(5)
      if (logsResult.success && logsResult.data) {
        setLogs(logsResult.data as AgentLog[])
      }

      const aiResult = await settingsApi.getAIConfig()
      if (aiResult.success && aiResult.data) {
        setAiConfig(aiResult.data as AIConfig)
      }

      const emailResult = await emailApi.getStatus()
      if (emailResult.success && emailResult.data) {
        setEmailStatus(emailResult.data as EmailStatus)
      }

      const wsResult = await workspaceApi.getStats()
      if (wsResult.success && wsResult.data) {
        setWorkspaceStats(wsResult.data as WorkspaceStats)
      }

      const tasksResult = await agentApi.getTasks('completed', 1, 1)
      if (tasksResult.success && tasksResult.data) {
        const d = tasksResult.data as { total: number }
        setTaskCount(d.total ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRunCycle = async (): Promise<void> => {
    if (runningCycle) return
    setRunningCycle(true)
    try {
      await agentApi.runCycle()
      setTimeout(() => {
        agentApi.getLogs(5).then((r) => {
          if (r.success && r.data) setLogs(r.data as AgentLog[])
        })
      }, 2000)
    } finally {
      setRunningCycle(false)
    }
  }

  const formatTime = (ts: number): string => {
    const d = new Date(ts)
    return d.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getActionLabel = (type: string): string => {
    const map: Record<string, string> = {
      push_suggestion: '推送建议',
      send_bot_message: '发送消息',
      set_schedule: '设置定时',
      update_weakness: '更新薄弱点',
      no_action: '无动作',
      proactive_report: '主动报告',
      daily_review: '每日回顾',
      weakness_quiz: '薄弱点测验',
      generate_diagram: '生成图表',
      resource_brief: '资源简报'
    }
    return map[type] || type
  }

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
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
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1>仪表盘</h1>
          <span
            style={{
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: 4,
              letterSpacing: '0.03em',
              border: '1px solid rgba(79,70,229,0.2)'
            }}
          >
            SuperAdmin
          </span>
        </div>
        <p>欢迎回来，全功能访问已启用</p>
      </div>

      {/* Active Plan + Weak Points */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Active Plan */}
        <div className="card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16
            }}
          >
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>当前学习方向</h2>
            <Link to="/plans" style={{ fontSize: 12, color: 'var(--primary)' }}>
              管理方向
            </Link>
          </div>

          {plan ? (
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{plan.title}</div>
              {plan.description && (
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 10 }}>
                  {plan.description}
                </p>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {plan.subjects.map((s) => (
                  <span key={s} className="tag">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '20px 0' }}>
              <div className="empty-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <p style={{ fontSize: 13 }}>尚未设置学习方向</p>
              <Link to="/plans">
                <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }}>
                  设置方向
                </button>
              </Link>
            </div>
          )}
        </div>

        {/* Weak Points Top 3 */}
        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>薄弱知识点 Top 3</h2>

          {summary?.weakPoints && summary.weakPoints.length > 0 ? (
            <div>
              {summary.weakPoints.slice(0, 3).map((wp, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 4,
                      fontSize: 13
                    }}
                  >
                    <span>
                      <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>[{wp.subject}]</span>
                      {wp.topic}
                    </span>
                    <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                      {Math.round(wp.weakness_score * 100)}%
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className={`progress-bar-fill ${wp.weakness_score > 0.7 ? 'danger' : wp.weakness_score > 0.4 ? 'warning' : 'success'}`}
                      style={{ width: `${wp.weakness_score * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '20px 0' }}>
              <div className="empty-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <p style={{ fontSize: 13 }}>暂无薄弱知识点数据</p>
            </div>
          )}
        </div>
      </div>

      {/* Agent Logs */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>最近 Agent 行为</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleRunCycle}
              disabled={runningCycle}
            >
              {runningCycle ? '运行中...' : '触发分析'}
            </button>
            <Link to="/agent-logs" style={{ fontSize: 12, color: 'var(--primary)' }}>
              查看全部
            </Link>
          </div>
        </div>

        {logs.length > 0 ? (
          <div>
            {logs.map((log) => (
              <div
                key={log.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                  alignItems: 'flex-start'
                }}
              >
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: log.status === 'success' ? 'var(--success)' : 'var(--danger)',
                    marginTop: 6,
                    flexShrink: 0
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      marginBottom: 2
                    }}
                  >
                    <span style={{ fontWeight: 500, fontSize: 13 }}>
                      {getActionLabel(log.action_type)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                      {formatTime(log.create_time)}
                    </span>
                  </div>
                  {log.action_detail && (
                    <p
                      style={{
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {log.action_detail}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '20px 0' }}>
            <div className="empty-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <p style={{ fontSize: 13 }}>Agent 尚未执行任何操作</p>
          </div>
        )}
      </div>

      {/* System Status */}
      <div className="card">
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>系统状态</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {/* AI Config Status */}
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>AI 配置</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {aiConfig?.apiKey ? (
                <span style={{ color: 'var(--success)' }}>已配置</span>
              ) : (
                <span style={{ color: 'var(--warning)' }}>未配置</span>
              )}
            </div>
            {aiConfig?.modelId && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {aiConfig.modelId}
              </div>
            )}
            {!aiConfig?.apiKey && (
              <Link
                to="/config"
                style={{ fontSize: 12, color: 'var(--primary)', display: 'block', marginTop: 4 }}
              >
                前往配置
              </Link>
            )}
          </div>

          {/* Email Status */}
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>邮件轮询</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {emailStatus ? (
                <span style={{ color: emailStatus.polling ? 'var(--success)' : 'var(--text-muted)' }}>
                  {emailStatus.polling ? '轮询中' : '已停止'}
                </span>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>未配置</span>
              )}
            </div>
            {emailStatus?.lastCheck && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                上次: {new Date(emailStatus.lastCheck).toLocaleTimeString('zh-CN')}
              </div>
            )}
          </div>

          {/* Workspace Usage */}
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>磁盘剩余</div>
            {workspaceStats ? (
              <>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {workspaceStats.warning ? (
                    <span style={{ color: 'var(--danger)' }}>
                      {formatBytes(workspaceStats.diskFree)} 可用
                    </span>
                  ) : (
                    <span style={{ color: 'var(--success)' }}>
                      {formatBytes(workspaceStats.diskFree)} 可用
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  已用 {formatBytes(workspaceStats.usage ?? 0)}
                  {workspaceStats.warning && (
                    <span style={{ color: 'var(--warning)', marginLeft: 6 }}>空间不足</span>
                  )}
                </div>
              </>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>加载中...</span>
            )}
          </div>

          {/* Agent Task Count */}
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Agent 任务</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              <span style={{ color: taskCount > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                {taskCount} 个已完成
              </span>
            </div>
            <Link
              to="/agent-tasks"
              style={{ fontSize: 12, color: 'var(--primary)', display: 'block', marginTop: 4 }}
            >
              查看记录
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
