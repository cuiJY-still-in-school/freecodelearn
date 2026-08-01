import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'
import { registerTool, ToolContext } from './index'

// ── get_student_summary ───────────────────────────────────────────────
registerTool({
  name: 'get_student_summary',
  description: '获取学生当前学习状态，包括学习计划、薄弱知识点（按置信度和遗忘估计排序）、本周活动量。在回答涉及学习进度、状态、建议时必须先调用此工具。',
  input_schema: { type: 'object', properties: {} },
  async execute(_params, ctx: ToolContext): Promise<string> {
    const db = getDB()

    const plan = db.prepare(`
      SELECT title, subjects FROM Plan
      WHERE student_id = ? AND status = 'active' AND delete_flag = 0
      ORDER BY create_time DESC LIMIT 1
    `).get(ctx.studentId) as { title: string; subjects: string } | undefined

    const kps = db.prepare(`
      SELECT topic, subject,
             COALESCE(confidence, 1 - weakness_score) AS confidence,
             COALESCE(data_source, 'agent_observed') AS data_source,
             last_practiced,
             COALESCE(stability, 1.0) AS stability,
             root_cause,
             explanation_log,
             prerequisites
      FROM KnowledgePoint
      WHERE student_id = ? AND delete_flag = 0
      ORDER BY confidence ASC
      LIMIT 10
    `).all(ctx.studentId) as Array<{
      topic: string; subject: string; confidence: number
      data_source: string; last_practiced: number | null; stability: number
      root_cause: string | null; explanation_log: string | null; prerequisites: string | null
    }>

    const now = Date.now()
    const weekAgo = now - 7 * 86400 * 1000
    const activity = db.prepare(`
      SELECT COUNT(*) AS cnt FROM LearningRecord
      WHERE student_id = ? AND record_date > ?
    `).get(ctx.studentId, weekAgo) as { cnt: number }

    const weakPoints = kps.map(kp => {
      const daysSince = kp.last_practiced
        ? (now - kp.last_practiced) / 86400000
        : 999
      const retention = Math.round(Math.exp(-daysSince / Math.max(kp.stability * 5, 1)) * 100)

      // 解析讲解记录，提取有效方法和无效方法
      let workedMethods: string[] = []
      let failedMethods: string[] = []
      if (kp.explanation_log) {
        try {
          const logs = JSON.parse(kp.explanation_log) as Array<{ method: string; understood: boolean }>
          workedMethods = logs.filter(l => l.understood).map(l => l.method)
          failedMethods = logs.filter(l => !l.understood).map(l => l.method)
        } catch { /* ignore */ }
      }

      // 检查前置知识点的掌握情况
      let prerequisiteGaps: Array<{ topic: string; subject: string; confidence: number }> = []
      if (kp.prerequisites) {
        try {
          const prereqs = JSON.parse(kp.prerequisites) as Array<{ topic: string; subject: string }>
          for (const p of prereqs) {
            const pr = db.prepare(`
              SELECT COALESCE(confidence, 1 - weakness_score) AS confidence
              FROM KnowledgePoint WHERE student_id=? AND topic=? AND subject=? AND delete_flag=0
            `).get(ctx.studentId, p.topic, p.subject) as { confidence: number } | undefined
            if (pr && pr.confidence < 0.7) {
              prerequisiteGaps.push({ topic: p.topic, subject: p.subject, confidence: Math.round(pr.confidence * 100) })
            }
          }
        } catch { /* ignore */ }
      }

      return {
        topic: kp.topic,
        subject: kp.subject,
        confidence: Math.round(kp.confidence * 100),
        estimatedRetention: retention,
        daysSinceReview: Math.round(daysSince),
        ...(kp.root_cause ? { rootCause: kp.root_cause } : {}),
        ...(workedMethods.length ? { workedMethods } : {}),
        ...(failedMethods.length ? { failedMethods } : {}),
        ...(prerequisiteGaps.length ? { prerequisiteGaps } : {})
      }
    })

    return JSON.stringify({
      activePlan: plan
        ? { title: plan.title, subjects: JSON.parse(plan.subjects || '[]') }
        : null,
      weakPoints,
      sessionsThisWeek: activity.cnt
    }, null, 2)
  }
})

// ── update_knowledge ──────────────────────────────────────────────────
registerTool({
  name: 'update_knowledge',
  description: `更新学生某个知识点的掌握状态。
规则：
- 监护人上传成绩/试卷 → source="guardian_upload"，置信度根据得分率
- Agent出题学生答对 → source="agent_observed"，confidence上调
- 学生说"我会了"但未验证 → 不调用，先出题
- 发现持续错误 → 填写 error_type 和 root_cause`,
  input_schema: {
    type: 'object',
    properties: {
      topic:      { type: 'string', description: '知识点名称，尽量精确' },
      subject:    { type: 'string', description: '科目' },
      confidence: { type: 'number', description: '掌握置信度 0.0-1.0' },
      source:     { type: 'string', enum: ['guardian_upload', 'agent_observed', 'student_report'] },
      evidence:   { type: 'string', description: '判断依据' },
      error_type: { type: 'string', description: '错误类型，如"计算错误""概念混淆""步骤遗漏"' },
      root_cause: { type: 'string', description: '根因分析：学生卡在哪里，如"不理解为什么要换元，只是机械套公式"' }
    },
    required: ['topic', 'subject', 'confidence', 'source']
  },
  async execute(params, ctx: ToolContext): Promise<string> {
    const { topic, subject, confidence, source, evidence, error_type, root_cause } = params as {
      topic: string; subject: string; confidence: number; source: string
      evidence?: string; error_type?: string; root_cause?: string
    }

    const db = getDB()
    const now = Date.now()
    const existing = db.prepare(`
      SELECT id, stability, error_types FROM KnowledgePoint
      WHERE student_id = ? AND topic = ? AND subject = ? AND delete_flag = 0
    `).get(ctx.studentId, topic, subject) as {
      id: string; stability: number; error_types: string | null
    } | undefined

    const prevStability = existing?.stability ?? 1.0
    const newStability = confidence > 0.65
      ? Math.min(prevStability * 1.8 + 1, 60)
      : Math.max(prevStability * 0.5, 0.5)

    let errorTypes: Record<string, number> = {}
    if (existing?.error_types) {
      try { errorTypes = JSON.parse(existing.error_types) } catch { /* ignore */ }
    }
    if (error_type) errorTypes[error_type] = (errorTypes[error_type] ?? 0) + 1

    if (existing) {
      db.prepare(`
        UPDATE KnowledgePoint SET
          weakness_score = ?, confidence = ?, data_source = ?,
          stability = ?, error_types = ?,
          root_cause = COALESCE(?, root_cause),
          last_practiced = ?, attempt_count = attempt_count + 1, update_time = ?
        WHERE id = ?
      `).run(
        1 - confidence, confidence, source, newStability,
        JSON.stringify(errorTypes), root_cause ?? null,
        now, now, existing.id
      )
    } else {
      db.prepare(`
        INSERT INTO KnowledgePoint
          (id, student_id, subject, topic, weakness_score, confidence, data_source,
           stability, error_types, root_cause, attempt_count, last_practiced, create_time, update_time, delete_flag)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1.0, ?, ?, 1, ?, ?, ?, 0)
      `).run(
        uuidv4(), ctx.studentId, subject, topic,
        1 - confidence, confidence, source,
        JSON.stringify(errorTypes), root_cause ?? null, now, now, now
      )
    }

    const pct = Math.round(confidence * 100)
    const srcLabel: Record<string, string> = {
      guardian_upload: '监护人上传', agent_observed: 'Agent验证', student_report: '学生自报'
    }
    return `已记录：${subject}·${topic} → ${pct}%，来源：${srcLabel[source] ?? source}${error_type ? `，错误：${error_type}` : ''}${root_cause ? `，根因：${root_cause}` : ''}`
  }
})

// ── set_plan ──────────────────────────────────────────────────────────
registerTool({
  name: 'set_plan',
  description: '设置或更新学生的学习计划。监护人在首次配置或更改学习方向时调用。',
  input_schema: {
    type: 'object',
    properties: {
      title:       { type: 'string', description: '计划名称，如"高考数学冲刺"' },
      description: { type: 'string', description: '详细说明（可选）' },
      subjects:    { type: 'array', items: { type: 'string' }, description: '科目列表' }
    },
    required: ['title', 'subjects']
  },
  async execute(params, ctx: ToolContext): Promise<string> {
    const { title, description, subjects } = params as {
      title: string; description?: string; subjects: string[]
    }
    const db = getDB()
    const now = Date.now()
    db.prepare(`UPDATE Plan SET status='archived', update_time=? WHERE student_id=? AND status='active'`).run(now, ctx.studentId)
    db.prepare(`
      INSERT INTO Plan (id, student_id, title, description, subjects, status, create_time, update_time, delete_flag)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, 0)
    `).run(uuidv4(), ctx.studentId, title, description ?? '', JSON.stringify(subjects), now, now)
    return `学习计划已设置：《${title}》，科目：${subjects.join('、')}`
  }
})

// ── record_learning ───────────────────────────────────────────────────
registerTool({
  name: 'record_learning',
  description: '记录一次学习活动（学了什么、多久、有什么感受）。从对话中提取到学习信息时调用。',
  input_schema: {
    type: 'object',
    properties: {
      subject:          { type: 'string' },
      topic:            { type: 'string' },
      duration_minutes: { type: 'number', description: '学习时长（分钟），不确定时填0' },
      score:            { type: 'number', description: '如果有评分（0-100），否则省略' },
      note:             { type: 'string', description: '备注，如"学生提到这部分很难"' }
    },
    required: ['subject', 'topic']
  },
  async execute(params, ctx: ToolContext): Promise<string> {
    const { subject, topic, duration_minutes, score, note } = params as {
      subject: string; topic: string; duration_minutes?: number; score?: number; note?: string
    }
    const db = getDB()
    const now = Date.now()
    db.prepare(`
      INSERT INTO LearningRecord
        (id, student_id, subject, topic, score, duration_minutes, note, record_date, create_time, update_time, delete_flag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(uuidv4(), ctx.studentId, subject, topic, score ?? null, duration_minutes ?? 0, note ?? null, now, now, now)
    return `已记录学习活动：${subject}·${topic}${duration_minutes ? `，时长 ${duration_minutes} 分钟` : ''}${score != null ? `，得分 ${score}` : ''}`
  }
})

// ── log_explanation ───────────────────────────────────────────────────
registerTool({
  name: 'log_explanation',
  description: `记录一次讲解尝试：用了什么方法、学生是否理解。
调用时机：
- 你解释了一个知识点，学生明确表示听懂了 → understood=true
- 学生表示没懂、继续追问或答题仍出错 → understood=false，填写 root_cause
- 一个知识点可以有多次记录（换了方法重新讲）
不要每次对话都调用，只在有明确的"讲解-反馈"闭环时记录。`,
  input_schema: {
    type: 'object',
    properties: {
      topic:      { type: 'string', description: '知识点名称' },
      subject:    { type: 'string', description: '科目' },
      method:     { type: 'string', description: '本次解释用的方法，如"公式推导""具体数值例子""类比生活场景""图示""反例"' },
      understood: { type: 'boolean', description: '学生是否理解了' },
      root_cause: { type: 'string', description: '若未理解，学生卡住的具体原因' },
      note:       { type: 'string', description: '其他观察（可选）' }
    },
    required: ['topic', 'subject', 'method', 'understood']
  },
  async execute(params, ctx: ToolContext): Promise<string> {
    const { topic, subject, method, understood, root_cause, note } = params as {
      topic: string; subject: string; method: string; understood: boolean
      root_cause?: string; note?: string
    }

    const db = getDB()
    const now = Date.now()

    const existing = db.prepare(`
      SELECT id, explanation_log, root_cause FROM KnowledgePoint
      WHERE student_id = ? AND topic = ? AND subject = ? AND delete_flag = 0
    `).get(ctx.studentId, topic, subject) as {
      id: string; explanation_log: string | null; root_cause: string | null
    } | undefined

    const entry = { method, understood, date: now, ...(root_cause ? { root_cause } : {}), ...(note ? { note } : {}) }

    if (existing) {
      let log: unknown[] = []
      try { log = JSON.parse(existing.explanation_log ?? '[]') } catch { /* ignore */ }
      log.push(entry)
      if (log.length > 20) log = log.slice(-20) // 保留最近20条

      db.prepare(`
        UPDATE KnowledgePoint SET
          explanation_log = ?,
          root_cause = COALESCE(?, root_cause),
          update_time = ?
        WHERE id = ?
      `).run(JSON.stringify(log), root_cause ?? null, now, existing.id)
    } else {
      db.prepare(`
        INSERT INTO KnowledgePoint
          (id, student_id, subject, topic, weakness_score, confidence, data_source,
           stability, attempt_count, explanation_log, root_cause, create_time, update_time, delete_flag)
        VALUES (?, ?, ?, ?, 0.5, 0.5, 'agent_observed', 1.0, 0, ?, ?, ?, ?, 0)
      `).run(uuidv4(), ctx.studentId, subject, topic, JSON.stringify([entry]), root_cause ?? null, now, now)
    }

    const outcome = understood ? '理解' : `未理解${root_cause ? `（${root_cause}）` : ''}`
    return `已记录：${subject}·${topic}，方法"${method}"→ ${outcome}`
  }
})

// ── link_prerequisite ─────────────────────────────────────────────────
registerTool({
  name: 'link_prerequisite',
  description: `记录一个前置依赖关系：topic 依赖 requires_topic。
调用时机：
- 学生在 B 上出错，你判断根因是 A 没学好 → 记录 B depends on A
- 同一次卡住可以记录多个前置（如"导数"同时依赖"极限"和"函数"）
- 不要猜测，只在对话中有明确证据时记录
记录后立即调用 check_prerequisites 确认前置掌握情况，再决定是否切换讲解目标。`,
  input_schema: {
    type: 'object',
    properties: {
      topic:             { type: 'string', description: '当前卡住的知识点' },
      subject:           { type: 'string', description: '科目' },
      requires_topic:    { type: 'string', description: '前置知识点' },
      requires_subject:  { type: 'string', description: '前置知识点所属科目（通常与 subject 相同）' },
      reason:            { type: 'string', description: '为什么判断这是前置依赖' }
    },
    required: ['topic', 'subject', 'requires_topic', 'requires_subject']
  },
  async execute(params, ctx: ToolContext): Promise<string> {
    const { topic, subject, requires_topic, requires_subject, reason } = params as {
      topic: string; subject: string; requires_topic: string; requires_subject: string; reason?: string
    }
    const db = getDB()
    const now = Date.now()

    // 确保 topic 的 KnowledgePoint 存在
    let kp = db.prepare(
      `SELECT id, prerequisites FROM KnowledgePoint WHERE student_id=? AND topic=? AND subject=? AND delete_flag=0`
    ).get(ctx.studentId, topic, subject) as { id: string; prerequisites: string | null } | undefined

    if (!kp) {
      const id = uuidv4()
      db.prepare(`
        INSERT INTO KnowledgePoint (id, student_id, subject, topic, weakness_score, confidence, data_source, stability, attempt_count, create_time, update_time, delete_flag)
        VALUES (?, ?, ?, ?, 0.5, 0.5, 'agent_observed', 1.0, 0, ?, ?, 0)
      `).run(id, ctx.studentId, subject, topic, now, now)
      kp = { id, prerequisites: null }
    }

    let prereqs: Array<{ topic: string; subject: string }> = []
    try { prereqs = JSON.parse(kp.prerequisites ?? '[]') } catch { /* ignore */ }

    const already = prereqs.some(p => p.topic === requires_topic && p.subject === requires_subject)
    if (!already) {
      prereqs.push({ topic: requires_topic, subject: requires_subject })
      db.prepare(`UPDATE KnowledgePoint SET prerequisites=?, update_time=? WHERE id=?`)
        .run(JSON.stringify(prereqs), now, kp.id)
    }

    // 返回前置知识点的当前掌握度
    const prereqKp = db.prepare(
      `SELECT COALESCE(confidence, 1-weakness_score) AS confidence FROM KnowledgePoint WHERE student_id=? AND topic=? AND subject=? AND delete_flag=0`
    ).get(ctx.studentId, requires_topic, requires_subject) as { confidence: number } | undefined

    const pct = prereqKp ? Math.round(prereqKp.confidence * 100) : null
    const status = pct === null ? '尚无记录' : pct >= 70 ? `掌握度 ${pct}%（较好）` : `掌握度 ${pct}%（不足，建议先补）`
    return `已记录依赖：${subject}·${topic} → 需要 ${requires_subject}·${requires_topic}${reason ? `（${reason}）` : ''}。前置状态：${status}`
  }
})

// ── check_prerequisites ───────────────────────────────────────────────
registerTool({
  name: 'check_prerequisites',
  description: `查询某知识点的所有前置依赖及其当前掌握情况。
调用时机：
- 准备讲解一个知识点前，先检查前置是否扎实
- 学生卡住后，快速诊断是哪个前置拖后腿
返回结果会告诉你哪些前置掌握不足，据此决定是先补前置还是直接讲当前知识点。`,
  input_schema: {
    type: 'object',
    properties: {
      topic:   { type: 'string' },
      subject: { type: 'string' }
    },
    required: ['topic', 'subject']
  },
  async execute(params, ctx: ToolContext): Promise<string> {
    const { topic, subject } = params as { topic: string; subject: string }
    const db = getDB()

    const kp = db.prepare(
      `SELECT prerequisites FROM KnowledgePoint WHERE student_id=? AND topic=? AND subject=? AND delete_flag=0`
    ).get(ctx.studentId, topic, subject) as { prerequisites: string | null } | undefined

    if (!kp?.prerequisites) {
      return `${subject}·${topic} 暂无记录的前置依赖。`
    }

    let prereqs: Array<{ topic: string; subject: string }> = []
    try { prereqs = JSON.parse(kp.prerequisites) } catch { return '前置数据解析失败' }

    if (prereqs.length === 0) return `${subject}·${topic} 无前置依赖。`

    const results = prereqs.map(p => {
      const pr = db.prepare(
        `SELECT COALESCE(confidence, 1-weakness_score) AS confidence, root_cause FROM KnowledgePoint WHERE student_id=? AND topic=? AND subject=? AND delete_flag=0`
      ).get(ctx.studentId, p.topic, p.subject) as { confidence: number; root_cause: string | null } | undefined

      if (!pr) return { ...p, confidence: null, status: '无记录', needsWork: true }
      const pct = Math.round(pr.confidence * 100)
      return {
        ...p, confidence: pct,
        status: pct >= 70 ? '掌握良好' : pct >= 50 ? '掌握一般' : '明显薄弱',
        needsWork: pct < 70,
        ...(pr.root_cause ? { rootCause: pr.root_cause } : {})
      }
    })

    const gaps = results.filter(r => r.needsWork)
    const summary = gaps.length === 0
      ? '所有前置掌握良好，可以直接讲当前知识点。'
      : `发现 ${gaps.length} 个前置不足：${gaps.map(g => `${g.subject}·${g.topic}（${g.status}）`).join('、')}，建议先补这些再讲 ${topic}。`

    return JSON.stringify({ topic, subject, prerequisites: results, recommendation: summary }, null, 2)
  }
})

// ── get_sobriety ──────────────────────────────────────────
// AI 主动查询完整清醒快照（system prompt 里只放摘要，需要细节时调用此工具）
registerTool({
  name: 'get_sobriety',
  description: '获取学生当前完整的"清醒视角"快照：考试倒计时、待复习知识点（含遗忘保留率）、持续卡点、学科分布漂移、上次未理清的悬念。当 system prompt 中"清醒视角"提到具体事项需要展开时调用。',
  input_schema: { type: 'object', properties: {} },
  async execute(_params, ctx: ToolContext): Promise<string> {
    const { getOrRefreshSnapshot } = await import('../services/sobriety.service')
    const snap = getOrRefreshSnapshot(ctx.studentId, 5 * 60 * 1000)
    return JSON.stringify(snap, null, 2)
  }
})
