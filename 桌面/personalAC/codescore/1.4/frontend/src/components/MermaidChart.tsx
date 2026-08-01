import React, { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

interface Props {
  chart: string
  id?: string
}

let lastMermaidTheme: string | null = null

function initMermaid(isDark: boolean): void {
  const theme = isDark ? 'dark' : 'default'
  if (lastMermaidTheme !== theme) {
    mermaid.initialize({ startOnLoad: false, theme: theme as any, securityLevel: 'loose' })
    lastMermaidTheme = theme
  }
}

export function MermaidChart({ chart, id }: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svgContent, setSvgContent] = useState<string>('')
  const [renderError, setRenderError] = useState<string>('')
  const [isRendering, setIsRendering] = useState(true)
  const [docTheme, setDocTheme] = useState(() => document.documentElement.dataset.theme || 'light')

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setDocTheme(document.documentElement.dataset.theme || 'light')
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  const diagramId = id || `mermaid-${Math.random().toString(36).slice(2, 9)}`

  useEffect(() => {
    initMermaid(docTheme === 'dark')
    setIsRendering(true)
    setRenderError('')
    setSvgContent('')

    let cancelled = false

    mermaid
      .render(diagramId, chart.trim())
      .then((result) => {
        if (!cancelled) {
          setSvgContent(result.svg)
          setIsRendering(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRenderError(err instanceof Error ? err.message : String(err))
          setIsRendering(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [chart, diagramId, docTheme])

  if (isRendering) {
    return (
      <div
        style={{
          padding: '16px',
          background: 'var(--bg-secondary)',
          borderRadius: 8,
          border: '1px solid var(--border)',
          color: 'var(--text-muted)',
          fontSize: 13,
          textAlign: 'center'
        }}
      >
        渲染图表中...
      </div>
    )
  }

  if (renderError) {
    return (
      <div
        style={{
          padding: '12px 16px',
          background: 'var(--danger-bg)',
          borderRadius: 8,
          border: '1px solid var(--danger-border)'
        }}
      >
        <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>
          Mermaid 渲染失败：{renderError}
        </div>
        <pre
          style={{
            fontSize: 12,
            color: 'var(--text)',
            background: 'var(--bg-secondary)',
            padding: '8px 12px',
            borderRadius: 6,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}
        >
          {chart}
        </pre>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        padding: '16px',
        background: 'var(--bg-card)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        overflowX: 'auto',
        textAlign: 'center'
      }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  )
}
