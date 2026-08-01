import React, { useEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

export interface KnowledgeCardData {
  title: string
  subject?: string
  keyPoints: string[]
  formula?: string
  example?: string
  tips?: string
  difficulty?: 'easy' | 'medium' | 'hard'
}

interface Props {
  data: KnowledgeCardData
}

function DifficultyBadge({ level }: { level?: 'easy' | 'medium' | 'hard' }): React.ReactElement {
  if (!level) return <></>
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    easy: { bg: 'var(--success-bg)', color: 'var(--success)', label: '简单' },
    medium: { bg: 'var(--warning-bg)', color: 'var(--warning)', label: '中等' },
    hard: { bg: 'var(--danger-bg)', color: 'var(--danger)', label: '困难' }
  }
  const s = styles[level]
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 10,
        marginLeft: 8
      }}
    >
      {s.label}
    </span>
  )
}

function FormulaBlock({ latex }: { latex: string }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    try {
      katex.render(latex, ref.current, {
        throwOnError: false,
        displayMode: true,
        output: 'html'
      })
    } catch (err) {
      if (ref.current) {
        ref.current.textContent = latex
      }
    }
  }, [latex])

  return (
    <div
      ref={ref}
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '10px 16px',
        overflowX: 'auto',
        textAlign: 'center'
      }}
    />
  )
}

export function KnowledgeCard({ data }: Props): React.ReactElement {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--bg-card)',
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'var(--primary)',
          color: 'white',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{data.title}</div>
            {data.subject && (
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{data.subject}</div>
            )}
          </div>
        </div>
        <DifficultyBadge level={data.difficulty} />
      </div>

      <div style={{ padding: '16px 18px' }}>
        {/* Key Points */}
        {data.keyPoints && data.keyPoints.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text)',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="15" r="4"/><line x1="11.3" y1="11.3" x2="20" y2="2.5"/><line x1="18" y1="4" x2="20" y2="6"/><line x1="15" y1="5" x2="17" y2="7"/></svg>
              <span>重点</span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {data.keyPoints.map((point, i) => (
                <li
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    marginBottom: 6,
                    lineHeight: 1.5
                  }}
                >
                  <span style={{ color: 'var(--primary)', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                    {i + 1}.
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Formula */}
        {data.formula && (
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text)',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span>∑</span>
              <span>公式</span>
            </div>
            <FormulaBlock latex={data.formula} />
          </div>
        )}

        {/* Example */}
        {data.example && (
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text)',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              <span>例题</span>
            </div>
            <div
              style={{
                background: 'var(--primary-light)',
                border: '1px solid var(--primary-ring)',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 13,
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap'
              }}
            >
              {data.example}
            </div>
          </div>
        )}

        {/* Tips */}
        {data.tips && (
          <div>
            <div
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start'
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><line x1="12" y1="2" x2="12" y2="6"/><path d="M12 6a6 6 0 0 1 6 6c0 2-.8 3.5-2 4.5v2a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2C6.8 17.5 6 16 6 14a6 6 0 0 1 6-6z"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{data.tips}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
