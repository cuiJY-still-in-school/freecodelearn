import { PlannedTask } from './planner'
import { AgentContextData } from './context'
import log from 'electron-log'

// ─────────────────────────────────────────────
// Shared Types
// ─────────────────────────────────────────────

export interface AIConfig {
  provider: string
  modelId: string
  apiKey: string
  baseUrl?: string
}

export interface ExecutorOutput {
  type: 'text' | 'mermaid' | 'knowledge_card'
  content: string
}

export interface BotMessageEffect {
  type: 'bot_message'
  userId: string
  content: string
}

export interface SetScheduleEffect {
  type: 'set_schedule'
  studentId: string
  cron: string
  description: string
}

export type SideEffect = BotMessageEffect | SetScheduleEffect

export interface ExecutorResult {
  success: boolean
  taskType: string
  output?: ExecutorOutput
  sideEffects?: SideEffect[]
  error?: string
}

export type CallAI = (
  prompt: string,
  model?: string,
  apiKey?: string,
  baseUrl?: string
) => Promise<string | null>

export type Executor = (
  task: PlannedTask,
  context: AgentContextData,
  aiConfig: AIConfig,
  callAI: CallAI
) => Promise<ExecutorResult>

// ─────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────

function parseOutput(response: string): ExecutorOutput {
  const mermaidMatch = response.match(/<MERMAID>([\s\S]*?)<\/MERMAID>/i)
  if (mermaidMatch) return { type: 'mermaid', content: mermaidMatch[1].trim() }

  const cardMatch = response.match(/<KNOWLEDGE_CARD>([\s\S]*?)<\/KNOWLEDGE_CARD>/i)
  if (cardMatch) return { type: 'knowledge_card', content: cardMatch[1].trim() }

  return { type: 'text', content: response }
}

function buildContextBlock(context: AgentContextData): string {
  const planSection = context.activePlan
    ? `学习方向：${context.activePlan.title}\n描述：${context.activePlan.description}\n科目：${context.activePlan.subjects.join('、')}`
    : '学习方向：未设置'

  const weakSection =
    context.weakPoints.length > 0
      ? context.weakPoints
          .slice(0, 5)
          .map(
            (p) =>
              `• [${p.subject}] ${p.topic}  薄弱度 ${(p.weakness_score * 100).toFixed(0)}%，已练习 ${p.attempt_count} 次` +
              (p.last_practiced
                ? `，上次：${new Date(p.last_practiced).toLocaleDateString('zh-CN')}`
                : '')
          )
          .join('\n')
      : '暂无薄弱点数据'

  const recentSection =
    context.recentRecords.length > 0
      ? context.recentRecords
          .slice(0, 10)
          .map(
            (r) => `• [${r.subject}] ${r.topic}  得分 ${r.score ?? '未记录'}  ${r.duration_minutes} 分钟`
          )
          .join('\n')
      : '近 7 天无学习记录'

  return `${planSection}\n\n薄弱知识点：\n${weakSection}\n\n近期学习记录：\n${recentSection}`
}

const RICH_OUTPUT_HINT = `
如适合，可在回答末尾附加以下任意一种富文本（二选一）：
- Mermaid 图表（知识结构/思维导图）：<MERMAID>graph TD\n  ...</MERMAID>
- 知识卡片：<KNOWLEDGE_CARD>{"title":"...","subject":"...","keyPoints":["..."],"difficulty":"easy|medium|hard"}</KNOWLEDGE_CARD>
否则直接输出纯文本/Markdown。`

// ─────────────────────────────────────────────
// Suggestion Executor
// ─────────────────────────────────────────────

export const suggestionExecutor: Executor = async (task, context, aiConfig, callAI) => {
  const prompt = `你是个性化学习辅助 AI PersonalAC。请为以下学生生成一条具体可行的学习建议。

## 学生数据
${buildContextBlock(context)}

## 背景
${task.reason}

## 要求
- 建议指向明确的知识点或练习方向
- 300 字以内
- 语气友好，适合中学生或大学生${RICH_OUTPUT_HINT}`

  const response = await callAI(prompt, aiConfig.modelId, aiConfig.apiKey, aiConfig.baseUrl)
  if (!response) return { success: false, taskType: task.type, error: 'AI 无响应' }

  const output = parseOutput(response)
  const botContent = `📚 学习建议：${output.content.slice(0, 300)}${output.content.length > 300 ? '…' : ''}`

  return {
    success: true,
    taskType: task.type,
    output,
    sideEffects: [{ type: 'bot_message', userId: context.studentId, content: botContent }]
  }
}

// ─────────────────────────────────────────────
// Daily Review Executor
// ─────────────────────────────────────────────

export const dailyReviewExecutor: Executor = async (task, context, aiConfig, callAI) => {
  const today = new Date().toLocaleDateString('zh-CN')

  const prompt = `你是个性化学习辅助 AI PersonalAC。请生成 ${today} 的学习回顾报告。

## 学生数据
${buildContextBlock(context)}

## 报告结构（按顺序输出）
1. **今日学习总结** — 学了什么、学了多久
2. **表现亮点** — 得分高或有进步的知识点
3. **需要改进** — 薄弱或错误较多的知识点
4. **明日建议** — 2-3 条具体可行的建议${RICH_OUTPUT_HINT}`

  const response = await callAI(prompt, aiConfig.modelId, aiConfig.apiKey, aiConfig.baseUrl)
  if (!response) return { success: false, taskType: task.type, error: 'AI 无响应' }

  const output = parseOutput(response)
  return { success: true, taskType: task.type, output }
}

// ─────────────────────────────────────────────
// Weakness Quiz Executor
// ─────────────────────────────────────────────

export const weaknessQuizExecutor: Executor = async (task, context, aiConfig, callAI) => {
  if (context.weakPoints.length === 0) {
    return { success: false, taskType: task.type, error: '没有薄弱点数据，无法生成测验' }
  }

  const targets = context.weakPoints.slice(0, 3)

  const prompt = `你是个性化学习辅助 AI PersonalAC。请针对以下薄弱知识点生成专项测验。

## 薄弱知识点
${targets
  .map(
    (p, i) =>
      `${i + 1}. [${p.subject}] ${p.topic}（薄弱度 ${(p.weakness_score * 100).toFixed(0)}%，练习 ${p.attempt_count} 次）`
  )
  .join('\n')}

## 要求
- 每个知识点出 1-2 道题（选择题或简答题）
- 每题附标准答案和解析
- 难度适中，侧重理解而非死记${RICH_OUTPUT_HINT}`

  const response = await callAI(prompt, aiConfig.modelId, aiConfig.apiKey, aiConfig.baseUrl)
  if (!response) return { success: false, taskType: task.type, error: 'AI 无响应' }

  const output = parseOutput(response)
  return { success: true, taskType: task.type, output }
}

// ─────────────────────────────────────────────
// Resource Brief Executor
// ─────────────────────────────────────────────

export const resourceBriefExecutor: Executor = async (task, _context, aiConfig, callAI) => {
  const { fileName, subject, fileType } = (task.params ?? {}) as Record<string, string>

  const prompt = `你是个性化学习辅助 AI PersonalAC。请为以下学习资源生成一份简报。

文件名：${fileName || '未知'}
科目：${subject || '通用'}
类型：${fileType || '未知'}

请生成：
1. 资源内容概述（150 字以内）
2. 主要知识点（3-5 条）
3. 学习建议${RICH_OUTPUT_HINT}`

  const response = await callAI(prompt, aiConfig.modelId, aiConfig.apiKey, aiConfig.baseUrl)
  if (!response) return { success: false, taskType: task.type, error: 'AI 无响应' }

  const output = parseOutput(response)
  return { success: true, taskType: task.type, output }
}

// ─────────────────────────────────────────────
// Schedule Executor (no AI call needed)
// ─────────────────────────────────────────────

export const scheduleExecutor: Executor = async (task, context, _aiConfig, _callAI) => {
  const cron = (task.params?.cron as string) || '0 20 * * *'
  const description = (task.params?.description as string) || '学习提醒'

  log.info(`Schedule executor: creating schedule "${description}" (${cron}) for student ${context.studentId}`)

  return {
    success: true,
    taskType: task.type,
    output: { type: 'text', content: `已安排定时任务：${description}（${cron}）` },
    sideEffects: [
      {
        type: 'set_schedule',
        studentId: context.studentId,
        cron,
        description
      }
    ]
  }
}

// ─────────────────────────────────────────────
// Executor registry
// ─────────────────────────────────────────────

const registry: Partial<Record<string, Executor>> = {
  push_suggestion: suggestionExecutor,
  daily_review: dailyReviewExecutor,
  weakness_quiz: weaknessQuizExecutor,
  resource_brief: resourceBriefExecutor,
  set_schedule: scheduleExecutor
}

export function getExecutor(type: string): Executor | null {
  return registry[type] ?? null
}
