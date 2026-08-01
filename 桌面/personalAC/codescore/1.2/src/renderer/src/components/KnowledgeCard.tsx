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
    easy: { bg: '#d1fae5', color: '#065f46', label: '简单' },
    medium: { bg: '#fef3c7', color: '#92400e', label: '中等' },
    hard: { bg: '#fee2e2', color: '#991b1b', label: '困难' }
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
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
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
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        overflow: 'hidden',
        background: 'white',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          color: 'white',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>📚</span>
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
                color: '#374151',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span>🔑</span>
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
                    color: '#4b5563',
                    marginBottom: 6,
                    lineHeight: 1.5
                  }}
                >
                  <span style={{ color: '#4f46e5', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
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
                color: '#374151',
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
                color: '#374151',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span>✏️</span>
              <span>例题</span>
            </div>
            <div
              style={{
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 13,
                color: '#0369a1',
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
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start'
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>{data.tips}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
