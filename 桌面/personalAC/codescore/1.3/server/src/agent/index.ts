import axios from 'axios'
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

export function getAgentEngine(): AgentEngine | null {
  return agentEngineInstance
}

export class AgentEngine {
  private context: AgentContext
  scheduler: AgentScheduler
  private doNotDisturb: DoNotDisturbConfig | null = null
  private processingStudents: Set<string> = new Set()
  private dailyCronJob: cron.ScheduledTask | null = null
  private sobrietyCronJob: cron.ScheduledTask | null = null

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

    console.log('AgentEngine initialized')
  }

  // ─────────────────────────────────────────────
  // 自我清醒 — 周期刷新所有学生快照
  // ─────────────────────────────────────────────

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

        // 紧迫度升级到 urgent → 写一条 AgentLog（避免重复推送）
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
        }
      } catch (err) {
        console.error(`refreshSobrietySnapshot failed for ${s.id}:`, err)
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
        const response = await axios.post(
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
        const response = await axios.post(
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
      const activeTasks = (plan?.tasks ?? []).filter((t) => t.type !== 'no_action')

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
    apiKey: string; baseUrl: string; model: string; isAnthropic: boolean; isReasoning: boolean
  } | null {
    const aiConfig = (getAIConfig().data as AIConfig)
    const apiKey = aiConfig?.apiKey
    if (!apiKey) return null
    const baseUrl = (aiConfig?.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
    const rawModel = aiConfig?.modelId || 'gpt-4o'
    const model = rawModel.includes('/') ? rawModel.split('/').slice(1).join('/') : rawModel
    const isAnthropic = baseUrl.includes('/anthropic') || baseUrl.includes('anthropic.com')
    const isReasoning = /o1|o3|o4[-/]|thinking|reason/i.test(model)
    return { apiKey, baseUrl, model, isAnthropic, isReasoning }
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
      if (snap && snap.today_priority && snap.today_priority !== '暂无紧迫事项') {
        const urgencyTag = snap.urgency.level === 'urgent' ? '【紧迫】'
                         : snap.urgency.level === 'attention' ? '【关注】'
                         : ''
        sobrietySection = `\n清醒视角${urgencyTag}：${snap.today_priority}`
      }
    } catch (err) {
      // 快照不可用不影响对话
    }

    if (role === 'guardian') {
      const guardianName = loginUser?.display_name ?? '监护人'
      return `你是学习辅助 AI。当前与 ${guardianName} 对话，对方是 ${studentName}${grade} 的监护人。

学生科目：${subjects}${goalSection}${sobrietySection}

规则：
- 监护人提供的成绩和试卷数据可信，update_knowledge 用 source="guardian_upload"，无需验证
- 询问学生状态时先调用 get_student_summary
- 上传图片（试卷/成绩单）→ 逐题分析，调用 update_knowledge 更新知识点
- 提到学习活动 → 调用 record_learning
- 设置/修改计划 → 调用 set_plan
- 当"清醒视角"显示紧迫事项时，主动汇报给监护人

回复风格：简洁、数据导向。`
    }

    return `你是学习辅助 AI。当前与学生 ${studentName}${grade} 对话。

科目：${subjects}${goalSection}${sobrietySection}

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
- 发现持续性错误 → 填写 error_type 和 root_cause

讲解追踪：
- 解释后学生懂了 → log_explanation（understood=true，记录方法）
- 没懂 → 先追问"哪一步不清楚"，找到根因后 log_explanation（understood=false，填 root_cause），换一种方法重讲
- 不要用同一种方式解释两遍：公式推导 → 数值例子 → 类比 → 图示 → 反例

前置依赖诊断（重要）：
- 换了两种方法学生还是不懂 → 怀疑是前置知识有缺口，调用 check_prerequisites 诊断
- 发现前置缺口（如学生学不懂"导数"是因为"极限"不稳） → 调用 link_prerequisite 记录这个依赖关系，然后明确告诉学生："我们先把 X 补一下，X 搞定了 Y 就好理解了"，切换讲解目标到前置知识点
- 前置补完、学生掌握后 → 回到原来的知识点，告知"现在来看之前那道题"

回复风格：步骤清晰，鼓励为主。`
  }

  // 非流式单次 AI 调用（ReAct 工具调用轮次）
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
      const res = await axios.post(
        cfg.baseUrl + '/messages', body,
        { headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 120000 }
      )
      const content = res.data?.content as Array<{ type: string; id?: string; name?: string; input?: unknown; text?: string }> ?? []
      const text = content.find(c => c.type === 'text')?.text ?? null
      const toolCalls = content
        .filter(c => c.type === 'tool_use')
        .map(c => ({ id: c.id!, name: c.name!, args: (c.input ?? {}) as Record<string, unknown> }))
      return { text, toolCalls }
    } else {
      const sysMessages = cfg.isReasoning
        ? [{ role: 'user', content: `[System instructions]\n${systemPrompt}` }]
        : [{ role: 'system', content: systemPrompt }]
      const body: Record<string, unknown> = {
        model: cfg.model,
        messages: [...sysMessages, ...messages],
        tools, tool_choice: 'auto'
      }
      if (!cfg.isReasoning) body.temperature = 0.7
      else body.reasoning_effort = 'medium'
      const res = await axios.post(
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

  // 流式输出（最终回复，支持 thinking token）
  private async streamText(
    cfg: { apiKey: string; baseUrl: string; model: string; isAnthropic: boolean; isReasoning: boolean },
    systemPrompt: string,
    messages: unknown[],
    onToken: (t: string) => void,
    onDone: () => void,
    onError: (e: string) => void,
    onThinking?: (text: string) => void
  ): Promise<void> {
    let done = false
    const safeDone = (): void => { if (!done) { done = true; onDone() } }
    try {
      if (cfg.isAnthropic) {
        const body: Record<string, unknown> = {
          model: cfg.model, max_tokens: 16000, system: systemPrompt, messages, stream: true
        }
        if (cfg.isReasoning) body.thinking = { type: 'enabled', budget_tokens: 8000 }
        const res = await axios.post(
          cfg.baseUrl + '/messages', body,
          { headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, responseType: 'stream', timeout: 180000 }
        )
        let buf = ''
        res.data.on('data', (chunk: Buffer) => {
          buf += chunk.toString()
          const lines = buf.split('\n'); buf = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const p = JSON.parse(line.slice(6).trim())
              if (p.type === 'content_block_delta') {
                if (p.delta?.type === 'text_delta') onToken(p.delta.text)
                else if (p.delta?.type === 'thinking_delta') onThinking?.(p.delta.thinking)
              } else if (p.type === 'message_stop') safeDone()
            } catch {}
          }
        })
        res.data.on('end', safeDone)
        res.data.on('error', (e: Error) => { if (!done) { done = true; onError(e.message) } })
      } else {
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
        const res = await axios.post(
          cfg.baseUrl + '/chat/completions', body,
          { headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' }, responseType: 'stream', timeout: 180000 }
        )
        let buf = ''
        res.data.on('data', (chunk: Buffer) => {
          buf += chunk.toString()
          const lines = buf.split('\n'); buf = lines.pop() || ''
          for (const line of lines) {
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
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    }
  }

  async streamChatResponse(
    userId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: unknown }>,
    onToken: (token: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
    onThinking?: (toolName: string, display: string) => void
  ): Promise<void> {
    try {
      const cfg = this.buildChatConfig()
      if (!cfg) { onError('未配置 AI，请前往设置页面填写 API Key'); return }

      // 确定操作数据用的学生 ID
      const db = require('../database').getDB()
      const loginUser = db.prepare('SELECT role FROM User WHERE id=? AND delete_flag=0').get(userId) as { role: string } | undefined
      let studentId = userId
      if (loginUser?.role === 'guardian') {
        const { getPrimaryStudentId } = require('../services/auth.service')
        studentId = getPrimaryStudentId(userId) ?? userId
      }

      // 学生开口前先刷新清醒快照（让 buildSystemPrompt 拿到最新状态）
      try {
        const { refreshSobrietySnapshot } = await import('../services/sobriety.service')
        refreshSobrietySnapshot(studentId)
      } catch { /* 失败不影响对话 */ }

      const systemPrompt = this.buildSystemPrompt(userId, studentId)
      const { toOpenAITools, toAnthropicTools, getTool } = await import('../tools/index')
      const tools = cfg.isAnthropic ? toAnthropicTools() : toOpenAITools()

      // 将前端消息转换为 API 格式（支持多模态）
      type ApiMsg = { role: string; content: unknown; tool_call_id?: string; name?: string }
      let apiMessages: ApiMsg[] = messages.map(m => {
        if (typeof m.content === 'string') return { role: m.role, content: m.content }
        // 多模态：前端传 { type:'text'|'image', text?, data?, mediaType? }[]
        const parts = m.content as Array<{ type: string; text?: string; data?: string; mediaType?: string }>
        if (cfg.isAnthropic) {
          return {
            role: m.role,
            content: parts.map(p => p.type === 'image'
              ? { type: 'image', source: { type: 'base64', media_type: p.mediaType ?? 'image/jpeg', data: p.data! } }
              : { type: 'text', text: p.text ?? '' })
          }
        } else {
          return {
            role: m.role,
            content: parts.map(p => p.type === 'image'
              ? { type: 'image_url', image_url: { url: `data:${p.mediaType ?? 'image/jpeg'};base64,${p.data}` } }
              : { type: 'text', text: p.text ?? '' })
          }
        }
      })

      // ── ReAct 循环（最多5轮）────────────────────
      const MAX_ITER = 5
      for (let i = 0; i < MAX_ITER; i++) {
        const { text, toolCalls } = await this.callOnce(cfg, systemPrompt, apiMessages, tools)

        if (toolCalls.length === 0) {
          // 最终文字响应：用真正流式输出
          await this.streamText(cfg, systemPrompt, apiMessages, onToken, onDone, onError,
            cfg.isReasoning ? (t) => onThinking?.('thinking', t) : undefined)
          return
        }

        // 有工具调用：执行后追加结果，继续循环
        const assistantContent = cfg.isAnthropic
          ? [
              ...(text ? [{ type: 'text', text }] : []),
              ...toolCalls.map(tc => ({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args }))
            ]
          : text ?? null

        if (cfg.isAnthropic) {
          apiMessages.push({ role: 'assistant', content: assistantContent })
        } else {
          apiMessages.push({
            role: 'assistant',
            content: assistantContent,
            ...(toolCalls.length ? {
              tool_calls: toolCalls.map(tc => ({
                id: tc.id, type: 'function',
                function: { name: tc.name, arguments: JSON.stringify(tc.args) }
              }))
            } : {})
          } as ApiMsg)
        }

        for (const tc of toolCalls) {
          const toolDef = getTool(tc.name)
          const displayNames: Record<string, string> = {
            get_student_summary: '正在查询学习状态…',
            update_knowledge:    '正在更新知识记录…',
            set_plan:            '正在更新学习计划…',
            record_learning:     '正在记录学习活动…'
          }
          onThinking?.(tc.name, displayNames[tc.name] ?? `正在调用 ${tc.name}…`)

          let result = '工具未找到'
          if (toolDef) {
            try { result = await toolDef.execute(tc.args, { userId, studentId }) }
            catch (e) { result = `执行失败: ${e instanceof Error ? e.message : String(e)}` }
          }

          if (cfg.isAnthropic) {
            apiMessages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: tc.id, content: result }] })
          } else {
            apiMessages.push({ role: 'tool', content: result, tool_call_id: tc.id, name: tc.name })
          }
        }
      }

      onError('工具调用轮次超限')
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
    if (this.sobrietyCronJob) {
      this.sobrietyCronJob.stop()
      this.sobrietyCronJob = null
    }
    agentEngineInstance = null
    console.log('AgentEngine destroyed')
  }
}
