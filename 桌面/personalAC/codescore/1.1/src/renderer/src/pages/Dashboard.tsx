import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAuth } from '../App'
import {
  planApi,
  dataApi,
  agentApi,
  botApi,
  emailApi,
  workspaceApi,
  type Plan,
  type SummaryData,
  type AgentLog,
  type EmailStatus,
  type WorkspaceStats
} from '../api/ipc'

function Dashboard(): React.ReactElement {
  const auth = getAuth()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [botCount, setBotCount] = useState(0)
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null)
  const [workspaceStats, setWorkspaceStats] = useState<WorkspaceStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [runningCycle, setRunningCycle] = useState(false)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async (): Promise<void> => {
    if (!auth.token || !auth.userId) return
    setLoading(true)
    try {
      // Active plan
      const planResult = await planApi.getActive(auth.token, auth.userId)
      if (planResult.success && planResult.data) {
        setPlan(planResult.data as Plan)
      }

      // Summary last 30 days
      const now = Date.now()
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000
      const summaryResult = await dataApi.getSummary(auth.token, auth.userId, thirtyDaysAgo, now)
      if (summaryResult.success && summaryResult.data) {
        setSummary(summaryResult.data as SummaryData)
      }

      // Agent logs (student or admin)
      if (auth.role === 'student' || auth.role === 'admin') {
        const logsResult = await agentApi.getLogs(auth.userId, 5)
        if (logsResult.success && logsResult.data) {
          setLogs(logsResult.data as AgentLog[])
        }
      }

      // Admin-only: bot count, email status, workspace stats
      if (auth.role === 'admin') {
        const botsResult = await botApi.listBots(auth.token)
        if (botsResult.success && Array.isArray(botsResult.data)) {
          setBotCount(
            (botsResult.data as { status: string }[]).filter((b) => b.status === 'active').length
          )
        }

        const emailResult = await emailApi.getStatus()
        if (emailResult.success && emailResult.data) {
          setEmailStatus(emailResult.data as EmailStatus)
        }

        const wsResult = await workspaceApi.getStats()
        if (wsResult.success && wsResult.data) {
          setWorkspaceStats(wsResult.data as WorkspaceStats)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRunCycle = async (): Promise<void> => {
    if (!auth.userId || runningCycle) return
    setRunningCycle(true)
    try {
      await agentApi.runCycle(auth.userId)
      setTimeout(() => {
        if (auth.token && auth.userId) {
          agentApi.getLogs(auth.userId, 5).then((r) => {
            if (r.success && r.data) setLogs(r.data as AgentLog[])
          })
        }
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
      no_action: '无动作'
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
        <h1>欢迎回来，{auth.username}</h1>
        <p>
          {auth.role === 'admin'
            ? '管理员视图'
            : auth.role === 'guardian'
              ? '监护人视图'
              : '学生视图'}
        </p>
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
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>当前学习方向</h2>
            <Link to="/plans" style={{ fontSize: 12, color: '#4f46e5' }}>
              管理方向 →
            </Link>
          </div>

          {plan ? (
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{plan.title}</div>
              {plan.description && (
                <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 10 }}>
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
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <div className="empty-icon">🎯</div>
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
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>薄弱知识点 Top 3</h2>

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
                      <span style={{ color: '#9ca3af', marginRight: 6 }}>[{wp.subject}]</span>
                      {wp.topic}
                    </span>
                    <span style={{ color: '#ef4444', fontWeight: 600 }}>
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
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <div className="empty-icon">✅</div>
              <p style={{ fontSize: 13 }}>暂无薄弱知识点数据</p>
            </div>
          )}
        </div>
      </div>

      {/* Agent Logs */}
      {(auth.role === 'student' || auth.role === 'admin') && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>最近 Agent 行为</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {auth.role === 'student' && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleRunCycle}
                  disabled={runningCycle}
                >
                  {runningCycle ? '运行中...' : '触发分析'}
                </button>
              )}
              <Link to="/agent-logs" style={{ fontSize: 12, color: '#4f46e5' }}>
                查看全部 →
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
                    borderBottom: '1px solid #f3f4f6',
                    alignItems: 'flex-start'
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: log.status === 'success' ? '#10b981' : '#ef4444',
                      marginTop: 5,
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
                      <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>
                        {formatTime(log.create_time)}
                      </span>
                    </div>
                    {log.action_detail && (
                      <p
                        style={{
                          fontSize: 12,
                          color: '#6b7280',
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
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <div className="empty-icon">🤖</div>
              <p style={{ fontSize: 13 }}>Agent 尚未执行任何操作</p>
            </div>
          )}
        </div>
      )}

      {/* Admin System Status */}
      {auth.role === 'admin' && (
        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>系统状态</h2>
          <div className="grid-3">
            {/* Bot Status */}
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Bot 状态</div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>
                <span style={{ color: botCount > 0 ? '#10b981' : '#9ca3af' }}>
                  {botCount} 个在线
                </span>
              </div>
              <Link
                to="/config"
                style={{ fontSize: 12, color: '#4f46e5', display: 'block', marginTop: 4 }}
              >
                管理 Bot →
              </Link>
            </div>

            {/* Email Status */}
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>邮件轮询</div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>
                {emailStatus ? (
                  <span style={{ color: emailStatus.polling ? '#10b981' : '#9ca3af' }}>
                    {emailStatus.polling ? '轮询中' : '已停止'}
                  </span>
                ) : (
                  <span style={{ color: '#9ca3af' }}>未配置</span>
                )}
              </div>
              {emailStatus?.lastCheck && (
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                  上次检查: {new Date(emailStatus.lastCheck).toLocaleTimeString('zh-CN')}
                </div>
              )}
            </div>

            {/* Workspace Usage */}
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Workspace 占用</div>
              {workspaceStats ? (
                <>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    {formatBytes(workspaceStats.usage)}
                    <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 400 }}>
                      {' '}/ {formatBytes(workspaceStats.limit)}
                    </span>
                  </div>
                  <div className="progress-bar" style={{ marginTop: 6 }}>
                    <div
                      className={`progress-bar-fill ${workspaceStats.usagePercent > 80 ? 'danger' : workspaceStats.usagePercent > 60 ? 'warning' : 'success'}`}
                      style={{ width: `${workspaceStats.usagePercent}%` }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                    {workspaceStats.usagePercent}% 已使用
                  </div>
                </>
              ) : (
                <span style={{ color: '#9ca3af', fontSize: 13 }}>加载中...</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
