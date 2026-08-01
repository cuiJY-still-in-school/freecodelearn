import { useRef, useEffect, useState, useCallback } from 'react'
import { Box } from '@mui/material'

// ── Types ─────────────────────────────────────────

export interface Stroke {
  type: 'stroke'
  id: string
  points: Array<{ x: number; y: number }>
  color: string
  width: number
}

export interface AITextElement {
  type: 'ai_text'
  id: string
  x: number; y: number
  text: string
  width: number
  color?: string
}

export interface AIHighlight {
  type: 'ai_highlight'
  id: string
  x: number; y: number
  w: number; h: number
  color: string
  note: string
}

export type CanvasElement = Stroke | AITextElement | AIHighlight

export interface CanvasState {
  elements: CanvasElement[]
  viewport: { x: number; y: number; zoom: number }
}

// ── Tools ─────────────────────────────────────────

type Tool = 'pen' | 'eraser' | 'move' | 'none'

interface Props {
  elements: CanvasElement[]
  viewport: { x: number; y: number; zoom: number }
  tool: Tool
  penColor: string
  penWidth: number
  onStrokeAdd: (stroke: Stroke) => void
  onViewportChange: (vp: { x: number; y: number; zoom: number }) => void
  onAIDelete: (id: string) => void
  captureRef: React.MutableRefObject<(() => string) | null>
}

// ── Helpers ───────────────────────────────────────

function midPoint(p1: { x: number; y: number }, p2: { x: number; y: number }) {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
}

function dist(p1: { x: number; y: number }, p2: { x: number; y: number }) {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
}

function canvasToWorld(cx: number, cy: number, vp: CanvasState['viewport']) {
  return { x: (cx - vp.x) / vp.zoom, y: (cy - vp.y) / vp.zoom }
}

function worldToCanvas(wx: number, wy: number, vp: CanvasState['viewport']) {
  return { x: wx * vp.zoom + vp.x, y: wy * vp.zoom + vp.y }
}

let idCounter = 0
function uid() { return `el_${Date.now()}_${idCounter++}` }

// ── Component ─────────────────────────────────────

export default function CanvasBoard({
  elements, viewport, tool, penColor, penWidth,
  onStrokeAdd, onViewportChange, onAIDelete, captureRef,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([])
  const [containerSize, setContainerSize] = useState({ w: 1200, h: 800 })
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const moveStart = useRef<{ mx: number; my: number; vx: number; vy: number } | null>(null)

  // 响应容器大小
  useEffect(() => {
    function resize() {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect()
        setContainerSize({ w: r.width, h: r.height })
      }
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  // 暴露截图函数
  useEffect(() => {
    captureRef.current = () => {
      const canvas = canvasRef.current
      if (!canvas) return ''
      const tmp = document.createElement('canvas')
      tmp.width = canvas.width
      tmp.height = canvas.height
      const ctx = tmp.getContext('2d')!
      ctx.fillStyle = '#faf9f5'
      ctx.fillRect(0, 0, tmp.width, tmp.height)
      ctx.drawImage(canvas, 0, 0)
      return tmp.toDataURL('image/png')
    }
  }, [captureRef])

  // ── 渲染 ──────────────────────────────────────

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const { x: vx, y: vy, zoom } = viewport

    canvas.width = containerSize.w * (window.devicePixelRatio || 1)
    canvas.height = containerSize.h * (window.devicePixelRatio || 1)
    canvas.style.width = containerSize.w + 'px'
    canvas.style.height = containerSize.h + 'px'
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0)

    // 背景
    ctx.fillStyle = '#faf9f5'
    ctx.fillRect(0, 0, containerSize.w, containerSize.h)

    ctx.save()
    ctx.translate(vx, vy)
    ctx.scale(zoom, zoom)

    // 绘制所有元素
    for (const el of elements) {
      if (el.type === 'stroke') {
        drawStroke(ctx, el)
      } else if (el.type === 'ai_highlight') {
        drawHighlight(ctx, el)
      }
    }

    // 当前正在画的笔画
    if (currentStroke.length > 1) {
      drawCurrentStroke(ctx, currentStroke, penColor, penWidth)
    }

    ctx.restore()
  }, [elements, currentStroke, viewport, containerSize, penColor, penWidth])

  useEffect(() => { render() }, [render])

  // ── 绘制函数 ──────────────────────────────────

  function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
    if (s.points.length < 2) return
    ctx.beginPath()
    ctx.strokeStyle = s.color
    ctx.lineWidth = s.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.moveTo(s.points[0].x, s.points[0].y)

    if (s.points.length === 2) {
      ctx.lineTo(s.points[1].x, s.points[1].y)
    } else {
      for (let i = 1; i < s.points.length - 1; i++) {
        const mid = midPoint(s.points[i], s.points[i + 1])
        ctx.quadraticCurveTo(s.points[i].x, s.points[i].y, mid.x, mid.y)
      }
      ctx.lineTo(s.points[s.points.length - 1].x, s.points[s.points.length - 1].y)
    }
    ctx.stroke()
  }

  function drawCurrentStroke(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], color: string, width: number) {
    if (pts.length < 2) return
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length - 1; i++) {
      const mid = midPoint(pts[i], pts[i + 1])
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mid.x, mid.y)
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
    ctx.stroke()
  }

  function drawHighlight(ctx: CanvasRenderingContext2D, h: AIHighlight) {
    ctx.fillStyle = h.color + '20'
    ctx.fillRect(h.x, h.y, h.w, h.h)
    ctx.strokeStyle = h.color
    ctx.lineWidth = 2
    ctx.setLineDash([6, 3])
    ctx.strokeRect(h.x, h.y, h.w, h.h)
    ctx.setLineDash([])
  }

  // ── 事件处理 ──────────────────────────────────

  function getPos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect()
    if ('touches' in e) {
      const t = e.touches[0] || e.changedTouches[0]
      return { x: t.clientX - rect.left, y: t.clientY - rect.top }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const pos = getPos(e)
    const world = canvasToWorld(pos.x, pos.y, viewport)

    if (tool === 'pen') {
      setCurrentStroke([world])
      lastPoint.current = world
      setDragging(true)
    } else if (tool === 'eraser') {
      // 橡皮：删除包含该点的 stroke
      const hit = findStrokeAt(elements, world, 20 / viewport.zoom)
      if (hit) {
        // 通过父组件删除
        onAIDelete(hit.id)
      }
    } else if (tool === 'move') {
      moveStart.current = { mx: pos.x, my: pos.y, vx: viewport.x, vy: viewport.y }
      setDragging(true)
    }
  }

  function handlePointerMove(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!dragging) return
    const pos = getPos(e)
    const world = canvasToWorld(pos.x, pos.y, viewport)

    if (tool === 'pen' && currentStroke.length > 0) {
      const last = currentStroke[currentStroke.length - 1]
      if (dist(last, world) > 3) {
        setCurrentStroke(prev => [...prev, world])
        lastPoint.current = world
      }
    } else if (tool === 'move' && moveStart.current) {
      const dx = pos.x - moveStart.current.mx
      const dy = pos.y - moveStart.current.my
      onViewportChange({ x: moveStart.current.vx + dx, y: moveStart.current.vy + dy, zoom: viewport.zoom })
    } else if (tool === 'eraser') {
      const hit = findStrokeAt(elements, world, 20 / viewport.zoom)
      if (hit) onAIDelete(hit.id)
    }
  }

  function handlePointerUp(_e: React.MouseEvent | React.TouchEvent) {
    if (tool === 'pen' && currentStroke.length > 1) {
      onStrokeAdd({
        type: 'stroke', id: uid(),
        points: currentStroke, color: penColor, width: penWidth,
      })
    }
    setCurrentStroke([])
    setDragging(false)
    moveStart.current = null
    lastPoint.current = null
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.2, Math.min(5, viewport.zoom * delta))
    const pos = getPos(e as any)
    const worldBefore = canvasToWorld(pos.x, pos.y, viewport)
    const newVx = pos.x - worldBefore.x * newZoom
    const newVy = pos.y - worldBefore.y * newZoom
    onViewportChange({ x: newVx, y: newVy, zoom: newZoom })
  }

  return (
    <Box ref={containerRef} sx={{ flex: 1, position: 'relative', overflow: 'hidden', bgcolor: 'var(--canvas)', cursor: tool === 'move' ? 'grab' : tool === 'pen' ? 'crosshair' : 'default' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        onWheel={handleWheel}
        style={{ display: 'block', touchAction: 'none' }}
      />

      {/* AI 文本元素覆盖层 */}
      {elements.filter(el => el.type === 'ai_text').map(el => {
        const ai = el as AITextElement
        const screen = worldToCanvas(ai.x, ai.y, viewport)
        return (
          <Box
            key={ai.id}
            sx={{
              position: 'absolute',
              left: screen.x, top: screen.y,
              maxWidth: ai.width || 280,
              bgcolor: '#ffffff',
              border: '1.5px solid var(--primary)',
              borderRadius: 2,
              px: 2, py: 1.5,
              fontSize: 14, lineHeight: 1.5,
              boxShadow: '0 2px 8px rgba(20,20,19,0.1)',
              cursor: 'move',
              userSelect: 'none',
              '&:hover .ai-close': { opacity: 1 },
            }}
          >
            <Box sx={{ color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{ai.text}</Box>
            <Box
              className="ai-close"
              component="button"
              onClick={() => onAIDelete(ai.id)}
              sx={{
                position: 'absolute', top: -8, right: -8,
                width: 20, height: 20, borderRadius: '50%',
                border: 'none', bgcolor: 'var(--primary)', color: '#fff',
                fontSize: 12, cursor: 'pointer', opacity: 0,
                transition: 'opacity 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              ×
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

// ── 橡皮辅助 ─────────────────────────────────────

function findStrokeAt(elements: CanvasElement[], world: { x: number; y: number }, radius: number): Stroke | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]
    if (el.type !== 'stroke') continue
    for (const pt of (el as Stroke).points) {
      if (dist(pt, world) < radius) return el as Stroke
    }
  }
  return null
}
