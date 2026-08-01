import { getDB } from '../database'

interface SubjectStat {
  subject: string
  sessions: number
  minutes: number
  avgScore: number
}

interface WeekReport {
  studentName: string
  weekLabel: string
  totalSessions: number
  totalMinutes: number
  subjects: SubjectStat[]
  weakTopics: Array<{ topic: string; subject: string; confidence: number }>
  todoDone: number
  todoTotal: number
  agentMessages: number
  streak: number  // 连续学习天数
}

export function buildWeekReport(studentId: string): WeekReport {
  const db = getDB()
  const now = Date.now()
  const weekAgo = now - 7 * 86400 * 1000

  const user = db.prepare('SELECT display_name, student_name FROM User WHERE id = ?').get(studentId) as
    { display_name: string | null; student_name: string | null } | undefined

  const records = db.prepare(`
    SELECT subject, COUNT(*) AS sessions,
           COALESCE(SUM(duration_minutes), 0) AS minutes,
           COALESCE(AVG(score), 0) AS avgScore
    FROM LearningRecord
    WHERE student_id = ? AND record_date >= ? AND delete_flag = 0
    GROUP BY subject ORDER BY minutes DESC
  `).all(studentId, weekAgo) as SubjectStat[]

  const totalSessions = records.reduce((s, r) => s + r.sessions, 0)
  const totalMinutes = records.reduce((s, r) => s + r.minutes, 0)

  const weakTopics = db.prepare(`
    SELECT topic, subject, COALESCE(confidence, 0.5) AS confidence
    FROM KnowledgePoint
    WHERE student_id = ? AND delete_flag = 0
    ORDER BY confidence ASC LIMIT 5
  `).all(studentId) as Array<{ topic: string; subject: string; confidence: number }>

  const todoStats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
    FROM Todo WHERE student_id = ? AND create_time >= ? AND delete_flag = 0
  `).get(studentId, weekAgo) as { total: number; done: number }

  const agentMessages = (db.prepare(`
    SELECT COUNT(*) AS c FROM MessageLog
    WHERE user_id = ? AND direction = 'outbound' AND create_time >= ? AND delete_flag = 0
  `).get(studentId, weekAgo) as { c: number }).c

  // 连续学习天数
  const days = db.prepare(`
    SELECT DISTINCT date(record_date/1000,'unixepoch','localtime') AS d
    FROM LearningRecord WHERE student_id = ? AND delete_flag = 0
    ORDER BY d DESC LIMIT 30
  `).all(studentId) as Array<{ d: string }>

  let streak = 0
  let cur = new Date()
  cur.setHours(0, 0, 0, 0)
  for (const { d } of days) {
    const day = new Date(d)
    const diff = Math.round((cur.getTime() - day.getTime()) / 86400000)
    if (diff <= 1) { streak++; cur = day } else break
  }

  const weekStart = new Date(weekAgo)
  const weekLabel = `${weekStart.getMonth() + 1}月${weekStart.getDate()}日 – ${new Date().getMonth() + 1}月${new Date().getDate()}日`

  return {
    studentName: user?.student_name || user?.display_name || '同学',
    weekLabel,
    totalSessions,
    totalMinutes,
    subjects: records,
    weakTopics,
    todoDone: todoStats?.done || 0,
    todoTotal: todoStats?.total || 0,
    agentMessages,
    streak
  }
}

export function renderReportHTML(report: WeekReport): string {
  const subjectRows = report.subjects.map(s => `
    <tr>
      <td>${s.subject}</td>
      <td>${s.sessions}</td>
      <td>${Math.round(s.minutes / 60 * 10) / 10} h</td>
      <td>${s.avgScore > 0 ? Math.round(s.avgScore) + '分' : '—'}</td>
      <td>
        <div style="background:#e5e2de;border-radius:4px;height:8px;width:120px">
          <div style="background:#D97757;height:8px;border-radius:4px;width:${Math.min(100, (s.minutes / Math.max(report.totalMinutes, 1)) * 100)}%"></div>
        </div>
      </td>
    </tr>
  `).join('')

  const weakRows = report.weakTopics.map(t => `
    <tr>
      <td>${t.subject}</td>
      <td>${t.topic}</td>
      <td>
        <div style="background:#e5e2de;border-radius:4px;height:8px;width:80px;display:inline-block">
          <div style="background:${t.confidence < 0.4 ? '#ef4444' : t.confidence < 0.6 ? '#f97316' : '#22c55e'};height:8px;border-radius:4px;width:${Math.round(t.confidence * 100)}%"></div>
        </div>
        <span style="margin-left:6px;font-size:12px;color:#6b7280">${Math.round(t.confidence * 100)}%</span>
      </td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>学情周报 · ${report.weekLabel}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'PingFang SC', sans-serif; background: #F9F7F4; color: #1A1815; padding: 32px; }
    .header { background: #1A1815; color: #fff; border-radius: 12px; padding: 28px 32px; margin-bottom: 24px; }
    .header h1 { font-size: 22px; font-weight: 800; margin-bottom: 4px; }
    .header p { font-size: 14px; color: #a8a29e; }
    .stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 24px; }
    .stat { background: #fff; border: 1px solid #e5e2de; border-radius: 10px; padding: 16px 20px; }
    .stat .val { font-size: 28px; font-weight: 800; color: #D97757; }
    .stat .lbl { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .card { background: #fff; border: 1px solid #e5e2de; border-radius: 10px; padding: 20px 24px; margin-bottom: 16px; }
    .card h2 { font-size: 14px; font-weight: 700; margin-bottom: 14px; color: #1A1815; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; font-weight: 600; color: #6b7280; font-size: 12px; padding: 0 0 8px; border-bottom: 1px solid #e5e2de; }
    td { padding: 8px 0; border-bottom: 1px solid #f5f3f0; vertical-align: middle; }
    .footer { margin-top: 24px; text-align: center; font-size: 12px; color: #9ca3af; }
    @media print { body { padding: 0; background: white; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>PersonalAC · 学情周报</h1>
    <p>${report.studentName} · ${report.weekLabel}</p>
  </div>

  <div class="stats">
    <div class="stat">
      <div class="val">${Math.round(report.totalMinutes / 60 * 10) / 10}h</div>
      <div class="lbl">本周学习时长</div>
    </div>
    <div class="stat">
      <div class="val">${report.totalSessions}</div>
      <div class="lbl">学习记录条数</div>
    </div>
    <div class="stat">
      <div class="val">${report.streak}</div>
      <div class="lbl">连续学习天数</div>
    </div>
    <div class="stat">
      <div class="val">${report.todoDone}/${report.todoTotal}</div>
      <div class="lbl">任务完成情况</div>
    </div>
  </div>

  ${report.subjects.length > 0 ? `
  <div class="card">
    <h2>科目学习分布</h2>
    <table>
      <thead><tr><th>科目</th><th>次数</th><th>时长</th><th>均分</th><th>占比</th></tr></thead>
      <tbody>${subjectRows}</tbody>
    </table>
  </div>` : ''}

  ${report.weakTopics.length > 0 ? `
  <div class="card">
    <h2>薄弱知识点（Top 5）</h2>
    <table>
      <thead><tr><th>科目</th><th>知识点</th><th>掌握程度</th></tr></thead>
      <tbody>${weakRows}</tbody>
    </table>
  </div>` : ''}

  <div class="card" style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
    <div>
      <h2>AI 助手</h2>
      <div style="font-size:24px;font-weight:800;color:#D97757">${report.agentMessages}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:4px">本周 AI 消息推送数</div>
    </div>
    <div>
      <h2>任务管理</h2>
      <div style="font-size:24px;font-weight:800;color:#D97757">${report.todoTotal > 0 ? Math.round(report.todoDone / report.todoTotal * 100) : 0}%</div>
      <div style="font-size:13px;color:#6b7280;margin-top:4px">待办任务完成率</div>
    </div>
  </div>

  <div class="footer">PersonalAC · 自动生成于 ${new Date().toLocaleDateString('zh-CN')} · 打印或另存为 PDF 可永久保存</div>
</body>
</html>`
}
