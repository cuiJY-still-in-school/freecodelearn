import React, { useEffect, useState } from 'react'
import { agentApi, type AgentTask } from '../api/http'
import { AgentOutput, type AgentOutputData } from '../components/AgentOutput'
import { useToast } from '../context/ToastContext'

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

function getStatusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    pending: 'badge badge-yellow',
    running: 'badge badge-blue',
    completed: 'badge badge-green',
    failed: 'badge badge-red'
  }
  return map[status] || 'badge badge-gray'
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '等待中',
    running: '运行中',
    completed: '已完成',
    failed: '失败'
  }
  return labels[status] || status
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

function formatDateTime(dt: string | number | null): string {
  if (!dt) return '-'
  return new Date(dt).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/* ── Task type icon map ── */
function TaskTypeIcon({ type }: { type: string }): React.ReactElement {
  const icons: Record<string, React.ReactElement> = {
    proactive_report: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
    resource_brief: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
    ),
    daily_review: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    weakness_quiz: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
    generate_diagram: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    ),
    sandbox_run: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/>
        <polyline points="8 6 2 12 8 18"/>
      </svg>
    )
  }
  return icons[type] ?? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  )
}

function TaskCard({ task }: { task: AgentTask }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const output = parseOutput(task.output)

  const isRunning = task.status === 'running'

  return (
    <div
      className="card card-hover"
      style={{ marginBottom: 8, cursor: 'pointer', padding: '14px 18px' }}
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
        <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0 }}>
          {/* Type icon */}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              flexShrink: 0,
              marginTop: 1
            }}
          >
            <TaskTypeIcon type={task.task_type} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                flexWrap: 'wrap',
                marginBottom: 3
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                {TASK_TYPE_LABELS[task.task_type] ?? task.task_type}
              </span>
              <span className={getStatusBadgeClass(task.status)}>
                {isRunning && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'currentColor',
                      marginRight: 4,
                      animation: 'pulse 1.2s ease-in-out infinite'
                    }}
                  />
                )}
                {getStatusLabel(task.status)}
              </span>
              {task.trigger_type && (
                <span className="badge badge-gray">
                  {TRIGGER_TYPE_LABELS[task.trigger_type] ?? task.trigger_type}
                </span>
              )}
            </div>
            {task.input_summary && (
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
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
        </div>

        {/* Right meta */}
        <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {formatDateTime(task.started_at || task.create_time)}
          </span>
          <span
            style={{
              fontSize: 11,
              color: expanded ? 'var(--primary)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              transition: 'color 0.15s'
            }}
          >
            {expanded ? '收起' : '展开'}
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s'
              }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </span>
        </div>
      </div>

      {/* Expanded Output */}
      {expanded && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: '1px solid var(--border)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {task.error && (
            <div className="alert alert-error" style={{ marginBottom: 12 }}>
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
                color: 'var(--text-muted)',
                fontSize: 13,
                background: 'var(--bg)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)'
              }}
            >
              {task.status === 'pending' || task.status === 'running'
                ? '任务尚未完成，输出生成中...'
                : '暂无输出'}
            </div>
          )}
          {task.completed_at && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, textAlign: 'right' }}>
              完成时间：{formatDateTime(task.completed_at)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AgentTasks(): React.ReactElement {
  const { toast } = useToast()
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)

  const PAGE_SIZE = 20

  useEffect(() => {
    loadTasks()
  }, [statusFilter, page])

  const loadTasks = async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await agentApi.getTasks(
        statusFilter === 'all' ? undefined : statusFilter,
        page,
        PAGE_SIZE
      )
      if (result.success && result.data) {
        const data = result.data as { total: number; tasks: AgentTask[] }
        setTasks(data.tasks || [])
        setTotal(data.total || 0)
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleTriggerReport = async (): Promise<void> => {
    if (triggering) return
    setTriggering(true)
    try {
      const result = await agentApi.runProactiveReport()
      if (result.success) {
        toast('主动报告任务已触发，请稍后刷新查看结果', 'info')
        setTimeout(() => { setPage(1); loadTasks() }, 3000)
      } else {
        toast(result.error || '触发失败', 'error')
      }
    } finally {
      setTriggering(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

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
            主动任务
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 5, fontSize: 13 }}>
            Agent 生成的资源简报、每日回顾与薄弱点测验
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={loadTasks}
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
          <button
            className="btn btn-primary btn-sm"
            onClick={handleTriggerReport}
            disabled={triggering}
          >
            {triggering ? (
              <>
                <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
                触发中...
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                触发主动报告
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Filter + Count bar ── */}
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
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>状态</span>
          <select
            className="form-control"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            style={{ width: 'auto', padding: '4px 28px 4px 8px', fontSize: 12 }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          共 {total} 条任务
        </span>
      </div>

      {/* ── Task List ── */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 10 }} />)}
        </div>
      ) : tasks.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <h3>暂无主动任务</h3>
            <p>
              当系统收到新资源时，Agent 会自动生成简报。你也可以手动触发主动报告。
            </p>
            <button
              className="btn btn-primary btn-sm"
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

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 8,
                marginTop: 16
              }}
            >
              <button
                className="btn btn-ghost btn-sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                style={{ color: 'var(--text-secondary)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
                上一页
              </button>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  padding: '4px 10px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius)',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {page} / {totalPages}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                style={{ color: 'var(--text-secondary)' }}
              >
                下一页
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>
          )}
        </>
      )}

      {/* Pulse keyframe for running badge dot */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}

export default AgentTasks
