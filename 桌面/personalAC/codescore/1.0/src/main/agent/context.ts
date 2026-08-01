import { getDB } from '../database'
import log from 'electron-log'

export interface AgentContextData {
  studentId: string
  studentName: string
  activePlan: {
    title: string
    description: string
    subjects: string[]
  } | null
  weakPoints: Array<{
    subject: string
    topic: string
    weakness_score: number
    attempt_count: number
    last_practiced: number | null
  }>
  recentRecords: Array<{
    subject: string
    topic: string
    score: number | null
    duration_minutes: number
    record_date: number
  }>
  resources: Array<{
    file_name: string
    subject: string | null
    file_type: string
  }>
  recentSuggestions: Array<{
    action_type: string
    action_detail: string | null
    create_time: number
  }>
}

export class AgentContext {
  buildContext(studentId: string): AgentContextData {
    const db = getDB()

    // Get student info
    const student = db
      .prepare('SELECT id, username FROM User WHERE id = ? AND delete_flag = 0')
      .get(studentId) as { id: string; username: string } | undefined

    if (!student) {
      throw new Error(`Student not found: ${studentId}`)
    }

    // Get active plan
    const planRow = db
      .prepare(
        "SELECT title, description, subjects FROM Plan WHERE student_id = ? AND status = 'active' AND delete_flag = 0 ORDER BY create_time DESC LIMIT 1"
      )
      .get(studentId) as { title: string; description: string; subjects: string } | undefined

    const activePlan = planRow
      ? {
          title: planRow.title,
          description: planRow.description,
          subjects: JSON.parse(planRow.subjects) as string[]
        }
      : null

    // Get weak points (top 10)
    const weakPoints = db
      .prepare(
        `SELECT subject, topic, weakness_score, attempt_count, last_practiced
         FROM KnowledgePoint
         WHERE student_id = ? AND delete_flag = 0
         ORDER BY weakness_score DESC
         LIMIT 10`
      )
      .all(studentId) as AgentContextData['weakPoints']

    // Get recent records (last 7 days)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const recentRecords = db
      .prepare(
        `SELECT subject, topic, score, duration_minutes, record_date
         FROM LearningRecord
         WHERE student_id = ? AND record_date >= ? AND delete_flag = 0
         ORDER BY record_date DESC
         LIMIT 20`
      )
      .all(studentId, sevenDaysAgo) as AgentContextData['recentRecords']

    // Get available resources
    const resources = db
      .prepare(
        `SELECT file_name, subject, file_type
         FROM Resource
         WHERE delete_flag = 0
         ORDER BY create_time DESC
         LIMIT 20`
      )
      .all() as AgentContextData['resources']

    // Get recent agent suggestions (last 5)
    const recentSuggestions = db
      .prepare(
        `SELECT action_type, action_detail, create_time
         FROM AgentLog
         WHERE student_id = ? AND status = 'success' AND delete_flag = 0
         ORDER BY create_time DESC
         LIMIT 5`
      )
      .all(studentId) as AgentContextData['recentSuggestions']

    return {
      studentId,
      studentName: student.username,
      activePlan,
      weakPoints,
      recentRecords,
      resources,
      recentSuggestions
    }
  }

  buildPrompt(studentId: string, task: string): string {
    let context: AgentContextData
    try {
      context = this.buildContext(studentId)
    } catch (err) {
      log.error('Failed to build context:', err)
      return `你是一个个性化学习辅助 AI Agent。\n\n当前任务：${task}\n\n请根据情况提供建议。`
    }

    const systemRole = `你是一个专业的个性化学习辅助 AI Agent，名为 PersonalAC。
你的职责是：分析学生的学习数据，识别薄弱知识点，生成个性化学习建议，并主动推送提醒。
你的回答应该简洁、专业、友好，适合中学生或大学生理解。`

    const planSection = context.activePlan
      ? `## 当前学习方向
标题：${context.activePlan.title}
描述：${context.activePlan.description}
科目：${context.activePlan.subjects.join('、')}`
      : '## 当前学习方向\n（尚未设置学习方向）'

    const weakSection =
      context.weakPoints.length > 0
        ? `## 薄弱知识点（按薄弱程度排序）
${context.weakPoints
  .map(
    (p, i) =>
      `${i + 1}. [${p.subject}] ${p.topic} - 薄弱度: ${(p.weakness_score * 100).toFixed(0)}%，练习次数: ${p.attempt_count}`
  )
  .join('\n')}`
        : '## 薄弱知识点\n（暂无数据）'

    const recentSection =
      context.recentRecords.length > 0
        ? `## 最近7天学习记录
${context.recentRecords
  .slice(0, 10)
  .map(
    (r) =>
      `- [${r.subject}] ${r.topic}，得分: ${r.score ?? '未记录'}，时长: ${r.duration_minutes} 分钟`
  )
  .join('\n')}`
        : '## 最近学习记录\n（暂无数据）'

    const resourceSection =
      context.resources.length > 0
        ? `## 可用学习资源
${context.resources.map((r) => `- ${r.file_name} [${r.subject || '通用'}] (.${r.file_type})`).join('\n')}`
        : '## 可用学习资源\n（暂无资源）'

    const suggestionSection =
      context.recentSuggestions.length > 0
        ? `## 最近 Agent 建议（避免重复）
${context.recentSuggestions.map((s) => `- [${s.action_type}] ${s.action_detail || ''}`).join('\n')}`
        : ''

    return `${systemRole}

---

# 学生信息
学生名称：${context.studentName}
学生ID：${context.studentId}

${planSection}

${weakSection}

${recentSection}

${resourceSection}

${suggestionSection}

---

# 当前任务
${task}

请以 JSON 格式返回你的决策，格式如下：
{
  "thinking": "你的分析过程",
  "actions": [
    {
      "type": "push_suggestion | send_bot_message | set_schedule | update_weakness | no_action",
      "detail": "动作详情",
      "priority": "high | medium | low"
    }
  ]
}`
  }
}
