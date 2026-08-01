import React, { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

interface Props {
  chart: string
  id?: string
}

let mermaidInitialized = false

function ensureMermaidInit(): void {
  if (!mermaidInitialized) {
    mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' })
    mermaidInitialized = true
  }
}

export function MermaidChart({ chart, id }: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svgContent, setSvgContent] = useState<string>('')
  const [renderError, setRenderError] = useState<string>('')
  const [isRendering, setIsRendering] = useState(true)

  const diagramId = id || `mermaid-${Math.random().toString(36).slice(2, 9)}`

  useEffect(() => {
    ensureMermaidInit()
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
  }, [chart, diagramId])

  if (isRendering) {
    return (
      <div
        style={{
          padding: '16px',
          background: '#f9fafb',
          borderRadius: 8,
          border: '1px solid #e5e7eb',
          color: '#6b7280',
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
          background: '#fef2f2',
          borderRadius: 8,
          border: '1px solid #fecaca'
        }}
      >
        <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>
          Mermaid 渲染失败：{renderError}
        </div>
        <pre
          style={{
            fontSize: 12,
            color: '#374151',
            background: '#f9fafb',
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
        background: 'white',
        borderRadius: 8,
        border: '1px solid #e5e7eb',
        overflowX: 'auto',
        textAlign: 'center'
      }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  )
}
