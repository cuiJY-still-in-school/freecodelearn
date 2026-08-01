import React, { useEffect, useState } from 'react'
import { planApi, type Plan } from '../api/http'
import { useToast } from '../context/ToastContext'

const SUBJECT_OPTIONS = [
  '数学', '语文', '英语', '物理', '化学', '生物',
  '历史', '地理', '政治', '计算机', '音乐', '体育', '美术', '其他'
]

function Plans(): React.ReactElement {
  const { toast } = useToast()
  const [activePlan, setActivePlan] = useState<Plan | null>(null)
  const [allPlans, setAllPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subjects, setSubjects] = useState<string[]>([])

  useEffect(() => {
    loadPlans()
  }, [])

  const loadPlans = async (): Promise<void> => {
    setLoading(true)
    try {
      const activeResult = await planApi.getActive()
      if (activeResult.success && activeResult.data) {
        setActivePlan(activeResult.data as Plan)
      }

      const listResult = await planApi.list()
      if (listResult.success && Array.isArray(listResult.data)) {
        setAllPlans(listResult.data as Plan[])
      }
    } finally {
      setLoading(false)
    }
  }

  const handleToggleSubject = (subject: string): void => {
    setSubjects((prev) =>
      prev.includes(subject) ? prev.filter((s) => s !== subject) : [...prev, subject]
    )
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!title.trim()) { toast('请输入方向标题', 'error'); return }
    if (subjects.length === 0) { toast('请至少选择一个学习科目', 'error'); return }
    setSaving(true)
    try {
      const result = await planApi.create(title.trim(), description.trim(), subjects)
      if (result.success) {
        toast('学习方向已创建，旧方向已归档')
        setShowForm(false)
        setTitle('')
        setDescription('')
        setSubjects([])
        await loadPlans()
      } else {
        toast(result.error || '创建失败', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (ts: number): string =>
    new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })

  if (loading) {
    return (
      <div className="page-enter">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div className="skeleton" style={{ height: 28, width: 160, borderRadius: 6, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 16, width: 260, borderRadius: 4 }} />
          </div>
          <div className="skeleton" style={{ height: 34, width: 100, borderRadius: 6 }} />
        </div>
        <div className="skeleton" style={{ height: 20, width: 100, borderRadius: 4, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 100, borderRadius: 10, marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 20, width: 100, borderRadius: 4, marginBottom: 12 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2].map(i => <div key={i} className="skeleton" style={{ height: 70, borderRadius: 10 }} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="page-enter">
      <div
        className="page-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <div>
          <h1>学习方向管理</h1>
          <p>设置当前的学习目标和科目，Agent 将基于此提供个性化建议</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? '取消' : '创建新方向'}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>创建新学习方向</h2>
          <div
            style={{
              background: 'var(--warning-bg)',
              border: '1px solid var(--warning-border)',
              borderRadius: 'var(--radius)',
              padding: '8px 12px',
              fontSize: 12,
              color: 'var(--warning)',
              marginBottom: 16
            }}
          >
            创建新方向后，当前进行中方向将自动归档
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>方向标题 *</label>
              <input
                className="form-control"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：备战高考 / 大学数学强化"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>方向描述</label>
              <textarea
                className="form-control"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="描述这个学习方向的目标和计划（选填）"
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>学习科目 * （可多选）</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {SUBJECT_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleToggleSubject(s)}
                    style={{
                      padding: '5px 14px',
                      borderRadius: 'var(--radius)',
                      border: `1px solid ${subjects.includes(s) ? 'var(--primary)' : 'var(--border)'}`,
                      background: subjects.includes(s) ? 'var(--primary-light)' : 'var(--bg-card)',
                      color: subjects.includes(s) ? 'var(--primary)' : 'var(--text)',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: subjects.includes(s) ? 500 : 400,
                      transition: 'all 0.13s',
                      fontFamily: 'inherit'
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {subjects.length > 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                  已选：{subjects.join('、')}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? '保存中...' : '保存方向'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowForm(false)}
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Active Plan */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>当前激活方向</h2>
        {activePlan ? (
          <div
            className="card"
            style={{ borderLeft: '3px solid var(--primary)' }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 10
              }}
            >
              <div>
                <span className="badge badge-green" style={{ marginBottom: 8, display: 'inline-flex' }}>
                  进行中
                </span>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                  {activePlan.title}
                </h3>
                {activePlan.description && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{activePlan.description}</p>
                )}
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                创建于 {formatDate(activePlan.create_time)}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {activePlan.subjects.map((s) => (
                <span key={s} className="tag">
                  {s}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
              </div>
              <h3>尚未设置学习方向</h3>
              <p>点击右上角按钮创建你的第一个学习方向</p>
            </div>
          </div>
        )}
      </div>

      {/* History Plans */}
      {allPlans.filter((p) => p.status === 'archived').length > 0 && (
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
            历史方向
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {allPlans
              .filter((p) => p.status === 'archived')
              .map((p) => (
                <div
                  key={p.id}
                  className="card"
                  style={{ opacity: 0.7, borderLeft: '3px solid var(--border)' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start'
                    }}
                  >
                    <div>
                      <span className="badge badge-gray" style={{ marginBottom: 6, display: 'inline-flex' }}>
                        已归档
                      </span>
                      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{p.title}</h3>
                      {p.description && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.description}</p>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                      {formatDate(p.create_time)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                    {p.subjects.map((s) => (
                      <span
                        key={s}
                        style={{
                          padding: '2px 9px',
                          borderRadius: 4,
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-muted)',
                          fontSize: 12,
                          border: '1px solid var(--border)'
                        }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Plans
