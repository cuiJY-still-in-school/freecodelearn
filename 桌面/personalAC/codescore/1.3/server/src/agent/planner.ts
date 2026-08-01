import { AgentContextData } from './context'

export type PlannedTaskType =
  | 'push_suggestion'
  | 'daily_review'
  | 'weakness_quiz'
  | 'resource_brief'
  | 'set_schedule'
  | 'no_action'

export interface PlannedTask {
  type: PlannedTaskType
  priority: 'high' | 'medium' | 'low'
  reason: string
  params?: Record<string, unknown>
}

export interface TaskPlan {
  thinking: string
  tasks: PlannedTask[]
}

export function buildPlannerPrompt(context: AgentContextData): string {
  const now = new Date()
  const hour = now.getHours()
  const timeOfDay = hour < 12 ? '上午' : hour < 18 ? '下午' : '晚上'

  const planSection = context.activePlan
    ? `学习方向：${context.activePlan.title}（${context.activePlan.description}）\n科目：${context.activePlan.subjects.join('、')}`
    : '学习方向：未设置（通用模式）'

  const weakSection =
    context.weakPoints.length > 0
      ? context.weakPoints
          .slice(0, 5)
          .map(
            (p) =>
              `• [${p.subject}] ${p.topic}  薄弱度 ${(p.weakness_score * 100).toFixed(0)}%，已练习 ${p.attempt_count} 次`
          )
          .join('\n')
      : '（暂无薄弱点数据）'

  const recentSection =
    context.recentRecords.length > 0
      ? context.recentRecords
          .slice(0, 5)
          .map(
            (r) =>
              `• [${r.subject}] ${r.topic}  得分 ${r.score ?? '未记录'}  时长 ${r.duration_minutes} 分钟`
          )
          .join('\n')
      : '（近 7 天无学习记录）'

  const historySection =
    context.recentSuggestions.length > 0
      ? context.recentSuggestions.map((s) => `• [${s.action_type}]`).join('\n')
      : '（无历史操作）'

  return `你是一个学习辅助 Agent 的任务规划器。只负责"决定做什么"，不生成内容。只输出 JSON。

## 当前时间
${timeOfDay} ${now.toLocaleString('zh-CN')}

## 学生数据摘要
${planSection}

薄弱知识点（Top 5）：
${weakSection}

近期学习记录：
${recentSection}

近期 Agent 操作（避免重复）：
${historySection}

## 输出格式（严格 JSON，不含其他文字）
{
  "thinking": "分析摘要（1-3 句话）",
  "tasks": [
    {
      "type": "任务类型",
      "priority": "high | medium | low",
      "reason": "一句话原因",
      "params": {}
    }
  ]
}

## 可用任务类型
- push_suggestion：推送个性化学习建议（有明确薄弱点或近期无学习时）
- daily_review：生成今日学习回顾（建议晚上执行，近期未执行时）
- weakness_quiz：生成薄弱点专项测验（薄弱度高且练习次数少时）
- set_schedule：设置定时提醒（params 必须提供 cron 和 description）
- no_action：无需操作

规则：每个 type 最多出现一次；近期已执行的类型不再重复安排；若无需任何操作，tasks 返回空数组。`
}

export function parsePlan(response: string): TaskPlan | null {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0]) as TaskPlan
    if (!Array.isArray(parsed.tasks)) return null
    return parsed
  } catch (err) {
    console.warn('Failed to parse planner response:', err)
    return null
  }
}
