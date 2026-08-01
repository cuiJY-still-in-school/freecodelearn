import axios from 'axios'
import https from 'https'

// TUN/Clash 会劫持所有系统流量，用 keepAlive Agent 强制直连，绕过系统代理
const _directAgent = new https.Agent({ keepAlive: true })
const _axiosDirect = axios.create({ httpsAgent: _directAgent, proxy: false })
import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'
import { AgentContext, AgentContextData } from './context'
import { AgentScheduler } from './scheduler'
import { getAIConfig } from '../services/settings.service'
import { sendMessage as botSendMessage } from '../services/notify.service'
import { buildPlannerPrompt, parsePlan, PlannedTask } from './planner'
import {
  getExecutor,
  SideEffect,
  AIConfig,
  dailyReviewExecutor,
  weaknessQuizExecutor,
  resourceBriefExecutor
} from './executors'
import cron from 'node-cron'

export interface AgentEvent {
  type: 'new_learning_data' | 'new_resource' | 'plan_changed' | 'bot_message' | 'workspace_full' | 'workspace_update'
  studentId?: string
  userId?: string
  username?: string
  role?: string
  [key: string]: unknown
}

interface DoNotDisturbConfig {
  start: string // "HH:MM"
  end: string // "HH:MM"
}

let agentEngineInstance: AgentEngine | null = null

function buildBlackRoomPrompt(state: { reason: string; entered_at: number; exit_condition: string | null }): string {
  const days = Math.max(1, Math.floor((Date.now() - state.entered_at) / 86400000))
  return `

[⚠️ 内部状态 — 严格保密，绝不对学生或监护人提及此字段]
此学生进入特别关注模式已 ${days} 天。
触发原因：${state.reason}
退出条件：${state.exit_condition ?? '学习状态持续改善'}

辅导策略（自然融入对话，不留痕迹）：
- 先顺着学生聊的话题走一两句，再找时机自然引导到学习，不要突然切换
- 每次对话结尾提一个"5 分钟就能做完"的微任务（一道题、背 3 个词、读一段课文）
- 发现回避行为（聊游戏、问无关问题）：先认可一句，再用好奇心引导（"这挺有意思，不过说到这个——上次那道题你后来有没有想清楚？"）
- 不主动提逾期任务或遗忘知识点，等学生主动提时再跟进；不制造内疚感
- 对任何学习参与行为给予真诚认可，不夸张
- 若监护人在此会话中提问，使用中性措辞，绝不透露此状态`
}

export function getAgentEngine(): AgentEngine | null {
  return agentEngineInstance
}

export class AgentEngine {
  private context: AgentContext
  scheduler: AgentScheduler
  private doNotDisturb: DoNotDisturbConfig | null = null
  private processingStudents: Set<string> = new Set()
  private dailyCronJob: cron.ScheduledTask | null = null
  private digestCronJob: cron.ScheduledTask | null = null
  private backupCronJob: cron.ScheduledTask | null = null
  private sobrietyCronJob: cron.ScheduledTask | null = null
  private heartbeatCronJob: cron.ScheduledTask | null = null
  private lastHeartbeatAt: number = 0
  private readonly SILENCE_INTERVAL_MS = 30 * 60 * 1000  // 30分钟最小间隔（静默阈值）
  private systemPromptCache: Map<string, { prompt: string; builtAt: number }> = new Map()
  private readonly PROMPT_CACHE_TTL = 3 * 60 * 1000
  private toolResultCache: Map<string, { result: string; at: number }> = new Map()
  private readonly TOOL_RESULT_CACHE_TTL = 30_000
  private contextSummaryCache: Map<string, { summary: string; at: number }> = new Map()
  private readonly CONTEXT_SUMMARY_TTL = 20 * 60_000

  constructor() {
    this.context = new AgentContext()
    this.scheduler = new AgentScheduler((studentId, scheduleId, description) => {
      this.handleEvent({
        type: 'new_learning_data',
        studentId,
        triggerSource: `schedule:${scheduleId}`,
        description
      })
    })
    agentEngineInstance = this
    // 每5分钟清理过期缓存，防止内存无界增长
    setInterval(() => this.evictStaleCaches(), 5 * 60_000).unref()
  }

  private evictStaleCaches(): void {
    const now = Date.now()
    for (const [k, v] of this.systemPromptCache) {
      if (now - v.builtAt > this.PROMPT_CACHE_TTL) this.systemPromptCache.delete(k)
    }
    for (const [k, v] of this.toolResultCache) {
      if (now - v.at > this.TOOL_RESULT_CACHE_TTL) this.toolResultCache.delete(k)
    }
    for (const [k, v] of this.contextSummaryCache) {
      if (now - v.at > this.CONTEXT_SUMMARY_TTL) this.contextSummaryCache.delete(k)
    }
  }

  init(): void {
    this.scheduler.init()

    // Daily review cron at 20:00
    this.dailyCronJob = cron.schedule('0 20 * * *', () => {
      console.log('Daily review cron triggered at 20:00')
      this.generateDailyReview('superadmin').catch((err) => {
        console.error('Daily review cron error:', err)
      })
    })

    // 自我清醒：每小时刷新一次所有学生快照
    this.sobrietyCronJob = cron.schedule('0 * * * *', () => {
      this.refreshAllSobrietySnapshots().catch((err) => {
        console.error('Sobriety cron error:', err)
      })
    })

    // 启动 5 秒后跑一次冷启动刷新
    setTimeout(() => {
      this.refreshAllSobrietySnapshots().catch((err) => {
        console.error('Sobriety initial refresh error:', err)
      })
    }, 5000)

    // 1.4 心跳：每30分钟扫描一次（错开整点，避免和清醒刷新撞车）
    this.heartbeatCronJob = cron.schedule('15,45 * * * *', () => {
      this.runHeartbeat().catch((err) => {
        console.error('Heartbeat error:', err)
      })
    })

    // 启动 10 秒后跑一次冷启动心跳
    setTimeout(() => {
      this.runHeartbeat().catch((err) => {
        console.error('Heartbeat initial run error:', err)
      })
    }, 10000)

    // 每周日 20:00 自动发周报邮件给监护人
    cron.schedule('0 20 * * 0', () => {
      this.sendWeeklyReportEmails().catch(err => console.error('Weekly report email error:', err))
    })

    // 21:00 为监护人生成今日简报
    this.digestCronJob = cron.schedule('0 21 * * *', () => {
      console.log('Guardian digest cron triggered at 21:00')
      this.generateAllGuardianDigests().catch(err => console.error('Guardian digest cron error:', err))
    })

    // 凌晨 3:00 自动备份数据库
    this.backupCronJob = cron.schedule('0 3 * * *', () => {
      const { performBackup } = require('../services/backup.service')
      const result = performBackup()
      if (result.success) console.log(`[Backup] Auto backup created: ${result.filename}`)
      else console.error('[Backup] Auto backup failed:', result.error)
    })

    // 每分钟检查 AgentSchedule 到期排程并执行
    cron.schedule('* * * * *', () => {
      this.fireScheduledWakeups().catch(err => console.error('[Schedule] fire error:', err))
    })

    console.log('AgentEngine initialized')
  }

  // ─────────────────────────────────────────────
  // 自我清醒 — 周期刷新所有学生快照
  // ─────────────────────────────────────────────

  private async generateAllGuardianDigests(): Promise<void> {
    const db = getDB()
    const students = db.prepare(
      `SELECT id FROM User WHERE role='student' AND delete_flag=0`
    ).all() as Array<{ id: string }>
    for (const s of students) {
      try { await this.generateGuardianDigest(s.id) }
      catch (err) { console.error(`Guardian digest failed for ${s.id}:`, err) }
    }
  }

  async generateGuardianDigest(studentId: string): Promise<void> {
    const configResult = getAIConfig()
    if (!configResult.success || !(configResult.data as { apiKey: string })?.apiKey) return

    const aiConfig = configResult.data as AIConfig
    const db = getDB()

    // Gather today's stats
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const ts = todayStart.getTime()

    const todosDone = (db.prepare(
      `SELECT COUNT(*) AS c FROM Todo WHERE student_id=? AND delete_flag=0 AND status='done' AND update_time>=?`
    ).get(studentId, ts) as { c: number }).c

    const todosPending = (db.prepare(
      `SELECT COUNT(*) AS c FROM Todo WHERE student_id=? AND delete_flag=0 AND status='pending'`
    ).get(studentId) as { c: number }).c

    const srsReviewed = (db.prepare(
      `SELECT COUNT(*) AS c FROM KnowledgePoint WHERE student_id=? AND delete_flag=0 AND last_practiced>=?`
    ).get(studentId, ts) as { c: number }).c

    const srsTotal = (db.prepare(
      `SELECT COUNT(*) AS c FROM KnowledgePoint WHERE student_id=? AND delete_flag=0`
    ).get(studentId) as { c: number }).c

    const chatCount = (db.prepare(
      `SELECT COUNT(*) AS c FROM MessageLog WHERE user_id=? AND direction='inbound' AND create_time>=? AND delete_flag=0`
    ).get(studentId, ts) as { c: number }).c || 0

    const screenshotDir = require('path').join(process.env.DATA_DIR || require('path').join(process.cwd(), 'data'), 'screenshots', studentId)
    let screenshotCount = 0
    try {
      const fs = require('fs')
      if (fs.existsSync(screenshotDir)) {
        const todayStr = new Date(ts).toISOString().slice(0, 10)
        screenshotCount = fs.readdirSync(screenshotDir).filter((f: string) => f.startsWith(todayStr)).length
      }
    } catch { /* ignore */ }

    // Top weak topics
    const weakTopics = db.prepare(
      `SELECT topic, subject, COALESCE(confidence,0.5) AS conf FROM KnowledgePoint
       WHERE student_id=? AND delete_flag=0 ORDER BY conf ASC LIMIT 5`
    ).all(studentId) as Array<{ topic: string; subject: string; conf: number }>

    const student = db.prepare(
      `SELECT display_name, student_grade FROM User WHERE id=? AND delete_flag=0`
    ).get(studentId) as { display_name: string | null; student_grade: string | null } | undefined

    const name = student?.display_name || '学生'
    const grade = student?.student_grade || ''

    const weakStr = weakTopics.length
      ? weakTopics.map(t => `${t.subject}·${t.topic}(${(t.conf * 100).toFixed(0)}%)`).join('、')
      : '暂无薄弱点记录'

    const prompt = `你是学生家庭学习助手 PersonalAC。请根据今天的学习数据，为监护人生成一段简洁的今日学习简报。

学生：${name}${grade ? `（${grade}）` : ''}

今日数据：
- 完成待办：${todosDone} 项，剩余：${todosPending} 项
- 复习知识点：${srsReviewed}/${srsTotal} 个
- 与 AI 对话：约 ${chatCount} 次
- 截图记录：${screenshotCount} 张

薄弱知识点（置信度最低）：${weakStr}

请生成 3-5 句话的简报，包含：
1. 今天整体表现评价（积极为主）
2. 一个值得关注的点（待办完成率或复习情况）
3. 给监护人的一个具体建议

直接输出简报内容，不需要标题。`

    const content = await this.callAI(prompt, aiConfig.modelId, aiConfig.apiKey, aiConfig.baseUrl)
    if (!content) return

    const detail = JSON.stringify({
      digest: content,
      stats: { todosDone, todosPending, srsReviewed, srsTotal, chatCount, screenshotCount },
      date: new Date().toLocaleDateString('zh-CN')
    })

    await this.logAction(studentId, 'guardian_digest', detail, 'scheduled', aiConfig.modelId, 'success')
    console.log(`[GuardianDigest] Generated for student ${studentId}`)
  }

  private async sendWeeklyReportEmails(): Promise<void> {
    const db = getDB()
    const guardians = db.prepare(
      `SELECT u.id, u.email FROM User u
       WHERE u.role = 'guardian' AND u.delete_flag = 0`
    ).all() as Array<{ id: string; email: string | null }>

    const { sendWeeklyReportEmail } = await import('../services/email.service')
    const { sendMessage } = await import('../services/notify.service')

    for (const g of guardians) {
      const student = db.prepare(
        `SELECT id, display_name FROM User WHERE guardian_id = ? AND role = 'student' AND delete_flag = 0 LIMIT 1`
      ).get(g.id) as { id: string; display_name: string | null } | undefined
      if (!student) continue

      let emailSent = false
      if (g.email) {
        try {
          await sendWeeklyReportEmail(g.email, student.id)
          emailSent = true
          console.log(`[WeeklyReport] email sent to ${g.email}`)
        } catch (err) {
          console.error(`[WeeklyReport] email failed for ${g.email}:`, err)
        }
      }

      // in-app 通知：无论邮件是否成功都发
      try {
        const sName = student.display_name || '孩子'
        const snap = (() => {
          try {
            const { getOrRefreshSnapshot } = require('../services/sobriety.service')
            return getOrRefreshSnapshot(student.id, 60 * 60 * 1000)
          } catch { return null }
        })()
        const lines = [`📊 ${sName}的本周学情报告已生成`]
        if (snap?.today_priority && snap.today_priority !== '暂无紧迫事项') {
          lines.push(snap.today_priority)
        }
        if (!emailSent) lines.push('（邮件未配置，仅显示应用内通知）')
        lines.push('→ 去「AI对话」问我「本周学情报告」查看完整内容')
        await sendMessage(g.id, lines.join('\n'))
      } catch (err) {
        console.error(`[WeeklyReport] in-app notify failed for guardian ${g.id}:`, err)
      }
    }
  }

  private async refreshAllSobrietySnapshots(): Promise<void> {
    const db = getDB()
    const students = db.prepare(
      `SELECT id FROM User WHERE role='student' AND delete_flag=0`
    ).all() as Array<{ id: string }>

    if (students.length === 0) return

    const { refreshSobrietySnapshot, getLastUrgency, markNotified } = await import('../services/sobriety.service')

    for (const s of students) {
      try {
        const prev = getLastUrgency(s.id)
        const snap = refreshSobrietySnapshot(s.id)

        // 紧迫度升级到 urgent → 写一条 AgentLog + 推送给监护人
        if (snap.urgency.level === 'urgent' && prev !== 'urgent' && !this.isDoNotDisturb()) {
          await this.logAction(
            s.id,
            'sobriety_alert',
            snap.urgency.reasons.join('；'),
            'sobriety_cron',
            null,
            'success'
          )
          markNotified(s.id)
          console.log(`[Sobriety] urgent escalation for ${s.id}: ${snap.urgency.reasons.join('; ')}`)

          // 推给监护人
          const guardian = db.prepare(
            `SELECT id, display_name FROM User WHERE id = (SELECT guardian_id FROM User WHERE id=? AND delete_flag=0) AND delete_flag=0`
          ).get(s.id) as { id: string; display_name: string | null } | undefined
          const student = db.prepare(
            `SELECT display_name FROM User WHERE id=? AND delete_flag=0`
          ).get(s.id) as { display_name: string | null } | undefined
          if (guardian) {
            const { sendMessage } = await import('../services/notify.service')
            const sName = student?.display_name || '孩子'
            const reasons = snap.urgency.reasons.slice(0, 3).join('；')
            await sendMessage(guardian.id, `⚠️ ${sName} 的学习状态需要关注\n${reasons}\n\n建议来聊天区查看详情。`)
          }
        }
      } catch (err) {
        console.error(`refreshSobrietySnapshot failed for ${s.id}:`, err)
      }
    }
  }

  // ─────────────────────────────────────────────
  // 1.4 自我唤醒心跳 — 每30分钟扫描所有学生状态
  // ─────────────────────────────────────────────

  async runHeartbeat(force = false): Promise<{ scanned: number; actions: string[] }> {
    const now = Date.now()
    if (!force && now - this.lastHeartbeatAt < this.SILENCE_INTERVAL_MS) {
      return { scanned: 0, actions: ['skipped: silence interval'] }
    }
    this.lastHeartbeatAt = now

    if (this.isDoNotDisturb()) {
      return { scanned: 0, actions: ['skipped: do-not-disturb'] }
    }

    const db = getDB()
    const students = db.prepare(
      `SELECT id FROM User WHERE role='student' AND delete_flag=0`
    ).all() as Array<{ id: string }>

    const allActions: string[] = []

    for (const s of students) {
      try {
        const actions = await this.heartbeatForStudent(s.id)
        allActions.push(...actions)
      } catch (err) {
        console.error(`Heartbeat failed for student ${s.id}:`, err)
      }
    }

    console.log(`[Heartbeat] Scanned ${students.length} students, actions: ${allActions.length}`)
    return { scanned: students.length, actions: allActions }
  }

  private async heartbeatForStudent(studentId: string): Promise<string[]> {
    const db = getDB()
    const actions: string[] = []

    // 1. 检查即将到期的 Todo
    const { getDueSoonTodos, markReminded } = await import('../services/todo.service')
    const { recordThought } = await import('../services/thought.service')
    const { getOrRefreshSnapshot } = await import('../services/sobriety.service')

    const dueSoon = getDueSoonTodos(studentId)
    if (dueSoon.length > 0) {
      for (const todo of dueSoon) {
        markReminded(todo.id)
        actions.push(`todo_due_soon:${todo.title}`)
      }
      await this.logAction(
        studentId,
        'todo_reminder',
        `${dueSoon.length} 个待办即将到期：${dueSoon.map(t => t.title).join('、')}`,
        'heartbeat',
        null,
        'success'
      )
    }

    // 2. 检查薄弱知识点（保留率 < 30% 且今天尚未提醒过）
    const snap = getOrRefreshSnapshot(studentId, 30 * 60 * 1000)
    const criticalKPs = snap.due_reviews.filter(r => r.retention < 0.3)
    if (criticalKPs.length > 0) {
      actions.push(`critical_kp:${criticalKPs.map(k => k.topic).join(',')}`)
    }

    // 3. 有持续卡点且距上次心跳思考 > 24h，记录一次思考
    const lastThought = db.prepare(
      `SELECT created_at FROM AgentThought WHERE student_id=? ORDER BY created_at DESC LIMIT 1`
    ).get(studentId) as { created_at: number } | undefined

    const needsThought = !lastThought || Date.now() - lastThought.created_at > 24 * 60 * 60 * 1000

    if (needsThought) {
      const summaryParts: string[] = []
      if (dueSoon.length > 0) summaryParts.push(`${dueSoon.length} 个待办即将到期`)
      if (criticalKPs.length > 0) summaryParts.push(`${criticalKPs.length} 个知识点保留率严重下降`)
      if (snap.persistent_blocks.length > 0) summaryParts.push(`${snap.persistent_blocks.length} 个持续卡点未突破`)
      if (snap.exam) summaryParts.push(`距 ${snap.exam.type} 还有 ${snap.exam.days_left} 天`)

      const summary = summaryParts.length > 0 ? summaryParts.join('；') : '暂无紧迫事项，状态良好'
      const nextFocus = snap.due_reviews[0]?.topic || snap.persistent_blocks[0]?.topic || undefined

      recordThought({
        student_id: studentId,
        triggered_by: 'heartbeat',
        summary,
        actions_taken: actions,
        next_focus: nextFocus,
        urgency: snap.urgency.level
      })
      actions.push('thought_recorded')

      // 小黑屋自动进出检测（依赖 thought 记录，所以在 recordThought 之后）
      try {
        const { autoCheckBlackRoom } = await import('../services/blackroom.service')
        const entered = autoCheckBlackRoom(studentId, snap.urgency.level, snap.urgency.reasons)
        if (entered) {
          actions.push('blackroom_entered')
          // 使 system prompt 缓存失效，下次对话立即拿到新指令
          this.systemPromptCache.delete(`${studentId}_${studentId}`)
        }
      } catch (err) {
        console.error('[BlackRoom] autoCheck error:', err)
      }

      // 4. 有重要事项 → 推送给学生（仅在 6:00-22:00 之间，且学生不在活跃对话中）
      const hour = new Date().getHours()
      const isGoodHour = hour >= 6 && hour < 22
      // 如果学生 15 分钟内刚有过 AI 对话，跳过推送（他们正在用 App，不需要打扰）
      const recentChat = db.prepare(
        `SELECT create_time FROM ChatHistory WHERE user_id=? AND delete_flag=0 ORDER BY create_time DESC LIMIT 1`
      ).get(studentId) as { create_time: number } | undefined
      const recentlyActive = recentChat && (Date.now() - recentChat.create_time < 15 * 60 * 1000)
      if (isGoodHour && summaryParts.length > 0 && !this.isDoNotDisturb() && !recentlyActive) {
        const { sendMessage } = await import('../services/notify.service')

        const lines: string[] = ['嘿，我刚扫了一下你的学习状态：']
        if (dueSoon.length > 0) {
          const names = dueSoon.slice(0, 3).map(t => `「${t.title}」`).join('、')
          lines.push(`📋 ${names}${dueSoon.length > 3 ? ` 等 ${dueSoon.length} 个待办` : ''}快到期了`)
        }
        if (criticalKPs.length > 0) {
          const topics = criticalKPs.slice(0, 3).map(k => k.topic).join('、')
          lines.push(`📚 ${topics}${criticalKPs.length > 3 ? ` 等 ${criticalKPs.length} 个知识点` : ''}快遗忘了，记忆保留率 < 30%`)
        }
        if (snap.persistent_blocks.length > 0) {
          lines.push(`🔄 ${snap.persistent_blocks[0].topic} 卡了好几次，要不要换个角度试试？`)
        }
        if (snap.exam) {
          lines.push(`⏰ 距 ${snap.exam.type} 还有 ${snap.exam.days_left} 天`)
        }
        lines.push('来聊天区找我，我帮你安排！')

        await sendMessage(studentId, lines.join('\n'))
        actions.push('notification_sent')
      }
    }

    return actions
  }

  // 手动触发心跳（供 API 端点调用）
  async triggerHeartbeat(): Promise<{ scanned: number; actions: string[] }> {
    return this.runHeartbeat(true)
  }

  // ─────────────────────────────────────────────
  // AI 自排唤醒执行器 — 每分钟检查
  // ─────────────────────────────────────────────

  private async fireScheduledWakeups(): Promise<void> {
    const db = getDB()
    const now = Date.now()

    const due = db.prepare(
      `SELECT id, student_id, target, message FROM AgentSchedule
       WHERE status='pending' AND trigger_at <= ? LIMIT 50`
    ).all(now) as Array<{ id: string; student_id: string; target: string; message: string }>

    if (due.length === 0) return

    const { sendMessage } = await import('../services/notify.service')

    for (const row of due) {
      try {
        const targets: string[] = []

        const msgWithHint = row.message + '\n\n→ 打开「AI对话」回复我'

        if (row.target === 'student' || row.target === 'both') {
          await sendMessage(row.student_id, msgWithHint)
          targets.push('student')
        }

        if (row.target === 'guardian' || row.target === 'both') {
          const guardian = db.prepare(
            `SELECT id FROM User WHERE id=(SELECT guardian_id FROM User WHERE id=? AND delete_flag=0) AND delete_flag=0`
          ).get(row.student_id) as { id: string } | undefined
          if (guardian) {
            await sendMessage(guardian.id, msgWithHint)
            targets.push('guardian')
          }
        }

        db.prepare(
          `UPDATE AgentSchedule SET status='done', fired_at=? WHERE id=?`
        ).run(now, row.id)

        console.log(`[Schedule] fired ${row.id.slice(0,8)} → ${targets.join('+')}`)
      } catch (err) {
        console.error(`[Schedule] fire failed for ${row.id}:`, err)
      }
    }
  }

  // ─────────────────────────────────────────────
  // Task persistence helpers
  // ─────────────────────────────────────────────

  private createTask(
    taskType: string,
    studentId: string,
    triggerType: string,
    inputSummary?: string
  ): string {
    const db = getDB()
    const taskId = uuidv4()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO AgentTask (id, task_type, student_id, status, trigger_type, input_summary, create_time, update_time, delete_flag)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, 0)
    `).run(taskId, taskType, studentId, triggerType, inputSummary || null, now, now)
    return taskId
  }

  private updateTask(
    taskId: string,
    status: 'running' | 'completed' | 'failed',
    output?: string,
    error?: string
  ): void {
    const db = getDB()
    const now = new Date().toISOString()
    if (status === 'running') {
      db.prepare(`
        UPDATE AgentTask SET status = 'running', started_at = ?, update_time = ? WHERE id = ?
      `).run(now, now, taskId)
    } else {
      db.prepare(`
        UPDATE AgentTask SET status = ?, output = ?, error = ?, completed_at = ?, update_time = ? WHERE id = ?
      `).run(status, output || null, error || null, now, now, taskId)
    }
  }

  // ─────────────────────────────────────────────
  // AI call
  // ─────────────────────────────────────────────

  async callAI(
    prompt: string,
    model?: string,
    apiKey?: string,
    baseUrl?: string
  ): Promise<string | null> {
    try {
      const configResult = getAIConfig()
      const aiConfig = configResult.data as AIConfig

      const rawModel = model || aiConfig?.modelId || 'gpt-3.5-turbo'
      const finalApiKey = apiKey || aiConfig?.apiKey
      const finalBaseUrl = (baseUrl || aiConfig?.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')

      if (!finalApiKey) {
        console.warn('No API key configured')
        return null
      }

      // models.dev 格式 "provider/model" → 只取模型名
      const finalModel = rawModel.includes('/') ? rawModel.split('/').slice(1).join('/') : rawModel

      // base URL 含 /anthropic → 走 Anthropic Messages API
      const isAnthropic = finalBaseUrl.includes('/anthropic')

      if (isAnthropic) {
        const endpoint = finalBaseUrl + '/messages'
        const response = await _axiosDirect.post(
          endpoint,
          {
            model: finalModel,
            max_tokens: 2000,
            messages: [{ role: 'user', content: prompt }]
          },
          {
            headers: {
              'x-api-key': finalApiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        )
        // content 可能含 thinking 块，找第一个 type=text 的块
        const textBlock = (response.data?.content as Array<{type: string; text?: string}> | undefined)
          ?.find((c) => c.type === 'text')
        return textBlock?.text || null
      } else {
        const endpoint = finalBaseUrl + '/chat/completions'
        const response = await _axiosDirect.post(
          endpoint,
          {
            model: finalModel,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 2000
          },
          {
            headers: {
              Authorization: `Bearer ${finalApiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        )
        return (response.data?.choices?.[0]?.message?.content as string) || null
      }
    } catch (err) {
      console.error('callAI error:', err)
      return null
    }
  }

  // ─────────────────────────────────────────────
  // Two-stage autonomous cycle: Planner → Executors
  // ─────────────────────────────────────────────

  async runAutonomousCycle(studentId: string): Promise<void> {
    if (this.processingStudents.has(studentId)) {
      console.log(`Autonomous cycle already running for student ${studentId}, skipping`)
      return
    }

    if (this.isDoNotDisturb()) {
      console.log(`Do-not-disturb active, skipping autonomous cycle for student ${studentId}`)
      return
    }

    this.processingStudents.add(studentId)

    try {
      console.log(`Starting autonomous cycle for student ${studentId}`)

      const configResult = getAIConfig()
      if (!configResult.success || !(configResult.data as { apiKey: string })?.apiKey) {
        console.warn('AI config not set, skipping autonomous cycle')
        await this.logAction(studentId, 'no_action', 'AI 未配置，跳过', 'autonomous', null, 'success')
        return
      }

      const aiConfig = configResult.data as AIConfig

      // Stage 1: Build context once, shared across all executors
      let contextData: AgentContextData
      try {
        contextData = this.context.buildContext(studentId)
      } catch (err) {
        console.error('Failed to build context:', err)
        return
      }

      // Stage 2: Planner decides which tasks to run
      const plannerPrompt = buildPlannerPrompt(contextData)
      const plannerResponse = await this.callAI(
        plannerPrompt,
        aiConfig.modelId,
        aiConfig.apiKey,
        aiConfig.baseUrl
      )

      if (!plannerResponse) {
        await this.logAction(studentId, 'no_action', 'Planner AI 无响应', 'autonomous', aiConfig.modelId, 'failed')
        return
      }

      const plan = parsePlan(plannerResponse)
      const allActiveTasks = (plan?.tasks ?? []).filter((t) => t.type !== 'no_action')

      // 每次自主循环最多发 1 条 bot 消息，防止多任务同时轰炸学生
      const MESSAGE_TASK_TYPES = new Set(['push_suggestion', 'daily_review', 'overdue_analysis', 'proactive_encouragement', 'exam_alert'])
      let msgCount = 0
      const activeTasks = allActiveTasks.filter(t => {
        if (MESSAGE_TASK_TYPES.has(t.type)) return msgCount++ === 0
        return true
      })

      if (activeTasks.length === 0) {
        console.log(`Planner: no tasks needed for student ${studentId}. Thinking: ${plan?.thinking ?? '—'}`)
        await this.logAction(
          studentId,
          'no_action',
          plan?.thinking || '规划器判断无需操作',
          'autonomous',
          aiConfig.modelId,
          'success'
        )
        return
      }

      console.log(
        `Planner scheduled ${activeTasks.length} tasks for ${studentId}: ${activeTasks.map((t) => t.type).join(', ')}`
      )

      // Stage 3: Execute all tasks in parallel
      await Promise.all(
        activeTasks.map((task) => this.runExecutorTask(task, studentId, contextData, aiConfig))
      )
    } catch (err) {
      console.error(`Autonomous cycle error for student ${studentId}:`, err)
      await this.logAction(
        studentId,
        'no_action',
        `自主循环错误: ${err instanceof Error ? err.message : String(err)}`,
        'autonomous',
        null,
        'failed'
      )
    } finally {
      this.processingStudents.delete(studentId)
    }
  }

  private async runExecutorTask(
    task: PlannedTask,
    studentId: string,
    contextData: AgentContextData,
    aiConfig: AIConfig
  ): Promise<void> {
    const taskId = this.createTask(task.type, studentId, 'autonomous', task.reason)
    this.updateTask(taskId, 'running')

    try {
      const executor = getExecutor(task.type)
      if (!executor) {
        this.updateTask(taskId, 'failed', undefined, `未找到执行器: ${task.type}`)
        console.warn(`No executor registered for task type: ${task.type}`)
        return
      }

      const result = await executor(task, contextData, aiConfig, this.callAI.bind(this))

      if (result.success && result.output) {
        this.updateTask(taskId, 'completed', JSON.stringify(result.output))
      } else {
        this.updateTask(taskId, 'failed', undefined, result.error || '执行失败')
      }

      if (result.sideEffects) {
        for (const effect of result.sideEffects) {
          await this.applySideEffect(effect, studentId)
        }
      }

      await this.logAction(
        studentId,
        task.type,
        task.reason,
        'autonomous',
        aiConfig.modelId,
        result.success ? 'success' : 'failed',
        result.error
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.updateTask(taskId, 'failed', undefined, msg)
      console.error(`Executor error for task type "${task.type}":`, err)
    }
  }

  private async applySideEffect(effect: SideEffect, studentId: string): Promise<void> {
    try {
      if (effect.type === 'bot_message') {
        await botSendMessage(effect.userId || studentId, effect.content)
      } else if (effect.type === 'set_schedule') {
        this.scheduler.createSchedule(
          effect.studentId || studentId,
          effect.cron,
          effect.description
        )
      }
    } catch (err) {
      console.error('applySideEffect error:', err)
    }
  }

  // ─────────────────────────────────────────────
  // Proactive task methods (direct IPC triggers)
  // These use the same executor logic for consistency.
  // ─────────────────────────────────────────────

  async generateResourceBrief(resourceInfo: {
    resourceId?: string
    fileName?: string
    subject?: string
    fileType?: string
  }): Promise<void> {
    const studentId = 'superadmin'
    const summary = resourceInfo.fileName
      ? `资源：${resourceInfo.fileName}${resourceInfo.subject ? ' [' + resourceInfo.subject + ']' : ''}`
      : '新资源'

    const taskId = this.createTask('resource_brief', studentId, 'email_resource', summary)

    try {
      this.updateTask(taskId, 'running')

      const configResult = getAIConfig()
      if (!configResult.success || !(configResult.data as { apiKey: string })?.apiKey) {
        this.updateTask(taskId, 'failed', undefined, 'AI 未配置')
        return
      }

      const aiConfig = configResult.data as AIConfig
      const contextData = this.context.buildContext(studentId)
      const task: PlannedTask = {
        type: 'resource_brief',
        priority: 'high',
        reason: summary,
        params: {
          fileName: resourceInfo.fileName,
          subject: resourceInfo.subject,
          fileType: resourceInfo.fileType
        }
      }
      const result = await resourceBriefExecutor(task, contextData, aiConfig, this.callAI.bind(this))

      if (result.success && result.output) {
        this.updateTask(taskId, 'completed', JSON.stringify(result.output))
      } else {
        this.updateTask(taskId, 'failed', undefined, result.error)
      }

      await this.logAction(studentId, 'resource_brief', summary, 'email_resource', aiConfig.modelId, result.success ? 'success' : 'failed')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.updateTask(taskId, 'failed', undefined, msg)
      console.error('generateResourceBrief error:', err)
    }
  }

  async generateDailyReview(studentId: string): Promise<void> {
    const today = new Date().toLocaleDateString('zh-CN')
    const taskId = this.createTask('daily_review', studentId, 'scheduled', `${today} 每日回顾`)

    try {
      this.updateTask(taskId, 'running')

      const configResult = getAIConfig()
      if (!configResult.success || !(configResult.data as { apiKey: string })?.apiKey) {
        this.updateTask(taskId, 'failed', undefined, 'AI 未配置')
        return
      }

      const aiConfig = configResult.data as AIConfig
      const contextData = this.context.buildContext(studentId)
      const task: PlannedTask = { type: 'daily_review', priority: 'high', reason: `${today} 每日回顾` }

      const result = await dailyReviewExecutor(task, contextData, aiConfig, this.callAI.bind(this))

      if (result.success && result.output) {
        this.updateTask(taskId, 'completed', JSON.stringify(result.output))
      } else {
        this.updateTask(taskId, 'failed', undefined, result.error)
      }

      await this.logAction(studentId, 'daily_review', `${today} 每日回顾`, 'scheduled', aiConfig.modelId, result.success ? 'success' : 'failed')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.updateTask(taskId, 'failed', undefined, msg)
      console.error('generateDailyReview error:', err)
    }
  }

  async generateWeaknessQuiz(studentId: string): Promise<void> {
    const taskId = this.createTask('weakness_quiz', studentId, 'manual', '薄弱点测验')

    try {
      this.updateTask(taskId, 'running')

      const configResult = getAIConfig()
      if (!configResult.success || !(configResult.data as { apiKey: string })?.apiKey) {
        this.updateTask(taskId, 'failed', undefined, 'AI 未配置')
        return
      }

      const aiConfig = configResult.data as AIConfig
      const contextData = this.context.buildContext(studentId)
      const task: PlannedTask = { type: 'weakness_quiz', priority: 'high', reason: '薄弱点测验' }

      const result = await weaknessQuizExecutor(task, contextData, aiConfig, this.callAI.bind(this))

      if (result.success && result.output) {
        this.updateTask(taskId, 'completed', JSON.stringify(result.output))
      } else {
        this.updateTask(taskId, 'failed', undefined, result.error)
      }

      await this.logAction(studentId, 'weakness_quiz', '薄弱点测验', 'manual', aiConfig.modelId, result.success ? 'success' : 'failed')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.updateTask(taskId, 'failed', undefined, msg)
      console.error('generateWeaknessQuiz error:', err)
    }
  }

  // ─────────────────────────────────────────────
  // Event handler
  // ─────────────────────────────────────────────

  async handleEvent(event: AgentEvent): Promise<void> {
    try {
      console.log(`AgentEngine handling event: ${event.type}`)

      switch (event.type) {
        case 'new_learning_data':
        case 'plan_changed': {
          const studentId = event.studentId as string
          if (studentId) {
            await this.runAutonomousCycle(studentId)
          }
          break
        }

        case 'new_resource':
        case 'workspace_update': {
          await this.generateResourceBrief({
            resourceId: event.resourceId as string | undefined,
            fileName: event.fileName as string | undefined,
            subject: event.subject as string | undefined,
            fileType: event.fileType as string | undefined
          })
          break
        }

        case 'bot_message': {
          const userId = event.userId as string
          const role = event.role as string
          const content = event.content as string

          if ((role === 'student' || role === 'guardian' || role === 'superadmin') && userId) {
            const response = await this.generateBotResponse(userId, content)
            if (response) {
              await botSendMessage(userId, response)
            }
          }
          break
        }

        case 'workspace_full': {
          try {
            const { workspaceService } = require('../services/workspace.service')
            const result = await workspaceService.cleanupTemp()
            console.log(`Workspace cleanup: deleted ${result.deleted} files, freed ${result.freedBytes} bytes`)
          } catch (err) {
            console.error('Workspace cleanup failed:', err)
          }
          break
        }
      }
    } catch (err) {
      console.error('AgentEngine handleEvent error:', err)
    }
  }

  // ─────────────────────────────────────────────
  // Bot response (chat reply mode)
  // ─────────────────────────────────────────────

  async generateBotResponse(userId: string, userMessage: string): Promise<string | null> {
    const contextData = this.context.buildContext(userId)
    const planSection = contextData.activePlan
      ? `学习方向：${contextData.activePlan.title}（${contextData.activePlan.subjects.join('、')}）`
      : '学习方向：未设置'

    const prompt = `你是个性化学习辅助 AI PersonalAC。请根据学生学习情况，给出友好的回复。

## 学生状态
${planSection}
薄弱知识点：${contextData.weakPoints.slice(0, 3).map((p) => p.topic).join('、') || '暂无'}

## 用户消息
${userMessage}

如果是学习问题，提供解答；如果是闲聊，友好回应并引导到学习话题。直接输出回复内容。`

    return await this.callAI(prompt)
  }

  // ─────────────────────────────────────────────
  // ReAct Chat（Tool Use + Streaming）
  // ─────────────────────────────────────────────

  private buildChatConfig(): {
    apiKey: string; baseUrl: string; model: string; isAnthropic: boolean; isReasoning: boolean; supportsImages: boolean
  } | null {
    const aiConfig = (getAIConfig().data as AIConfig)
    const apiKey = aiConfig?.apiKey
    if (!apiKey) return null
    const baseUrl = (aiConfig?.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
    const rawModel = aiConfig?.modelId || 'gpt-4o'
    const model = rawModel.includes('/') ? rawModel.split('/').slice(1).join('/') : rawModel
    const isAnthropic = baseUrl.includes('/anthropic') || baseUrl.includes('anthropic.com')
    const isReasoning = /o1|o3|o4[-/]|thinking|reason/i.test(model)
    // MiniMax 系列、纯文本 LLM 没有原生视觉能力，须靠视觉模型预处理
    const knownVisionModels = /gpt-4o|claude|gemini|qwen.*vl|llava|minicpm-v|gpt-4-vision/i
    const knownTextOnlyModels = /minimax|deepseek-chat|llama-3[\.-]1[^-]*8b|qwen.*chat/i
    const supportsImages = knownVisionModels.test(model) && !knownTextOnlyModels.test(model)
    return { apiKey, baseUrl, model, isAnthropic, isReasoning, supportsImages }
  }

  private buildSystemPrompt(loginUserId: string, studentId: string): string {
    const db = require('../database').getDB()

    const loginUser = db.prepare(
      `SELECT role, display_name FROM User WHERE id=? AND delete_flag=0`
    ).get(loginUserId) as { role: string; display_name: string | null } | undefined

    const student = db.prepare(
      `SELECT display_name, student_grade FROM User WHERE id=? AND delete_flag=0`
    ).get(studentId) as { display_name: string | null; student_grade: string | null } | undefined

    const role = loginUser?.role ?? 'student'
    const studentName = student?.display_name ?? '学生'
    const grade = student?.student_grade ? `（${student.student_grade}）` : ''

    const plan = db.prepare(
      `SELECT subjects FROM Plan WHERE student_id=? AND status='active' AND delete_flag=0 ORDER BY create_time DESC LIMIT 1`
    ).get(studentId) as { subjects: string } | undefined

    const subjects = plan ? JSON.parse(plan.subjects || '[]').join('、') : '未设置'

    const goal = db.prepare(
      `SELECT exam_type, exam_date, school_progress, guardian_notes FROM StudentGoal WHERE student_id=? AND delete_flag=0 ORDER BY update_time DESC LIMIT 1`
    ).get(studentId) as { exam_type: string | null; exam_date: number | null; school_progress: string | null; guardian_notes: string | null } | undefined

    let goalSection = ''
    if (goal?.exam_type || goal?.exam_date || goal?.school_progress) {
      const parts: string[] = []
      if (goal.exam_type) parts.push(`目标考试：${goal.exam_type}`)
      if (goal.exam_date) {
        const days = Math.ceil((goal.exam_date - Date.now()) / 86400000)
        parts.push(`距考试：${days > 0 ? `${days} 天` : '已过'}`)
      }
      if (goal.school_progress) parts.push(`学校进度：${goal.school_progress}`)
      if (goal.guardian_notes) parts.push(`监护人备注：${goal.guardian_notes}`)
      goalSection = `\n学习目标：${parts.join('，')}`
    }

    // 自我清醒注入：每次会话开始前，AI 已经知道局势
    let sobrietySection = ''
    try {
      const { getOrRefreshSnapshot } = require('../services/sobriety.service')
      const snap = getOrRefreshSnapshot(studentId, 30 * 60 * 1000)
      if (snap && snap.today_priority) {
        const urgencyTag = snap.urgency.level === 'urgent' ? '【紧迫】'
                         : snap.urgency.level === 'attention' ? '【关注】'
                         : ''
        const lines: string[] = [`清醒视角${urgencyTag}：${snap.today_priority}`]
        if (snap.persistent_blocks.length > 0) {
          const blocks = snap.persistent_blocks.slice(0, 2)
            .map((b: { topic: string; root_cause: string | null }) => b.root_cause ? `${b.topic}（${b.root_cause}）` : b.topic)
            .join('、')
          lines.push(`反复卡点：${blocks}`)
        }
        if (snap.subject_drift?.drift_warning) {
          lines.push(`学科漂移⚠：${snap.subject_drift.drift_warning}`)
        }
        if (snap.unresolved_from_last) {
          lines.push(`上次悬念：${snap.unresolved_from_last}`)
        }
        sobrietySection = '\n' + lines.join('\n')
      }
    } catch (err) {
      // 快照不可用不影响对话
    }

    // WolframAlpha 配置状态
    let wolframLine = ''
    try {
      const { getRawWolframAppId } = require('../services/settings.service')
      if (getRawWolframAppId()) {
        wolframLine = '\n- 数学计算、解方程、微积分、科学查询 → 调用 wolfram_query 获取精确结果和步骤'
      }
    } catch { /* 不影响对话 */ }

    // 小黑屋状态
    let blackRoomState: import('../services/blackroom.service').BlackRoomState | null = null
    try {
      const { getBlackRoomState } = require('../services/blackroom.service')
      blackRoomState = getBlackRoomState(studentId)
    } catch { /* 不影响对话 */ }

    if (role !== 'student') {
      const guardianName = loginUser?.display_name ?? '监护人'
      // 监护人侧：有小黑屋状态则加中性内部提示，绝不透露原因和策略
      const guardianBRNote = blackRoomState
        ? `\n\n[内部提示 - 勿向监护人透露细节] 此学生正处于特别辅导调整期（${Math.floor((Date.now() - blackRoomState.entered_at) / 86400000)} 天）。监护人问到孩子状态时，可用"孩子最近需要多一点引导，我正在尝试找到合适的切入方式"等中性措辞，不透露具体原因。`
        : ''
      return `你是学习辅助 AI PersonalAC。当前与 ${guardianName} 对话，对方是 ${studentName}${grade} 的监护人。

学生科目：${subjects}${goalSection}${sobrietySection}${guardianBRNote}

规则：
- 监护人提供的成绩和试卷数据可信，update_knowledge 用 source="guardian_upload"，无需验证
- 询问学生状态时先调用 get_student_summary
- 上传图片（试卷/成绩单）→ 逐题分析，调用 update_knowledge 更新知识点
- 提到学习活动 → 调用 record_learning
- 设置/修改计划 → 调用 set_plan
- 当"清醒视角"显示紧迫事项时，主动汇报给监护人${wolframLine}
- 说"给孩子布置/添加/安排 XXX 任务" → 调用 manage_todo action=create 创建待办
- 问"孩子有什么任务/完成情况" → 调用 manage_todo action=list
- 发图并说"发给孩子/给他看看" → 调用 relay_image target=student（附 caption）
- 想调整学习计划/科目侧重 → 调用 set_plan
- 问"孩子最近学习状态/清醒视角" → 调用 get_sobriety 或 get_student_summary
- 说"帮我存/整理成文档" → 调用 drive_write；"孩子云盘有什么" → drive_list
- 分析完成绩/状态 → 调用 update_student_radar 更新六维图
- 说"X 点提醒孩子/过几天跟进" → 调用 schedule_wakeup action=set，可 target=student 或 guardian 或 both

回复风格：简洁、数据导向。`
    }

    // 待办（must_do 优先展示，区分必做项和普通待办）
    const pendingTodos = db.prepare(
      `SELECT title, priority, due_date, must_do FROM Todo
       WHERE student_id=? AND status='pending' AND delete_flag=0
       ORDER BY must_do DESC, CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, due_date ASC LIMIT 10`
    ).all(studentId) as { title: string; priority: string; due_date: number | null; must_do: number }[]

    let todoSection = ''
    if (pendingTodos.length > 0) {
      const now = Date.now()
      const mustDos = pendingTodos.filter(t => t.must_do)
      const normal = pendingTodos.filter(t => !t.must_do)
      const fmt = (t: { title: string; due_date: number | null }) => {
        const overdue = t.due_date && t.due_date < now ? '【逾期】' : ''
        const due = t.due_date ? `（截止：${new Date(t.due_date).toLocaleDateString('zh-CN')}）` : ''
        return `  - ${overdue}${t.title}${due}`
      }
      const parts: string[] = []
      if (mustDos.length > 0) parts.push(`家长指定必做（${mustDos.length} 项）：\n${mustDos.map(fmt).join('\n')}`)
      if (normal.length > 0) parts.push(`待办事项（${normal.length} 项）：\n${normal.map(fmt).join('\n')}`)
      todoSection = '\n\n' + parts.join('\n\n')
    }

    // 学习状态：连续天数 + SRS 到期数
    let statusLine = ''
    try {
      const activeDays = db.prepare(`
        SELECT DISTINCT strftime('%Y-%m-%d', record_date/1000, 'unixepoch', 'localtime') AS day
        FROM LearningRecord WHERE student_id=? AND delete_flag=0 ORDER BY day DESC LIMIT 30
      `).all(studentId) as Array<{ day: string }>
      const todayStr = new Date().toLocaleDateString('sv')
      let streak = 0; let expected = todayStr
      for (const { day } of activeDays) {
        if (day === expected) {
          streak++
          const d = new Date(expected + 'T00:00:00'); d.setDate(d.getDate() - 1)
          expected = d.toLocaleDateString('sv')
        } else break
      }
      const { getDueCount } = require('../services/srs.service') as typeof import('../services/srs.service')
      const dueCount = getDueCount(studentId)
      const parts: string[] = []
      if (streak > 0) parts.push(`连续学习 ${streak} 天`)
      if (dueCount > 0) parts.push(`${dueCount} 个知识点待复习`)
      if (parts.length > 0) statusLine = `\n状态：${parts.join('，')}`
    } catch { /* non-fatal */ }

    return `你是学习辅助 AI。当前与学生 ${studentName}${grade} 对话。

科目：${subjects}${goalSection}${todoSection}${sobrietySection}${statusLine}

清醒原则（最重要）：
- 上面的"清醒视角"是你在对话开始前已经掌握的状态。学生还没说话，你已经知道今天最该关注什么。
- 如果"清醒视角"非空，主动用它引导对话方向：开场可以用"我注意到 X 已经有几天没复习了，要不要先看一下？"这类句式
- 不要被动等待学生提问；如果学生只是闲聊或问无关的事，在合适时机把对话拉回到清醒视角的优先项
- 如果学生有上次未理清的悬念，主动接续

规则：
- 询问学习状态时先调用 get_student_summary
- 想看更详细的清醒视角细节时调用 get_sobriety
- 学生说"我会了"→ 先出题验证，答对后再调用 update_knowledge
- 上传图片（练习/作业）→ 分析后调用 update_knowledge（source="agent_observed"）
- 提到学习活动 → 调用 record_learning
- 学生做题答错 → 立刻调用 record_mistake 记入错题本（附题目原文、学生答案、正确答案、error_type）
- 学生说"我这道题做错了"→ 调用 record_mistake 记录
- 学生说"我复习完/已经看过了 XX 错题" → 调用 record_mistake action=mark_reviewed
- get_student_summary 返回 unreviewedMistakes 时，优先引导学生做错题复习
- 发现持续性错误 → 填写 error_type 和 root_cause${wolframLine}
- 学生说"我要完成/做/学 XXX"、"帮我记一下"、"我打算 XXX" → 立刻调用 manage_todo action=create 创建待办
- 学生说"我完成了/做完了/搞定了 XXX" → 直接调用 manage_todo action=complete title_search=XXX，无需先 list；完成后给出鼓励
- 学生问"我有什么任务/待办" → 调用 manage_todo action=list 列出，别用静态的系统提示内容回答
- 学生发图并说"发给家长/分享给妈妈/爸爸" → 调用 relay_image target=guardian
- 学生说"通知家长/告诉妈妈/爸爸/监护人 XXX"、"我需要任务"、"作业做完了"、"有问题想问家长"、"跟爸爸/妈妈/家长打个招呼/问个好/说声好"、"帮我跟爸爸/妈妈说 XXX"、"问候一下家长" → 调用 notify_guardian，message 为学生想传达的内容（如果是打招呼，message 用温暖自然的招呼语，如"爸爸好！开心在这里向您问好 😊"）
- 学生说"存到云盘/帮我保存 XXX" → 调用 drive_write；"我云盘里有什么" → drive_list；"读取/打开 XXX 文件" → drive_read
- 综合分析完学生状态、或一次对话结束有足够数据后 → 调用 update_student_radar 更新六维评估图
- 学生说"提醒我/X 点叫我/过 N 天再说" → 调用 schedule_wakeup action=set，设好时间和消息；说"有哪些提醒" → action=list；说"取消提醒" → action=cancel

讲解追踪：
- 解释后学生懂了 → log_explanation（understood=true，记录方法）
- 没懂 → 先追问"哪一步不清楚"，找到根因后 log_explanation（understood=false，填 root_cause），换一种方法重讲
- 不要用同一种方式解释两遍：公式推导 → 数值例子 → 类比 → 图示 → 反例

前置依赖诊断（重要）：
- 换了两种方法学生还是不懂 → 怀疑是前置知识有缺口，调用 check_prerequisites 诊断
- 发现前置缺口（如学生学不懂"导数"是因为"极限"不稳） → 调用 link_prerequisite 记录这个依赖关系，然后明确告诉学生："我们先把 X 补一下，X 搞定了 Y 就好理解了"，切换讲解目标到前置知识点
- 前置补完、学生掌握后 → 回到原来的知识点，告知"现在来看之前那道题"

回复风格：步骤清晰，鼓励为主。${blackRoomState ? buildBlackRoomPrompt(blackRoomState) : ''}`
  }

  // 单次流式调用，同时收集 tool calls（消除双倍 API 调用）
  // 返回: { toolCalls, preToolText } —— toolCalls 为空表示已完整流式输出最终回复
  private async streamOnce(
    cfg: { apiKey: string; baseUrl: string; model: string; isAnthropic: boolean; isReasoning: boolean },
    systemPrompt: string,
    messages: unknown[],
    tools: unknown[],
    onToken: (t: string) => void,
    onThinking?: (text: string) => void,
    signal?: AbortSignal
  ): Promise<{ toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>; preToolText: string }> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { resolve({ toolCalls: [], preToolText: '' }); return }
      signal?.addEventListener('abort', () => resolve({ toolCalls: [], preToolText: '' }), { once: true })

      let buf = ''
      let preToolText = ''
      const toolMap: Record<number, { id: string; name: string; argsBuf: string }> = {}

      if (cfg.isAnthropic) {
        const body: Record<string, unknown> = {
          model: cfg.model, max_tokens: 16000,
          // Anthropic server-side prompt caching（5分钟 TTL，节省 ~50% system prompt token 费用）
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          messages, tools, stream: true
        }
        if (cfg.isReasoning) body.thinking = { type: 'enabled', budget_tokens: 8000 }
        _axiosDirect.post(
          cfg.baseUrl + '/messages', body,
          { headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31', 'Content-Type': 'application/json' }, responseType: 'stream', timeout: 180000, signal }
        ).then(res => {
          res.data.on('data', (chunk: Buffer) => {
            buf += chunk.toString()
            const lines = buf.split('\n'); buf = lines.pop() || ''
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              try {
                const p = JSON.parse(line.slice(6).trim())
                if (p.type === 'content_block_start' && p.content_block?.type === 'tool_use') {
                  toolMap[p.index] = { id: p.content_block.id, name: p.content_block.name, argsBuf: '' }
                } else if (p.type === 'content_block_delta') {
                  if (p.delta?.type === 'text_delta') { onToken(p.delta.text); preToolText += p.delta.text }
                  else if (p.delta?.type === 'thinking_delta') onThinking?.(p.delta.thinking)
                  else if (p.delta?.type === 'input_json_delta' && toolMap[p.index]) {
                    toolMap[p.index].argsBuf += p.delta.partial_json
                  }
                } else if (p.type === 'message_stop') {
                  const toolCalls = Object.values(toolMap).map(tc => ({
                    id: tc.id, name: tc.name,
                    args: (() => { try { return JSON.parse(tc.argsBuf) } catch { return {} } })()
                  }))
                  resolve({ toolCalls, preToolText })
                }
              } catch {}
            }
          })
          res.data.on('end', () => {
            const toolCalls = Object.values(toolMap).map(tc => ({
              id: tc.id, name: tc.name,
              args: (() => { try { return JSON.parse(tc.argsBuf) } catch { return {} } })()
            }))
            resolve({ toolCalls, preToolText })
          })
          res.data.on('error', reject)
        }).catch((err: { response?: { status?: number } } & Error) => {
          const s = err?.response?.status
          if (s === 401) reject(new Error('API Key 无效，请前往设置页重新填写'))
          else if (s === 429) reject(new Error('请求频率过高，稍后再试'))
          else if (s && s >= 500) reject(new Error(`AI 服务暂时不可用（${s}），请稍后重试`))
          else reject(err)
        })

      } else {
        // OpenAI / compatible
        const sysMessages = cfg.isReasoning
          ? [{ role: 'user', content: `[System instructions]\n${systemPrompt}` }]
          : [{ role: 'system', content: systemPrompt }]
        const body: Record<string, unknown> = {
          model: cfg.model,
          messages: [...sysMessages, ...messages],
          tools, tool_choice: 'auto', stream: true
        }
        if (!cfg.isReasoning) body.temperature = 0.7
        else body.reasoning_effort = 'medium'
        _axiosDirect.post(
          cfg.baseUrl + '/chat/completions', body,
          { headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' }, responseType: 'stream', timeout: 180000, signal }
        ).then(res => {
          res.data.on('data', (chunk: Buffer) => {
            buf += chunk.toString()
            const lines = buf.split('\n'); buf = lines.pop() || ''
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const raw = line.slice(6).trim()
              if (raw === '[DONE]') {
                const toolCalls = Object.values(toolMap).map(tc => ({
                  id: tc.id, name: tc.name,
                  args: (() => { try { return JSON.parse(tc.argsBuf) } catch { return {} } })()
                }))
                resolve({ toolCalls, preToolText }); return
              }
              try {
                const p = JSON.parse(raw)
                const delta = p.choices?.[0]?.delta
                if (delta?.content) { onToken(delta.content); preToolText += delta.content }
                if (delta?.reasoning) onThinking?.(delta.reasoning)
                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls as Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>) {
                    if (!toolMap[tc.index]) toolMap[tc.index] = { id: tc.id ?? '', name: tc.function?.name ?? '', argsBuf: '' }
                    if (tc.id) toolMap[tc.index].id = tc.id
                    if (tc.function?.name) toolMap[tc.index].name = tc.function.name
                    if (tc.function?.arguments) toolMap[tc.index].argsBuf += tc.function.arguments
                  }
                }
              } catch {}
            }
          })
          res.data.on('end', () => {
            const toolCalls = Object.values(toolMap).map(tc => ({
              id: tc.id, name: tc.name,
              args: (() => { try { return JSON.parse(tc.argsBuf) } catch { return {} } })()
            }))
            resolve({ toolCalls, preToolText })
          })
          res.data.on('error', reject)
        }).catch((err: { response?: { status?: number } } & Error) => {
          const s = err?.response?.status
          if (s === 401) reject(new Error('API Key 无效，请前往设置页重新填写'))
          else if (s === 429) reject(new Error('请求频率过高，稍后再试'))
          else if (s && s >= 500) reject(new Error(`AI 服务暂时不可用（${s}），请稍后重试`))
          else reject(err)
        })
      }
    })
  }

  // ── 工具调用单次重试（瞬时网络错误）───────────────────────────────
  private async retryOnce<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn() } catch (e) {
      const msg = String(e)
      if (!msg.includes('ECONNRESET') && !msg.includes('ETIMEDOUT') && !msg.includes('socket hang up')) throw e
      await new Promise(r => setTimeout(r, 800))
      return fn()
    }
  }

  // ── 异步生成对话摘要（不阻塞当前响应，供下次请求注入）──────────
  private buildContextSummaryAsync(userId: string, pruned: Array<{ role: string; content: unknown }>): void {
    const text = pruned.slice(-10).map(m => {
      const role = m.role === 'user' ? '用户' : 'AI'
      const content = typeof m.content === 'string' ? m.content.slice(0, 200) : '[消息]'
      return `${role}: ${content}`
    }).join('\n')
    this.callAI(`请用2-3句话总结以下对话要点（学了什么、做了什么决定）：\n\n${text}`)
      .then(s => { if (s) this.contextSummaryCache.set(userId, { summary: s, at: Date.now() }) })
      .catch(() => {})
  }

  // ── 保留旧 streamText 供非对话场景（heartbeat bot message 等）使用 ──
  private async streamText(
    cfg: { apiKey: string; baseUrl: string; model: string; isAnthropic: boolean; isReasoning: boolean },
    systemPrompt: string,
    messages: unknown[],
    onToken: (t: string) => void,
    onDone: () => void,
    onError: (e: string) => void,
    onThinking?: (text: string) => void
  ): Promise<void> {
    try {
      const { toolCalls } = await this.streamOnce(cfg, systemPrompt, messages, [], onToken, onThinking)
      if (toolCalls.length === 0) { onDone(); return }
      // 即使意外有工具调用也正常结束
      onDone()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    }
  }

  // ── 旧版非流式（仅供 heartbeat/planner 等后台使用）────────────────────
  private async callOnce(
    cfg: { apiKey: string; baseUrl: string; model: string; isAnthropic: boolean; isReasoning: boolean },
    systemPrompt: string,
    messages: unknown[],
    tools: unknown[]
  ): Promise<{ text: string | null; toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> }> {
    if (cfg.isAnthropic) {
      const body: Record<string, unknown> = {
        model: cfg.model, max_tokens: 16000, system: systemPrompt, messages, tools
      }
      if (cfg.isReasoning) body.thinking = { type: 'enabled', budget_tokens: 8000 }
      const res = await _axiosDirect.post(
        cfg.baseUrl + '/messages', body,
        { headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 120000 }
      )
      const content = res.data?.content as Array<{ type: string; id?: string; name?: string; input?: unknown; text?: string }> ?? []
      const text = content.find(c => c.type === 'text')?.text ?? null
      const toolCalls = content.filter(c => c.type === 'tool_use')
        .map(c => ({ id: c.id!, name: c.name!, args: (c.input ?? {}) as Record<string, unknown> }))
      return { text, toolCalls }
    } else {
      const sysMessages = cfg.isReasoning
        ? [{ role: 'user', content: `[System instructions]\n${systemPrompt}` }]
        : [{ role: 'system', content: systemPrompt }]
      const body: Record<string, unknown> = {
        model: cfg.model, messages: [...sysMessages, ...messages], tools, tool_choice: 'auto'
      }
      if (!cfg.isReasoning) body.temperature = 0.7
      else body.reasoning_effort = 'medium'
      const res = await _axiosDirect.post(
        cfg.baseUrl + '/chat/completions', body,
        { headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' }, timeout: 120000 }
      )
      const msg = res.data?.choices?.[0]?.message
      const text: string | null = msg?.content ?? null
      const toolCalls = (msg?.tool_calls ?? []).map((tc: { id: string; function: { name: string; arguments: string } }) => ({
        id: tc.id, name: tc.function.name,
        args: (() => { try { return JSON.parse(tc.function.arguments) } catch { return {} } })()
      }))
      return { text, toolCalls }
    }
  }

  // ── 旧版 streamText（OpenAI 路径）保留完整实现供 callOnce 回退 ──
  private _legacyOAIStream(
    cfg: { apiKey: string; baseUrl: string; model: string; isAnthropic: boolean; isReasoning: boolean },
    systemPrompt: string,
    messages: unknown[],
    onToken: (t: string) => void,
    onDone: () => void,
    onError: (e: string) => void,
    onThinking?: (text: string) => void
  ): void {
    let done = false
    const safeDone = (): void => { if (!done) { done = true; onDone() } }
    const sysMessages = cfg.isReasoning
      ? [{ role: 'user', content: `[System instructions]\n${systemPrompt}` }]
      : [{ role: 'system', content: systemPrompt }]
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages: [...sysMessages, ...messages],
      stream: true
    }
    if (!cfg.isReasoning) body.temperature = 0.7
    else body.reasoning_effort = 'medium'
    _axiosDirect.post(
      cfg.baseUrl + '/chat/completions', body,
      { headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' }, responseType: 'stream', timeout: 180000 }
    ).then(res => {
      let buf2 = ''
      res.data.on('data', (chunk: Buffer) => {
        buf2 += chunk.toString()
        const lines2 = buf2.split('\n'); buf2 = lines2.pop() || ''
        for (const line of lines2) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') { safeDone(); return }
          try {
            const p = JSON.parse(raw)
            const delta = p.choices?.[0]?.delta
            if (delta?.content) onToken(delta.content)
            else if (delta?.reasoning) onThinking?.(delta.reasoning)
          } catch {}
        }
      })
      res.data.on('end', safeDone)
      res.data.on('error', (e: Error) => { if (!done) { done = true; onError(e.message) } })
    }).catch(err => { if (!done) { done = true; onError(err instanceof Error ? err.message : String(err)) } })
  }

  // ── 工具显示名称（全覆盖）────────────────────────────────────────────
  private static readonly TOOL_DISPLAY: Record<string, string> = {
    get_student_summary:  '正在查询学习状态…',
    update_knowledge:     '正在更新知识点…',
    set_plan:             '正在更新学习计划…',
    record_learning:      '正在记录学习活动…',
    log_explanation:      '正在记录讲解过程…',
    link_prerequisite:    '正在标记前置知识依赖…',
    check_prerequisites:  '正在诊断前置知识缺口…',
    get_sobriety:         '正在读取学情快照…',
    manage_todo:          '正在操作待办…',
    relay_image:          '正在转发图片…',
    notify_guardian:      '正在通知监护人…',
    describe_image:       '正在用视觉模型分析图片…',
    drive_list:           '正在列出文件…',
    drive_read:           '正在读取文件…',
    drive_write:          '正在写入文件…',
    wolfram_query:        '正在精确计算…',
    schedule_wakeup:      '正在设置提醒…',
    update_student_radar: '正在更新六维评估…',
  }

  async streamChatResponse(
    userId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: unknown }>,
    onToken: (token: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
    onThinking?: (toolName: string, display: string) => void,
    signal?: AbortSignal,
    options?: { sandbox?: boolean }
  ): Promise<void> {
    try {
      const cfg = this.buildChatConfig()
      if (!cfg) { onError('未配置 AI，请前往设置页面填写 API Key'); return }

      const db = require('../database').getDB()
      const loginUser = db.prepare('SELECT role FROM User WHERE id=? AND delete_flag=0').get(userId) as { role: string } | undefined
      let studentId = userId
      if (loginUser?.role !== 'student') {
        const { getPrimaryStudentId } = require('../services/auth.service')
        studentId = getPrimaryStudentId(userId) ?? userId
      }

      // ── system prompt 缓存（3分钟 TTL）────────────────────────────────
      const cacheKey = `${userId}_${studentId}`
      const cached = this.systemPromptCache.get(cacheKey)
      let systemPrompt: string
      if (cached && Date.now() - cached.builtAt < this.PROMPT_CACHE_TTL) {
        systemPrompt = cached.prompt
      } else {
        try {
          const { refreshSobrietySnapshot } = await import('../services/sobriety.service')
          refreshSobrietySnapshot(studentId)
        } catch { /* 失败不影响对话 */ }
        systemPrompt = this.buildSystemPrompt(userId, studentId)
        this.systemPromptCache.set(cacheKey, { prompt: systemPrompt, builtAt: Date.now() })
      }

      const { toOpenAITools, toAnthropicTools, getTool } = await import('../tools/index')
      const tools = cfg.isAnthropic ? toAnthropicTools() : toOpenAITools()

      // ── Token 感知裁剪（替代固定 20 条）────────────────────────────────
      const estimateTokens = (m: { role: string; content: unknown }): number => {
        if (typeof m.content === 'string') return Math.ceil(m.content.length * 0.75)
        if (!Array.isArray(m.content)) return 100
        return (m.content as Array<{ type: string; text?: string }>).reduce((s, p) => {
          if (p.type === 'image') return s + 800  // 视觉模型预处理后图片本身不发，仅保留描述；降低预算占用
          return s + Math.ceil((p.text?.length ?? 0) * 0.75)
        }, 0)
      }
      const TOKEN_BUDGET = 10000  // 提高 budget：MiniMax 204k context，视觉描述文字也需要空间
      let trimmed = [...messages]
      while (trimmed.length > 2 && trimmed.reduce((s, m) => s + estimateTokens(m), 0) > TOKEN_BUDGET) {
        trimmed = trimmed.slice(1)
      }

      // ── 上下文压缩：裁剪时注入摘要（零延迟廉价版 + 异步 AI 摘要供下次）──
      let systemPromptFinal = systemPrompt
      if (trimmed.length < messages.length) {
        const pruned = messages.slice(0, messages.length - trimmed.length)
        const cachedSummary = this.contextSummaryCache.get(userId)
        if (cachedSummary && Date.now() - cachedSummary.at < this.CONTEXT_SUMMARY_TTL) {
          systemPromptFinal = systemPrompt + `\n\n[早期对话摘要]\n${cachedSummary.summary}`
        } else {
          // 廉价截断摘要（不发额外请求）
          const lines = pruned.slice(-8).map(m => {
            const role = m.role === 'user' ? '用户' : 'AI'
            const text = typeof m.content === 'string' ? m.content.slice(0, 80) : '[图片/结构消息]'
            return `${role}: ${text}${typeof m.content === 'string' && m.content.length > 80 ? '…' : ''}`
          })
          systemPromptFinal = systemPrompt + `\n\n[早期对话片段]\n${lines.join('\n')}`
          // 异步生成 AI 摘要，下次使用
          this.buildContextSummaryAsync(userId, pruned)
        }
      }

      // 图片只保留最后一条含图用户消息
      let lastImgIdx = -1
      for (let i = trimmed.length - 1; i >= 0; i--) {
        if (trimmed[i].role === 'user') {
          const c = trimmed[i].content
          if (Array.isArray(c) && (c as Array<{ type: string }>).some(p => p.type === 'image')) {
            lastImgIdx = i; break
          }
        }
      }

      // ── MiniCPM-V 自动图片描述（主模型若不支持视觉则强制需要）──
      let visionSucceeded = false
      if (lastImgIdx >= 0) {
        const { loadVisionConfig, describeImage } = await import('../services/vision.service')
        const vcfg = loadVisionConfig()
        const imgMsg = trimmed[lastImgIdx]
        const parts = imgMsg.content as Array<{ type: string; data?: string; mediaType?: string; text?: string }>
        const imgs = parts.filter(p => p.type === 'image' && p.data)

        // 情况 A：视觉模型未启用 + 主模型也不支持视觉 → 直接告知用户
        if (!vcfg.enabled && !cfg.supportsImages && imgs.length > 0) {
          const hint = `当前主模型「${cfg.model}」不支持图片识别，且未启用视觉模型（MiniCPM-V）。请到「设置 → 视觉模型」启用，并确保 Ollama 已运行且已 \`ollama pull minicpm-v\`。`
          console.warn('[vision] no vision pipeline available:', cfg.model)
          trimmed[lastImgIdx] = {
            ...imgMsg,
            content: [...parts, { type: 'text', text: `[系统提示] ${hint}` }]
          }
          onThinking?.('vision_fail', '视觉链路未配置')
        }
        // 情况 B：视觉模型启用 → 尝试调用
        else if (vcfg.enabled && imgs.length > 0) {
          onThinking?.('vision', `正在用 ${vcfg.model} 识别图片…`)
          const results = await Promise.all(
            imgs.map(async p => {
              try {
                return { ok: true as const, text: await describeImage(p.data!, p.mediaType ?? 'image/jpeg') }
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                console.warn('[vision] describeImage failed:', msg)
                return { ok: false as const, err: msg }
              }
            })
          )
          const valid = results.filter(r => r.ok).map(r => (r as { ok: true; text: string }).text)
          const errs = results.filter(r => !r.ok).map(r => (r as { ok: false; err: string }).err)
          if (valid.length > 0) {
            visionSucceeded = true
            const block = valid.length === 1
              ? `[MiniCPM-V 图片识别结果]\n${valid[0]}`
              : valid.map((d, i) => `[图片${i + 1} MiniCPM-V 识别结果]\n${d}`).join('\n\n')
            const note = '\n\n（以上为视觉模型自动提取的内容。如需针对特定部分精确分析，可调用 describe_image 工具。）'
            trimmed[lastImgIdx] = { ...imgMsg, content: [...parts, { type: 'text', text: block + note }] }
            onThinking?.('vision_done', `${vcfg.model} 识别完成`)
          } else if (errs.length > 0) {
            const errSummary = errs[0]
            const isConnRefused = /ECONNREFUSED|fetch failed|getaddrinfo|ENOTFOUND/i.test(errSummary)
            const isModelNotFound = /not.*found|404/i.test(errSummary)
            const hint = isConnRefused
              ? `视觉模型服务不可达（${vcfg.baseUrl}）。请确认 Ollama 已启动：\`sudo systemctl start ollama\``
              : isModelNotFound
              ? `视觉模型「${vcfg.model}」未下载。请运行：\`ollama pull ${vcfg.model}\``
              : `视觉模型调用失败：${errSummary}`
            console.warn('[vision] all images failed:', hint)
            // 主模型不支持视觉 → 强提示用户解决；支持视觉 → 让主模型尽力一试
            const tone = cfg.supportsImages
              ? `[视觉模型预处理失败]\n${hint}\n（请尝试用主模型视觉能力分析图片，并告知用户视觉模型出现问题。）`
              : `[视觉链路失败]\n${hint}\n（主模型「${cfg.model}」也无视觉能力，请告知用户此情况，建议其修复视觉模型或更换主模型。）`
            trimmed[lastImgIdx] = { ...imgMsg, content: [...parts, { type: 'text', text: tone }] }
            onThinking?.('vision_fail', hint)
          }
        }
      }

      type ApiMsg = { role: string; content: unknown; tool_call_id?: string; name?: string }
      const buildApiMsgs = (src: typeof trimmed): ApiMsg[] => src.map((m, idx) => {
        if (typeof m.content === 'string') return { role: m.role, content: m.content }
        const parts = m.content as Array<{ type: string; text?: string; data?: string; mediaType?: string }>
        // 主模型不支持视觉时永远不发图（无论 lastImgIdx），避免 API 错误 / 浪费带宽
        const includeImages = cfg.supportsImages && idx === lastImgIdx
        if (cfg.isAnthropic) {
          const content = parts.map(p => {
            if (p.type === 'image') return includeImages
              ? { type: 'image', source: { type: 'base64', media_type: p.mediaType ?? 'image/jpeg', data: p.data! } }
              : { type: 'text', text: '[图片已由视觉模型识别为文字]' }
            return { type: 'text', text: p.text ?? '' }
          }).filter(p => !(p.type === 'text' && (p as { text?: string }).text === ''))
          return { role: m.role, content: content.length ? content : '[图片]' }
        } else {
          const content = parts.map(p => {
            if (p.type === 'image') return includeImages
              ? { type: 'image_url', image_url: { url: `data:${p.mediaType ?? 'image/jpeg'};base64,${p.data}` } }
              : { type: 'text', text: '[图片已由视觉模型识别为文字]' }
            return { type: 'text', text: p.text ?? '' }
          }).filter((p: { type: string; text?: string }) => !(p.type === 'text' && p.text === ''))
          if (content.length === 1 && (content[0] as { type: string }).type === 'text') return { role: m.role, content: (content[0] as { text: string }).text }
          return { role: m.role, content: content.length ? content : '[图片]' }
        }
      })

      let apiMessages: ApiMsg[] = buildApiMsgs(trimmed)

      const CACHEABLE_TOOLS = new Set(['get_student_summary', 'get_sobriety'])
      const WRITE_TOOLS = new Set(['update_knowledge', 'manage_todo', 'set_plan', 'record_learning',
        'log_explanation', 'drive_write', 'schedule_wakeup', 'update_student_radar', 'link_prerequisite',
        'notify_guardian', 'relay_image'])
      // 整个请求共享的 ctx（_callCounts 在多轮 tool 调用间累计）
      const sharedCtx = { userId, studentId, userRole: loginUser?.role ?? 'guardian', rawMessages: messages, _callCounts: {} as Record<string, number> }

      // ── 单次流式 ReAct 循环（最多 8 轮）─────────────────────────────────
      const MAX_ITER = 8
      let prevToolSig = ''
      for (let iter = 0; iter < MAX_ITER; iter++) {
        if (signal?.aborted) return

        const { toolCalls, preToolText } = await this.streamOnce(
          cfg, systemPromptFinal, apiMessages, tools, onToken,
          cfg.isReasoning ? (t) => onThinking?.('thinking', t) : undefined,
          signal
        )

        if (signal?.aborted) return

        if (toolCalls.length === 0) {
          onDone(); return
        }

        // 死循环检测：连续两轮工具调用完全相同则中止
        const sig = toolCalls.map(tc => `${tc.name}:${JSON.stringify(tc.args)}`).sort().join('|')
        if (sig === prevToolSig) {
          onError('检测到工具调用循环，已中止。请换一种方式提问。')
          return
        }
        prevToolSig = sig

        if (cfg.isAnthropic) {
          const content: unknown[] = []
          if (preToolText) content.push({ type: 'text', text: preToolText })
          content.push(...toolCalls.map(tc => ({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args })))
          apiMessages.push({ role: 'assistant', content })
        } else {
          apiMessages.push({
            role: 'assistant',
            content: preToolText || null,
            tool_calls: toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } }))
          } as ApiMsg)
        }

        // ── 并行执行所有工具（含缓存读 + 单次重试）──────────────────────
        const toolResults = await Promise.all(toolCalls.map(async tc => {
          const toolDef = getTool(tc.name)
          onThinking?.(tc.name, AgentEngine.TOOL_DISPLAY[tc.name] ?? `正在调用 ${tc.name}…`)
          if (!toolDef) return { tc, result: '工具未找到' }

          // 沙盒模式：拦截所有写操作，不留任何记录
          if (options?.sandbox && WRITE_TOOLS.has(tc.name)) {
            return { tc, result: '（沙盒模式：操作未执行）' }
          }

          // 读缓存（只缓存无副作用的读工具）
          const toolCacheKey = `${tc.name}_${studentId}`
          if (CACHEABLE_TOOLS.has(tc.name)) {
            const hit = this.toolResultCache.get(toolCacheKey)
            if (hit && Date.now() - hit.at < this.TOOL_RESULT_CACHE_TTL) {
              return { tc, result: hit.result }
            }
          }

          try {
            const result = await this.retryOnce(() =>
              toolDef.execute(tc.args, sharedCtx)
            )
            if (CACHEABLE_TOOLS.has(tc.name)) {
              this.toolResultCache.set(toolCacheKey, { result, at: Date.now() })
            }
            return { tc, result }
          } catch (e) {
            return { tc, result: `执行失败: ${e instanceof Error ? e.message : String(e)}` }
          }
        }))

        if (signal?.aborted) return

        // 工具完成提示
        const doneDisplay = toolResults.length === 1
          ? (AgentEngine.TOOL_DISPLAY[toolResults[0].tc.name] ?? toolResults[0].tc.name).replace('正在', '✓ ')
          : `✓ ${toolResults.length} 个工具已完成`
        onThinking?.('tool_done', doneDisplay)

        if (cfg.isAnthropic) {
          apiMessages.push({
            role: 'user',
            content: toolResults.map(({ tc, result }) => ({ type: 'tool_result', tool_use_id: tc.id, content: result }))
          })
        } else {
          for (const { tc, result } of toolResults) {
            apiMessages.push({ role: 'tool', content: result, tool_call_id: tc.id, name: tc.name })
          }
        }

        // 写操作后失效读缓存 + system prompt 缓存
        if (toolResults.some(({ tc }) => WRITE_TOOLS.has(tc.name))) {
          for (const k of [...this.toolResultCache.keys()]) {
            if (k.endsWith(`_${studentId}`)) this.toolResultCache.delete(k)
          }
        }
        this.systemPromptCache.delete(cacheKey)
      }

      onError('工具调用轮次超限（> 8）')
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    }
  }

  // ─────────────────────────────────────────────
  // Logging
  // ─────────────────────────────────────────────

  async logAction(
    studentId: string | null,
    actionType: string,
    actionDetail: string | null,
    triggerType: string,
    modelUsed: string | null,
    status: 'success' | 'failed' | 'pending' = 'success',
    errorMessage?: string
  ): Promise<void> {
    try {
      const db = getDB()
      const now = Date.now()
      const logId = uuidv4()

      db.prepare(`
        INSERT INTO AgentLog (id, student_id, action_type, action_detail, trigger_type, model_used, status, error_message, create_time, update_time, delete_flag)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(logId, studentId, actionType, actionDetail, triggerType, modelUsed, status, errorMessage || null, now, now)
    } catch (err) {
      console.error('logAction error:', err)
    }
  }

  getRecentLogs(
    studentId: string,
    limit: number = 20
  ): Array<{
    id: string
    action_type: string
    action_detail: string | null
    trigger_type: string
    model_used: string | null
    status: string
    create_time: number
  }> {
    try {
      const db = getDB()
      return db
        .prepare(
          `SELECT id, action_type, action_detail, trigger_type, model_used, status, create_time
           FROM AgentLog
           WHERE student_id = ? AND delete_flag = 0
           ORDER BY create_time DESC
           LIMIT ?`
        )
        .all(studentId, limit) as ReturnType<AgentEngine['getRecentLogs']>
    } catch (err) {
      console.error('getRecentLogs error:', err)
      return []
    }
  }

  // ─────────────────────────────────────────────
  // Do-not-disturb
  // ─────────────────────────────────────────────

  setDoNotDisturb(start: string, end: string): void {
    const timeRegex = /^\d{2}:\d{2}$/
    if (!timeRegex.test(start) || !timeRegex.test(end)) {
      throw new Error('时间格式应为 HH:MM')
    }
    this.doNotDisturb = { start, end }
    console.log(`Do-not-disturb set: ${start} - ${end}`)
  }

  clearDoNotDisturb(): void {
    this.doNotDisturb = null
    console.log('Do-not-disturb cleared')
  }

  private isDoNotDisturb(): boolean {
    if (!this.doNotDisturb) return false

    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()

    const [startH, startM] = this.doNotDisturb.start.split(':').map(Number)
    const [endH, endM] = this.doNotDisturb.end.split(':').map(Number)
    const startMinutes = startH * 60 + startM
    const endMinutes = endH * 60 + endM

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes
    } else {
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes
    }
  }

  getScheduler(): AgentScheduler {
    return this.scheduler
  }

  destroy(): void {
    this.scheduler.destroy()
    if (this.dailyCronJob) {
      this.dailyCronJob.stop()
      this.dailyCronJob = null
    }
    if (this.heartbeatCronJob) {
      this.heartbeatCronJob.stop()
      this.heartbeatCronJob = null
    }
    if (this.sobrietyCronJob) {
      this.sobrietyCronJob.stop()
      this.sobrietyCronJob = null
    }
    if (this.digestCronJob) {
      this.digestCronJob.stop()
      this.digestCronJob = null
    }
    if (this.backupCronJob) {
      this.backupCronJob.stop()
      this.backupCronJob = null
    }
    agentEngineInstance = null
    console.log('AgentEngine destroyed')
  }
}
