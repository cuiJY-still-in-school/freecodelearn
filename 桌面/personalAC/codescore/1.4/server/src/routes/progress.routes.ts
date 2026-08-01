import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { getDB } from '../database'
import { getAgentEngine } from '../agent'

const router = Router()
router.use(requireAuth)

function canAccessStudent(req: AuthRequest, studentId: string): boolean {
  if (req.userRole === 'student') return req.userId === studentId
  const db = getDB()
  const linked = db.prepare('SELECT id FROM User WHERE id = ? AND guardian_id = ? AND delete_flag = 0')
    .get(studentId, req.userId!) as { id: string } | undefined
  return !!linked
}

// ── 汇总统计 ──────────────────────────────────────────────────────────────
router.get('/:studentId', (req: AuthRequest, res) => {
  const { studentId } = req.params
  if (!canAccessStudent(req, studentId)) { res.status(403).json({ success: false, error: 'forbidden' }); return }
  const db = getDB()
  const now = Date.now()
  const weekMs = 7 * 24 * 3600_000

  const weekAgo      = now - weekMs
  const twoWeeksAgo  = now - 2 * weekMs
  const thirtyDaysAgo = now - 30 * 24 * 3600_000
  const ninetyDaysAgo = now - 90 * 24 * 3600_000

  const q = <T>(sql: string, ...args: unknown[]): T =>
    db.prepare(sql).get(...args) as T

  // ── 周待办完成数 ──
  const todosThisWeek  = q<{c:number}>("SELECT COUNT(*) c FROM Todo WHERE student_id=? AND status='done' AND update_time>=? AND delete_flag=0", studentId, weekAgo).c
  const todosLastWeek  = q<{c:number}>("SELECT COUNT(*) c FROM Todo WHERE student_id=? AND status='done' AND update_time>=? AND update_time<? AND delete_flag=0", studentId, twoWeeksAgo, weekAgo).c
  const totalCompleted = q<{c:number}>("SELECT COUNT(*) c FROM Todo WHERE student_id=? AND status='done' AND delete_flag=0", studentId).c

  // ── 周聊天数 ──
  const chatsThisWeek = q<{c:number}>("SELECT COUNT(*) c FROM MessageLog WHERE user_id=? AND direction='inbound' AND create_time>=? AND delete_flag=0", studentId, weekAgo).c
  const chatsLastWeek = q<{c:number}>("SELECT COUNT(*) c FROM MessageLog WHERE user_id=? AND direction='inbound' AND create_time>=? AND create_time<? AND delete_flag=0", studentId, twoWeeksAgo, weekAgo).c

  // ── 学习时长（本周）──
  const study = q<{mins:number; sessions:number}>(
    "SELECT COALESCE(SUM(duration_minutes),0) mins, COUNT(*) sessions FROM LearningRecord WHERE student_id=? AND create_time>=? AND delete_flag=0",
    studentId, weekAgo
  )

  // ── 连续打卡天数 ──
  const activeDates = db.prepare(`
    SELECT DISTINCT date(d/1000,'unixepoch','+8 hours') dd FROM (
      SELECT update_time d FROM Todo WHERE student_id=? AND status='done' AND update_time>=? AND delete_flag=0
      UNION ALL
      SELECT create_time d FROM MessageLog WHERE user_id=? AND direction='inbound' AND create_time>=? AND delete_flag=0
    ) ORDER BY dd DESC
  `).all(studentId, thirtyDaysAgo, studentId, thirtyDaysAgo) as {dd:string}[]

  const daySet = new Set(activeDates.map(r => r.dd))
  let streak = 0
  const cur = new Date()
  for (let i = 0; i < 30; i++) {
    const s = cur.toLocaleDateString('sv')
    if (daySet.has(s)) { streak++; cur.setDate(cur.getDate() - 1) }
    else if (i === 0) { cur.setDate(cur.getDate() - 1) } // allow today to be empty
    else break
  }

  // ── 热力图（90天）──
  const heatRaw = db.prepare(`
    SELECT date(d/1000,'unixepoch','+8 hours') dd, COUNT(*) c FROM (
      SELECT update_time d FROM Todo WHERE student_id=? AND status='done' AND update_time>=? AND delete_flag=0
      UNION ALL
      SELECT create_time d FROM MessageLog WHERE user_id=? AND direction='inbound' AND create_time>=? AND delete_flag=0
    ) GROUP BY dd
  `).all(studentId, ninetyDaysAgo, studentId, ninetyDaysAgo) as {dd:string;c:number}[]

  const heatMap: Record<string,number> = {}
  for (const r of heatRaw) heatMap[r.dd] = (heatMap[r.dd] || 0) + r.c

  const heatmap: {date:string;count:number}[] = []
  for (let i = 89; i >= 0; i--) {
    const d = new Date(now - i * 24 * 3600_000)
    const s = d.toLocaleDateString('sv')
    heatmap.push({ date: s, count: heatMap[s] || 0 })
  }

  // ── 学科知识点 ──
  const subjects = db.prepare(`
    SELECT subject,
           ROUND(AVG(confidence)*100) avgConf,
           COUNT(*) kpCount,
           ROUND(AVG(weakness_score)*100) avgWeakness
    FROM KnowledgePoint WHERE student_id=? AND delete_flag=0
    GROUP BY subject ORDER BY kpCount DESC LIMIT 8
  `).all(studentId) as {subject:string;avgConf:number;kpCount:number;avgWeakness:number}[]

  // ── 最新周报 ──
  const latestReport = db.prepare(
    "SELECT action_detail, create_time FROM AgentLog WHERE student_id=? AND action_type='weekly_report' AND status='success' ORDER BY create_time DESC LIMIT 1"
  ).get(studentId) as {action_detail:string;create_time:number} | undefined

  res.json({
    success: true,
    data: {
      stats: {
        todosThisWeek, todosLastWeek, totalCompleted,
        chatsThisWeek, chatsLastWeek,
        studyMinutes: study.mins, studySessions: study.sessions,
        streak,
      },
      heatmap,
      subjects,
      weekReport: latestReport
        ? { text: latestReport.action_detail, generatedAt: latestReport.create_time }
        : null,
    }
  })
})

// ── 生成 AI 周报 ──────────────────────────────────────────────────────────
router.post('/:studentId/generate-report', async (req: AuthRequest, res) => {
  const { studentId } = req.params
  if (!canAccessStudent(req, studentId)) { res.status(403).json({ success: false, error: 'forbidden' }); return }
  const engine = getAgentEngine()
  if (!engine) { res.json({ success: false, error: 'AI 引擎未初始化，请先配置 API Key' }); return }

  const db = getDB()
  const now = Date.now()
  const weekAgo = now - 7 * 24 * 3600_000

  const doneTodos = db.prepare(
    "SELECT title, priority FROM Todo WHERE student_id=? AND status='done' AND update_time>=? AND delete_flag=0 LIMIT 20"
  ).all(studentId, weekAgo) as {title:string;priority:string}[]

  const weakKPs = db.prepare(
    "SELECT subject, topic, ROUND(confidence*100) conf FROM KnowledgePoint WHERE student_id=? AND delete_flag=0 ORDER BY weakness_score DESC LIMIT 6"
  ).all(studentId) as {subject:string;topic:string;conf:number}[]

  const chatCount = (db.prepare(
    "SELECT COUNT(*) c FROM MessageLog WHERE user_id=? AND direction='inbound' AND create_time>=? AND delete_flag=0"
  ).get(studentId, weekAgo) as {c:number}).c

  const prompt = `你是一位温暖、专业的学习教练。请根据以下数据，为学生生成一份本周学习进步报告（中文，约200字，语气积极鼓励）。

【本周数据】
- 完成待办事项：${doneTodos.length} 项
${doneTodos.map(t=>`  · ${t.title}`).join('\n') || '  · （暂无）'}
- 与 AI 对话：${chatCount} 次
- 需要加强的知识点：
${weakKPs.map(k=>`  · ${k.subject}—${k.topic}（掌握度 ${k.conf}%）`).join('\n') || '  · （暂无记录）'}

【要求】
- 肯定本周的努力与具体成果
- 点出 1-2 个需要持续关注的方向
- 结尾用一句有力的话激励学生
- 直接输出段落，不要标题或分点列表`

  try {
    const text = await engine.generateBotResponse(req.userId!, prompt)
    const report = (text || '').trim()
    if (!report) { res.json({ success: false, error: 'AI 未返回内容' }); return }

    db.prepare(`
      INSERT INTO AgentLog (id,student_id,action_type,action_detail,trigger_type,status,create_time,update_time,delete_flag)
      VALUES (?,?,'weekly_report',?,'manual','success',?,?,0)
    `).run(uuidv4(), studentId, report, now, now)

    res.json({ success: true, data: { text: report, generatedAt: now } })
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})

export default router
