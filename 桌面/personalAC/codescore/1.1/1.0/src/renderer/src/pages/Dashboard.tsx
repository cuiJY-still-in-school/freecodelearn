import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAuth } from '../App'
import { planApi, dataApi, agentApi, botApi, type Plan, type SummaryData, type AgentLog } from '../api/ipc'

function Dashboard(): React.ReactElement {
  const auth = getAuth()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [botCount, setBotCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [runningCycle, setRunningCycle] = useState(false)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async (): Promise<void> => {
    if (!auth.token || !auth.userId) return
    setLoading(true)
    try {
      // Load active plan
      const planResult = await planApi.getActive(auth.token, auth.userId)
      if (planResult.success && planResult.data) {
        setPlan(planResult.data as Plan)
      }

      // Load summary (last 30 days)
      const now = Date.now()
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000
      const summaryResult = await dataApi.getSummary(auth.token, auth.userId, thirtyDaysAgo, now)
      if (summaryResult.success && summaryResult.data) {
        setSummary(summaryResult.data as SummaryData)
      }

      // Load agent logs (student only)
      if (auth.role === 'student' || auth.role === 'admin') {
        const logsResult = await agentApi.getLogs(auth.userId, 5)
        if (logsResult.success && logsResult.data) {
          setLogs(logsResult.data as AgentLog[])
        }
      }

      // Load bot count (admin only)
      if (auth.role === 'admin') {
        const botsResult = await botApi.listBots(auth.token)
        if (botsResult.success && Array.isArray(botsResult.data)) {
          setBotCount((botsResult.data as { status: string }[]).filter((b) => b.status === 'active').length)
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
      // Reload logs after a moment
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

  const getStatusBadge = (status: string): React.ReactElement => {
    if (status === 'success') return <span className="badge badge-green">成功</span>
    if (status === 'failed') return <span className="badge badge-red">失败</span>
    return <span className="badge badge-yellow">进行中</span>
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
        <h1>
          欢迎回来，{auth.username} 👋
        </h1>
        <p>
          {auth.role === 'admin'
            ? '管理员视图 · 管理整个系统'
            : auth.role === 'teacher'
              ? '教师视图 · 查看学习数据与资源'
              : auth.role === 'guardian'
                ? '监护人视图 · 监督学生学习进度'
                : '学生视图 · 查看你的学习状态'}
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">本月学习次数</div>
          <div className="stat-value">{summary?.totalSessions ?? 0}</div>
          <div className="stat-sub">过去 30 天</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">本月学习时长</div>
          <div className="stat-value">{summary?.totalMinutes ?? 0}</div>
          <div className="stat-sub">分钟</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">平均得分</div>
          <div className="stat-value">
            {summary?.avgScore != null ? Math.round(summary.avgScore) : '-'}
          </div>
          <div className="stat-sub">满分 100</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">薄弱知识点</div>
          <div className="stat-value">{summary?.weakPoints.length ?? 0}</div>
          <div className="stat-sub">待加强</div>
        </div>
      </div>

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
            <Link
              to="/plans"
              style={{ fontSize: 12, color: '#4f46e5' }}
            >
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

        {/* Weak Points */}
        <div className="card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>薄弱知识点 Top 5</h2>
          </div>

          {summary?.weakPoints && summary.weakPoints.length > 0 ? (
            <div>
              {summary.weakPoints.slice(0, 5).map((wp, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
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
        <div className="card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>🤖 最近 Agent 行为</h2>
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
                    padding: '10px 0',
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
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        {getStatusBadge(log.status)}
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>
                          {formatTime(log.create_time)}
                        </span>
                      </div>
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

      {/* Admin: Bot Status */}
      {auth.role === 'admin' && (
        <div className="card" style={{ marginTop: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>💬 Bot 状态</h2>
            <Link to="/bots" style={{ fontSize: 12, color: '#4f46e5' }}>
              管理 Bot →
            </Link>
          </div>
          <div style={{ fontSize: 14, color: '#6b7280' }}>
            当前活跃 Bot：
            <span style={{ fontWeight: 600, color: botCount > 0 ? '#10b981' : '#9ca3af' }}>
              {botCount} 个
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
