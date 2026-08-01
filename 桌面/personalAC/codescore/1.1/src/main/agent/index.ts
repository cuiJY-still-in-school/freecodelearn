import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'
import { AgentContext } from './context'
import { AgentScheduler } from './scheduler'
import { getAIConfig } from '../services/settings.service'
import { sendMessage as botSendMessage } from '../services/bot.service'
import log from 'electron-log'

export interface AgentEvent {
  type: 'new_learning_data' | 'new_resource' | 'plan_changed' | 'bot_message' | 'workspace_full'
  studentId?: string
  userId?: string
  username?: string
  role?: string
  [key: string]: unknown
}

export interface AgentAction {
  type: 'push_suggestion' | 'send_bot_message' | 'set_schedule' | 'update_weakness' | 'no_action'
  detail: string
  priority?: 'high' | 'medium' | 'low'
}

export interface AgentDecision {
  thinking: string
  actions: AgentAction[]
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
    log.info('AgentEngine initialized')
  }

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

        case 'new_resource': {
          const db = getDB()
          const students = db
            .prepare("SELECT id FROM User WHERE role = 'student' AND delete_flag = 0")
            .all() as Array<{ id: string }>
          for (const student of students) {
            await this.runAutonomousCycle(student.id)
          }
          break
        }

        case 'bot_message': {
          const userId = event.userId as string
          const role = event.role as string
          const content = event.content as string

          // Handle student and guardian roles
          if ((role === 'student' || role === 'guardian') && userId) {
            const response = await this.generateBotResponse(userId, content)
            if (response) {
              await botSendMessage(userId, response)
            }
          }
          break
        }

        case 'workspace_full': {
          // Trigger cleanup of temp files
          try {
            const { workspaceService } = require('../services/workspace.service')
            const result = await workspaceService.cleanupTemp()
            log.info(`Workspace cleanup triggered: deleted ${result.deleted} files, freed ${result.freedBytes} bytes`)
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

      const task = `分析学生的当前学习状况，生成个性化建议。
重点关注：
1. 最近的学习记录和薄弱知识点
2. 是否有待推荐的学习资源（包括邮件发来的资源）
3. 是否需要调整学习计划
4. 是否需要发送学习提醒`

      const prompt = this.context.buildPrompt(studentId, task)
      const configResult = getAIConfig()

      if (!configResult.success || !(configResult.data as { apiKey: string })?.apiKey) {
        log.warn('AI config not set, skipping autonomous cycle')
        await this.logAction(
          studentId,
          'no_action',
          'AI 未配置，跳过自主决策',
          'autonomous',
          null,
          'success'
        )
        return
      }

      const aiConfig = configResult.data as {
        provider: string
        modelId: string
        apiKey: string
        baseUrl?: string
      }

      const aiResponse = await this.callAI(prompt, aiConfig.modelId, aiConfig.apiKey, aiConfig.baseUrl)

      if (!aiResponse) {
        await this.logAction(
          studentId,
          'no_action',
          'AI 无响应',
          'autonomous',
          aiConfig.modelId,
          'failed'
        )
        return
      }

      const decision = this.parseDecision(aiResponse)
      if (!decision) {
        await this.logAction(
          studentId,
          'no_action',
          'AI 响应解析失败',
          'autonomous',
          aiConfig.modelId,
          'failed'
        )
        return
      }

      log.info(`Agent thinking: ${decision.thinking}`)

      for (const action of decision.actions) {
        await this.executeAction(action, studentId)
        await this.logAction(
          studentId,
          action.type,
          action.detail,
          'autonomous',
          aiConfig.modelId,
          'success'
        )
      }
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

  async callAI(
    prompt: string,
    model?: string,
    apiKey?: string,
    baseUrl?: string
  ): Promise<string | null> {
    try {
      const configResult = getAIConfig()
      const aiConfig = configResult.data as {
        provider: string
        modelId: string
        apiKey: string
        baseUrl?: string
      }

      const finalModel = model || aiConfig?.modelId || 'gpt-3.5-turbo'
      const finalApiKey = apiKey || aiConfig?.apiKey
      const finalBaseUrl = baseUrl || aiConfig?.baseUrl

      if (!finalApiKey) {
        log.warn('No API key configured')
        return null
      }

      let endpoint = finalBaseUrl || 'https://api.openai.com/v1'
      if (!endpoint.endsWith('/chat/completions')) {
        endpoint = endpoint.replace(/\/$/, '') + '/chat/completions'
      }

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

      const content = response.data?.choices?.[0]?.message?.content
      return content || null
    } catch (err) {
      log.error('callAI error:', err)
      return null
    }
  }

  private parseDecision(response: string): AgentDecision | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return {
          thinking: response,
          actions: [{ type: 'push_suggestion', detail: response, priority: 'medium' }]
        }
      }

      const parsed = JSON.parse(jsonMatch[0]) as AgentDecision
      if (!parsed.actions || !Array.isArray(parsed.actions)) {
        return {
          thinking: parsed.thinking || response,
          actions: []
        }
      }

      return parsed
    } catch (err) {
      log.warn('Failed to parse AI decision:', err)
      return {
        thinking: response,
        actions: [{ type: 'push_suggestion', detail: response, priority: 'medium' }]
      }
    }
  }

  async executeAction(action: AgentAction, studentId: string): Promise<void> {
    try {
      switch (action.type) {
        case 'push_suggestion': {
          log.info(`Pushing suggestion to student ${studentId}: ${action.detail}`)
          try {
            await botSendMessage(studentId, `学习建议：${action.detail}`)
          } catch {
            // Bot not configured, that's ok
          }
          break
        }

        case 'send_bot_message': {
          await botSendMessage(studentId, action.detail)
          break
        }

        case 'set_schedule': {
          const parts = action.detail.split('|')
          const cronExpression = parts[0]?.trim()
          const description = parts[1]?.trim() || '自动定时任务'

          if (cronExpression) {
            this.scheduler.createSchedule(studentId, cronExpression, description)
          }
          break
        }

        case 'update_weakness': {
          log.info(`Weakness update noted for student ${studentId}: ${action.detail}`)
          break
        }

        case 'no_action':
        default:
          log.info(`No action taken for student ${studentId}`)
          break
      }
    } catch (err) {
      log.error('executeAction error:', err)
    }
  }

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
      `).run(
        logId,
        studentId,
        actionType,
        actionDetail,
        triggerType,
        modelUsed,
        status,
        errorMessage || null,
        now,
        now
      )
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

  private async generateBotResponse(userId: string, userMessage: string): Promise<string | null> {
    const task = `用户发来消息：「${userMessage}」
请根据学生的学习情况，给出简洁友好的回复（不超过200字）。
如果是学习问题，提供解答；如果是闲聊，友好回应并引导到学习话题。`

    const prompt = this.context.buildPrompt(userId, task)
    const response = await this.callAI(prompt)

    if (!response) return null

    try {
      const parsed = JSON.parse(response)
      if (parsed.actions?.[0]?.detail) {
        return parsed.actions[0].detail
      }
    } catch {
      // Not JSON, return as-is
    }

    return response
  }

  getScheduler(): AgentScheduler {
    return this.scheduler
  }

  destroy(): void {
    this.scheduler.destroy()
    agentEngineInstance = null
    log.info('AgentEngine destroyed')
  }
}
