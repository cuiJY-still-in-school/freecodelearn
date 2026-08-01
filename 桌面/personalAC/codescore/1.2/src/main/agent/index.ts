import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'
import { AgentContext, AgentContextData } from './context'
import { AgentScheduler } from './scheduler'
import { getAIConfig } from '../services/settings.service'
import { sendMessage as botSendMessage } from '../services/bot.service'
import { buildPlannerPrompt, parsePlan, PlannedTask } from './planner'
import {
  getExecutor,
  SideEffect,
  AIConfig,
  dailyReviewExecutor,
  weaknessQuizExecutor,
  resourceBriefExecutor
} from './executors'
import log from 'electron-log'
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
  private scheduler: AgentScheduler
  private doNotDisturb: DoNotDisturbConfig | null = null
  private processingStudents: Set<string> = new Set()
  private dailyCronJob: cron.ScheduledTask | null = null

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
      log.info('Daily review cron triggered at 20:00')
      this.generateDailyReview('superadmin').catch((err) => {
        log.error('Daily review cron error:', err)
      })
    })

    log.info('AgentEngine initialized')
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
        log.warn('No API key configured')
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
      log.error('callAI error:', err)
      return null
    }
  }

  // ─────────────────────────────────────────────
  // Two-stage autonomous cycle: Planner → Executors
  // ─────────────────────────────────────────────

  async runAutonomousCycle(studentId: string): Promise<void> {
    if (this.processingStudents.has(studentId)) {
      log.info(`Autonomous cycle already running for student ${studentId}, skipping`)
      return
    }

    if (this.isDoNotDisturb()) {
      log.info(`Do-not-disturb active, skipping autonomous cycle for student ${studentId}`)
      return
    }

    this.processingStudents.add(studentId)

    try {
      log.info(`Starting autonomous cycle for student ${studentId}`)

      const configResult = getAIConfig()
      if (!configResult.success || !(configResult.data as { apiKey: string })?.apiKey) {
        log.warn('AI config not set, skipping autonomous cycle')
        await this.logAction(studentId, 'no_action', 'AI 未配置，跳过', 'autonomous', null, 'success')
        return
      }

      const aiConfig = configResult.data as AIConfig

      // Stage 1: Build context once, shared across all executors
      let contextData: AgentContextData
      try {
        contextData = this.context.buildContext(studentId)
      } catch (err) {
        log.error('Failed to build context:', err)
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
        log.info(`Planner: no tasks needed for student ${studentId}. Thinking: ${plan?.thinking ?? '—'}`)
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

      log.info(
        `Planner scheduled ${activeTasks.length} tasks for ${studentId}: ${activeTasks.map((t) => t.type).join(', ')}`
      )

      // Stage 3: Execute all tasks in parallel
      await Promise.all(
        activeTasks.map((task) => this.runExecutorTask(task, studentId, contextData, aiConfig))
      )
    } catch (err) {
      log.error(`Autonomous cycle error for student ${studentId}:`, err)
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
        log.warn(`No executor registered for task type: ${task.type}`)
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
      log.error(`Executor error for task type "${task.type}":`, err)
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
      log.error('applySideEffect error:', err)
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
      log.error('generateResourceBrief error:', err)
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
      log.error('generateDailyReview error:', err)
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
      log.error('generateWeaknessQuiz error:', err)
    }
  }

  // ─────────────────────────────────────────────
  // Event handler
  // ─────────────────────────────────────────────

  async handleEvent(event: AgentEvent): Promise<void> {
    try {
      log.info(`AgentEngine handling event: ${event.type}`)

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
            log.info(`Workspace cleanup: deleted ${result.deleted} files, freed ${result.freedBytes} bytes`)
          } catch (err) {
            log.error('Workspace cleanup failed:', err)
          }
          break
        }
      }
    } catch (err) {
      log.error('AgentEngine handleEvent error:', err)
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

    const prompt = `你是个性化学习辅助 AI PersonalAC。请根据学生学习情况，给出简洁友好的回复（200 字以内）。

## 学生状态
${planSection}
薄弱知识点：${contextData.weakPoints.slice(0, 3).map((p) => p.topic).join('、') || '暂无'}

## 用户消息
${userMessage}

如果是学习问题，提供解答；如果是闲聊，友好回应并引导到学习话题。直接输出回复内容。`

    return await this.callAI(prompt)
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
      log.error('logAction error:', err)
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
      log.error('getRecentLogs error:', err)
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
    log.info(`Do-not-disturb set: ${start} - ${end}`)
  }

  clearDoNotDisturb(): void {
    this.doNotDisturb = null
    log.info('Do-not-disturb cleared')
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
    agentEngineInstance = null
    log.info('AgentEngine destroyed')
  }
}
