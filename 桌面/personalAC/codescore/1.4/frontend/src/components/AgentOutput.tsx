import React, { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { MermaidChart } from './MermaidChart'
import { KnowledgeCard, type KnowledgeCardData } from './KnowledgeCard'

export interface AgentOutputData {
  type: 'text' | 'mermaid' | 'knowledge_card' | 'code' | 'latex'
  content: string
  language?: string
}

interface Props {
  output: AgentOutputData
}

function MarkdownText({ content }: { content: string }): React.ReactElement {
  const [html, setHtml] = useState('')

  useEffect(() => {
    const result = marked.parse(content, { async: false }) as string
    setHtml(result)
  }, [content])

  return (
    <div
      style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function LatexBlock({ content }: { content: string }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    try {
      katex.render(content.trim(), ref.current, {
        throwOnError: false,
        displayMode: true,
        output: 'html'
      })
    } catch {
      if (ref.current) {
        ref.current.textContent = content
      }
    }
  }, [content])

  return (
    <div
      ref={ref}
      style={{
        padding: '12px 16px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflowX: 'auto',
        textAlign: 'center'
      }}
    />
  )
}

function CodeBlock({
  content,
  language
}: {
  content: string
  language?: string
}): React.ReactElement {
  const [copied, setCopied] = useState(false)

  const handleCopy = (): void => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      style={{
        position: 'relative',
        background: '#1e1b4b',
        borderRadius: 8,
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 12px',
          background: 'rgba(255,255,255,0.05)',
          borderBottom: '1px solid rgba(255,255,255,0.1)'
        }}
      >
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          style={{
            background: 'none',
            border: 'none',
            color: copied ? '#86efac' : 'rgba(255,255,255,0.6)',
            cursor: 'pointer',
            fontSize: 12,
            padding: '2px 8px',
            borderRadius: 4
          }}
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: '14px 16px',
          fontSize: 13,
          color: '#e2e8f0',
          overflowX: 'auto',
          whiteSpace: 'pre',
          fontFamily: 'Consolas, Monaco, "Courier New", monospace'
        }}
      >
        <code>{content}</code>
      </pre>
    </div>
  )
}

export function AgentOutput({ output }: Props): React.ReactElement {
  switch (output.type) {
    case 'text':
      return <MarkdownText content={output.content} />

    case 'mermaid':
      return <MermaidChart chart={output.content} />

    case 'knowledge_card': {
      let data: KnowledgeCardData
      try {
        data = JSON.parse(output.content) as KnowledgeCardData
      } catch {
        return (
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--danger-bg)',
              borderRadius: 8,
              border: '1px solid var(--danger-border)',
              fontSize: 13,
              color: 'var(--danger)'
            }}
          >
            知识卡片解析失败：{output.content}
          </div>
        )
      }
      return <KnowledgeCard data={data} />
    }

    case 'code':
      return <CodeBlock content={output.content} language={output.language} />

    case 'latex':
      return <LatexBlock content={output.content} />

    default:
      return (
        <pre
          style={{
            fontSize: 13,
            color: 'var(--text)',
            background: 'var(--bg-secondary)',
            padding: '12px',
            borderRadius: 8,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}
        >
          {output.content}
        </pre>
      )
  }
}
