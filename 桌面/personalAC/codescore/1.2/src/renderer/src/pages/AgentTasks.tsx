import React, { useEffect, useState } from 'react'
import { agentApi, type AgentTask } from '../api/ipc'
import { AgentOutput, type AgentOutputData } from '../components/AgentOutput'

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '等待中' },
  { value: 'running', label: '运行中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' }
]

const TASK_TYPE_LABELS: Record<string, string> = {
  proactive_report: '主动报告',
  resource_brief: '资源简报',
  daily_review: '每日回顾',
  weakness_quiz: '薄弱点测验',
  generate_diagram: '生成图表',
  sandbox_run: '沙盒运行'
}

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  email_resource: '邮件资源',
  workspace_update: '工作区更新',
  scheduled: '定时触发',
  manual: '手动触发'
}

function getStatusStyle(status: string): { bg: string; color: string; label: string } {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: '#fef3c7', color: '#92400e', label: '等待中' },
    running: { bg: '#dbeafe', color: '#1d4ed8', label: '运行中' },
    completed: { bg: '#d1fae5', color: '#065f46', label: '已完成' },
    failed: { bg: '#fee2e2', color: '#991b1b', label: '失败' }
  }
  return styles[status] || { bg: '#f3f4f6', color: '#6b7280', label: status }
}

function parseOutput(outputStr: string | null): AgentOutputData | null {
  if (!outputStr) return null
  try {
    const parsed = JSON.parse(outputStr) as AgentOutputData
    if (parsed.type && parsed.content !== undefined) {
      return parsed
    }
    return { type: 'text', content: outputStr }
  } catch {
    return { type: 'text', content: outputStr }
  }
}

function formatDateTime(dt: string | null): string {
  if (!dt) return '-'
  return new Date(dt).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function TaskCard({ task }: { task: AgentTask }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const statusStyle = getStatusStyle(task.status)
  const output = parseOutput(task.output)

  return (
    <div
      className="card"
      style={{ marginBottom: 10, cursor: 'pointer' }}
      onClick={() => setExpanded((e) => !e)}
    >
      {/* Task Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              {TASK_TYPE_LABELS[task.task_type] || task.task_type}
            </span>
            <span
              style={{
                background: statusStyle.bg,
                color: statusStyle.color,
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 10
              }}
            >
              {statusStyle.label}
            </span>
            {task.trigger_type && (
              <span
                style={{
                  background: '#f3f4f6',
                  color: '#6b7280',
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 10
                }}
              >
                {TRIGGER_TYPE_LABELS[task.trigger_type] || task.trigger_type}
              </span>
            )}
          </div>
          {task.input_summary && (
            <p
              style={{
                fontSize: 12,
                color: '#6b7280',
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {task.input_summary}
            </p>
          )}
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>
            {formatDateTime(task.started_at || task.create_time)}
          </div>
          <div
            style={{
              fontSize: 11,
              color: expanded ? '#4f46e5' : '#9ca3af',
              marginTop: 4
            }}
          >
            {expanded ? '收起 ▲' : '展开查看输出 ▼'}
          </div>
        </div>
      </div>

      {/* Expanded Output */}
      {expanded && (
        <div
          style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f3f4f6' }}
          onClick={(e) => e.stopPropagation()}
        >
          {task.error && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 13,
                color: '#dc2626',
                marginBottom: 12
              }}
            >
              <strong>错误：</strong>{task.error}
            </div>
          )}
          {output ? (
            <AgentOutput output={output} />
          ) : (
            <div
              style={{
                padding: '20px',
                textAlign: 'center',
                color: '#9ca3af',
                fontSize: 13,
                background: '#f9fafb',
                borderRadius: 8
              }}
            >
              {task.status === 'pending' || task.status === 'running'
                ? '任务尚未完成，输出生成中...'
                : '暂无输出'}
            </div>
          )}
          {task.completed_at && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 10, textAlign: 'right' }}>
              完成时间：{formatDateTime(task.completed_at)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AgentTasks(): React.ReactElement {
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const PAGE_SIZE = 20

  useEffect(() => {
    loadTasks()
  }, [statusFilter, page])

  const loadTasks = async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const result = await agentApi.getTasks(
        statusFilter === 'all' ? undefined : statusFilter,
        page,
        PAGE_SIZE
      )
      if (result.success && result.data) {
        const data = result.data as { total: number; items: AgentTask[] }
        setTasks(data.items || [])
        setTotal(data.total || 0)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const handleTriggerReport = async (): Promise<void> => {
    if (triggering) return
    setTriggering(true)
    setError('')
    setSuccess('')
    try {
      const result = await agentApi.runProactiveReport()
      if (result.success) {
        setSuccess('主动报告任务已触发，请稍后刷新查看结果')
        setTimeout(() => {
          setPage(1)
          loadTasks()
        }, 3000)
      } else {
        setError(result.error || '触发失败')
      }
    } finally {
      setTriggering(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      <div
        className="page-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <div>
          <h1>Agent 主动任务</h1>
          <p>查看 Agent 生成的资源简报、每日回顾和薄弱点测验</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-primary"
            onClick={handleTriggerReport}
            disabled={triggering}
          >
            {triggering ? '触发中...' : '⚡ 手动触发主动报告'}
          </button>
          <button className="btn btn-secondary" onClick={loadTasks} disabled={loading}>
            🔄 刷新
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

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
          <span style={{ fontSize: 13, color: '#6b7280' }}>状态筛选：</span>
          <select
            className="form-control"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 'auto' }}>
          共 {total} 条任务
        </span>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="loading">
          <div className="spinner" />
          加载中...
        </div>
      ) : tasks.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">⚡</div>
            <h3>暂无主动任务</h3>
            <p>
              当系统收到新资源时，Agent 会自动生成简报。你也可以手动触发主动报告。
            </p>
            <button
              className="btn btn-primary"
              onClick={handleTriggerReport}
              disabled={triggering}
              style={{ marginTop: 12 }}
            >
              {triggering ? '触发中...' : '手动触发主动报告'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 8,
                marginTop: 16
              }}
            >
              <button
                className="btn btn-secondary btn-sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                上一页
              </button>
              <span style={{ fontSize: 13, color: '#6b7280', lineHeight: '32px' }}>
                {page} / {totalPages}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default AgentTasks
