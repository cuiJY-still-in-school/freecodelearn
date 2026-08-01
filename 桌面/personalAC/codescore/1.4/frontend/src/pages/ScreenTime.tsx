import React, { useEffect, useState, useCallback } from 'react'
import { getEffectiveStudentId } from '../api/http'

const tok = () => localStorage.getItem('syncToken') || ''

interface ActivityRow {
  app_name: string
  window_title: string
  duration_seconds: number
  recorded_at: number
}

interface ScreenshotItem {
  timestamp: number
  url: string
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return m > 0 ? `${h}小时${m}分` : `${h}小时`
}

function dayLabel(ts: number): string {
  const d = new Date(ts)
  const today = new Date(); today.setHours(0,0,0,0)
  const diff = Math.floor((today.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  return `${d.getMonth()+1}/${d.getDate()}`
}

function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const APP_COLORS = ['#D97757','#6366F1','#0EA5E9','#10B981','#F59E0B','#8B5CF6','#EC4899','#14B8A6']

export default function ScreenTime(): React.ReactElement {
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [studentId, setStudentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<7 | 14 | 30>(7)
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([])
  const [lightbox, setLightbox] = useState<ScreenshotItem | null>(null)

  useEffect(() => { getEffectiveStudentId().then(id => { setStudentId(id); if (!id) setLoading(false) }) }, [])

  const load = useCallback(() => {
    if (!studentId) return
    const from = Date.now() - range * 86400_000
    fetch(`/api/client/activity/${studentId}?dateFrom=${from}&dateTo=${Date.now()}`, { headers: { 'x-sync-token': tok() } })
      .then(r => r.json())
      .then(d => { if (d.success) setRows(d.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [studentId, range])

  useEffect(() => { setLoading(true); load() }, [load])

  // Load screenshots once when studentId resolves
  useEffect(() => {
    if (!studentId) return
    fetch(`/api/client/screenshots/${studentId}?limit=24`, { headers: { 'x-sync-token': tok() } })
      .then(r => r.json())
      .then(d => { if (d.success) setScreenshots(d.data) })
      .catch(() => {})
  }, [studentId])

  // ── 聚合 ──
  const totalSecs = rows.reduce((s, r) => s + r.duration_seconds, 0)
  const todayStart = new Date(); todayStart.setHours(0,0,0,0)
  const todaySecs = rows.filter(r => r.recorded_at >= todayStart.getTime()).reduce((s, r) => s + r.duration_seconds, 0)

  // 按 app 聚合
  const byApp: Record<string, number> = {}
  for (const r of rows) byApp[r.app_name] = (byApp[r.app_name] ?? 0) + r.duration_seconds
  const topApps = Object.entries(byApp).sort((a,b) => b[1]-a[1]).slice(0, 8)
  const maxAppSecs = topApps[0]?.[1] ?? 1

  // 按天聚合（过去 range 天）
  const dailyMap: Record<string, number> = {}
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000)
    dailyMap[dayKey(d.getTime())] = 0
  }
  for (const r of rows) { const k = dayKey(r.recorded_at); if (k in dailyMap) dailyMap[k] += r.duration_seconds }
  const dailyEntries = Object.entries(dailyMap)
  const maxDaySecs = Math.max(...dailyEntries.map(e => e[1]), 1)

  const BAR_H = 120
  const barW = Math.max(18, Math.floor(320 / dailyEntries.length) - 4)

  return (
    <div className="page-enter">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.035em', margin: 0, color: 'var(--text)' }}>屏幕时间</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '3px 0 0' }}>桌面客户端上报的应用使用记录</p>
      </div>

      {/* 时间范围切换 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {([7, 14, 30] as const).map(d => (
          <button key={d} onClick={() => setRange(d)}
            className={range === d ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}>
            近 {d} 天
          </button>
        ))}
      </div>

      {loading ? (
        <div>
          <div className="grid-2" style={{ marginBottom: 20 }}>
            <div className="skeleton" style={{ height: 88, borderRadius: 10 }} />
            <div className="skeleton" style={{ height: 88, borderRadius: 10 }} />
          </div>
          <div className="skeleton" style={{ height: 176, borderRadius: 10, marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 220, borderRadius: 10 }} />
        </div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '52px 24px', color: 'var(--text-muted)' }}>
          <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>暂无屏幕时间数据</div>
          <div style={{ fontSize: 13 }}>安装并运行桌面客户端后数据将自动同步</div>
        </div>
      ) : (
        <>
          {/* 统计卡片 */}
          <div className="grid-2" style={{ marginBottom: 20 }}>
            <div className="stat-card">
              <div className="stat-label">今日使用</div>
              <div className="stat-value">{fmtDuration(todaySecs)}</div>
              <div className="stat-sub">桌面端累计时长</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">近 {range} 天合计</div>
              <div className="stat-value">{fmtDuration(totalSecs)}</div>
              <div className="stat-sub">平均 {fmtDuration(Math.round(totalSecs / range))} / 天</div>
            </div>
          </div>

          {/* 每日柱状图 */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>
              每日使用时长
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: BAR_H + 28, overflowX: 'auto' }}>
              {dailyEntries.map(([key, secs]) => {
                const barH = secs > 0 ? Math.max(4, Math.round((secs / maxDaySecs) * BAR_H)) : 0
                const ts = new Date(key).getTime()
                const isToday = key === dayKey(Date.now())
                return (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: barW }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', height: 14 }}>
                      {secs > 0 ? fmtDuration(secs) : ''}
                    </div>
                    <div style={{
                      width: barW, height: barH || 2, borderRadius: 4,
                      background: isToday ? 'var(--primary)' : 'var(--primary-light)',
                      border: isToday ? 'none' : '1px solid var(--primary-ring)',
                      minHeight: 2,
                    }} />
                    <div style={{ fontSize: 10, color: isToday ? 'var(--primary)' : 'var(--text-muted)', fontWeight: isToday ? 700 : 400 }}>
                      {dayLabel(ts)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* App 使用排行 */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>
              应用使用排行
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topApps.map(([app, secs], i) => (
                <div key={app}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: APP_COLORS[i % APP_COLORS.length], flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{app}</span>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{fmtDuration(secs)}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      background: APP_COLORS[i % APP_COLORS.length],
                      width: `${(secs / maxAppSecs) * 100}%`,
                      transition: 'width .4s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 截图记录 */}
      {screenshots.length > 0 && (
        <div className="card" style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>
            屏幕截图（最近 {screenshots.length} 张）
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
            {screenshots.map(s => (
              <div key={s.timestamp} onClick={() => setLightbox(s)}
                style={{ cursor: 'pointer', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '16/9', background: 'var(--bg-secondary)' }}>
                <img
                  src={s.url}
                  alt={new Date(s.timestamp).toLocaleString()}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 灯箱 */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, background: 'var(--overlay-dark)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, cursor: 'zoom-out', padding: 24,
          }}>
          <img src={lightbox.url} alt=""
            style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 8, boxShadow: 'var(--shadow-lg)' }} />
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 12 }}>
            {new Date(lightbox.timestamp).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  )
}
