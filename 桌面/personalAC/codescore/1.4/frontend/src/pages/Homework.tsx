import React, { useRef, useState } from 'react'
import { homeworkApi, type GradedProblem, type HomeworkResult } from '../api/http'
import { useToast } from '../context/ToastContext'

function ScoreRing({ pct }: { pct: number }): React.ReactElement {
  const r = 28, c = 2 * Math.PI * r
  const color = pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)'
  return (
    <svg width={70} height={70} viewBox="0 0 70 70">
      <circle cx="35" cy="35" r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
      <circle cx="35" cy="35" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${c * pct / 100} ${c}`}
        strokeDashoffset={c * 0.25}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      <text x="35" y="40" textAnchor="middle" fontSize="14" fontWeight="800" fill={color}>{pct}%</text>
    </svg>
  )
}

function ProblemCard({ p }: { p: GradedProblem }): React.ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      border: `1px solid ${p.correct ? 'var(--border)' : 'var(--danger-border)'}`,
      borderLeft: `3px solid ${p.correct ? 'var(--success)' : 'var(--danger)'}`,
      borderRadius: 8, padding: '10px 14px', marginBottom: 8, background: 'var(--bg-card)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: p.correct ? 'var(--success-bg)' : 'var(--danger-bg)',
            color: p.correct ? 'var(--success)' : 'var(--danger)'
          }}>
            第{p.index}题{' '}
            {p.correct ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginTop: -1 }}><polyline points="20 6 9 17 4 12"/></svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginTop: -1 }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            )}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: p.correct ? 400 : 600 }}>
            {p.question.length > 40 ? p.question.slice(0, 40) + '…' : p.question}
          </span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: p.correct ? 'var(--success)' : 'var(--danger)' }}>
          {p.score}/{p.maxScore}
        </span>
      </div>

      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>学生答案：<span style={{ color: 'var(--text)' }}>{p.studentAnswer || '（空）'}</span></div>
          {!p.correct && p.errorType && (
            <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'var(--danger-bg)', color: 'var(--danger)', marginBottom: 8, display: 'inline-block' }}>{p.errorType}</span>
          )}
          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, marginTop: 4 }}>{p.explanation}</div>
        </div>
      )}
    </div>
  )
}

export default function Homework(): React.ReactElement {
  const { toast } = useToast()
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<HomeworkResult | null>(null)
  const [imageData, setImageData] = useState<{ base64: string; mime: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { toast('请上传图片文件', 'error'); return }
    if (file.size > 10 * 1024 * 1024) { toast('图片不能超过 10MB', 'error'); return }
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      const base64 = dataUrl.split(',')[1]
      setPreview(dataUrl)
      setImageData({ base64, mime: file.type })
      setResult(null)
    }
    reader.readAsDataURL(file)
  }

  async function handleGrade() {
    if (!imageData) { toast('请先上传作业图片', 'error'); return }
    setLoading(true)
    try {
      const res = await homeworkApi.grade(imageData.base64, imageData.mime, subject || undefined)
      if (res.success && res.data) {
        setResult(res.data)
        toast('批改完成')
      } else {
        toast(res.error || '批改失败，请重试', 'error')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-enter">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.035em', color: 'var(--text)', marginBottom: 4 }}>作业批改</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>拍照上传作业，AI 自动识别题目并批改，同步更新知识点薄弱分析</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: preview ? '1fr 1fr' : '1fr', gap: 20, alignItems: 'start' }}>
        {/* 上传区 */}
        <div>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault(); setDragging(false)
              const file = e.dataTransfer.files[0]
              if (file) handleFile(file)
            }}
            style={{
              border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 12, padding: preview ? 0 : '48px 24px',
              textAlign: 'center', cursor: 'pointer',
              background: dragging ? 'var(--primary-light)' : 'var(--bg-card)',
              transition: 'all 0.15s', overflow: 'hidden',
              minHeight: preview ? 0 : 180
            }}
          >
            {preview ? (
              <img src={preview} alt="作业" style={{ width: '100%', display: 'block', borderRadius: 10 }} />
            ) : (
              <>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px' }}>
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>点击或拖拽上传作业照片</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>支持 JPG、PNG，最大 10MB</div>
              </>
            )}
          </div>
          <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

          {preview && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <input
                className="form-control"
                placeholder="科目（可选，如：数学）"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" onClick={handleGrade} disabled={loading} style={{ flexShrink: 0 }}>
                {loading ? (
                  <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .6s linear infinite', marginRight: 6, verticalAlign: 'middle' }} />批改中…</>
                ) : '开始批改'}
              </button>
              <button className="btn btn-secondary" onClick={() => { setPreview(null); setImageData(null); setResult(null) }} style={{ flexShrink: 0 }}>重选</button>
            </div>
          )}

        </div>

        {/* 批改结果 */}
        {result && (
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <ScoreRing pct={result.percentage} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>
                    {result.totalScore} <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)' }}>/ {result.maxTotal} 分</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.6 }}>{result.summary}</div>
                </div>
              </div>
              {result.weakTopics.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>已记录薄弱知识点：</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {result.weakTopics.map(t => (
                      <span key={t} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: 'var(--danger-bg)', color: 'var(--danger)' }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {result.problems.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>逐题分析</div>
                {result.problems.map(p => <ProblemCard key={p.index} p={p} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
