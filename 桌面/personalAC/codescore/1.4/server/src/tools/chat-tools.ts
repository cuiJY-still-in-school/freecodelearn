import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'
import { registerTool, ToolContext } from './index'
import { sm2Review } from '../services/srs.service'
import './search-tool'
import './python-tool'

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

    const unreviewedMistakes = db.prepare(`
      SELECT subject, topic, error_type, root_cause, create_time
      FROM MistakeBook
      WHERE student_id = ? AND reviewed = 0 AND delete_flag = 0
      ORDER BY create_time DESC LIMIT 5
    `).all(ctx.studentId) as Array<{
      subject: string; topic: string; error_type: string | null; root_cause: string | null; create_time: number
    }>

    return JSON.stringify({
      activePlan: plan
        ? { title: plan.title, subjects: JSON.parse(plan.subjects || '[]') }
        : null,
      weakPoints,
      sessionsThisWeek: activity.cnt,
      unreviewedMistakes: unreviewedMistakes.map(m => ({
        subject: m.subject,
        topic: m.topic,
        ...(m.error_type ? { errorType: m.error_type } : {}),
        ...(m.root_cause ? { rootCause: m.root_cause } : {}),
        daysSince: Math.floor((now - m.create_time) / 86400000)
      }))
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
      SELECT id, stability, error_types,
             COALESCE(srs_reps, 0) AS srs_reps,
             COALESCE(srs_interval, 1) AS srs_interval,
             COALESCE(srs_ease, 2.5) AS srs_ease
      FROM KnowledgePoint
      WHERE student_id = ? AND topic = ? AND subject = ? AND delete_flag = 0
    `).get(ctx.studentId, topic, subject) as {
      id: string; stability: number; error_types: string | null
      srs_reps: number; srs_interval: number; srs_ease: number
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

    let kpId: string
    if (existing) {
      kpId = existing.id
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
      kpId = uuidv4()
      db.prepare(`
        INSERT INTO KnowledgePoint
          (id, student_id, subject, topic, weakness_score, confidence, data_source,
           stability, error_types, root_cause, attempt_count, last_practiced, create_time, update_time, delete_flag)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1.0, ?, ?, 1, ?, ?, ?, 0)
      `).run(
        kpId, ctx.studentId, subject, topic,
        1 - confidence, confidence, source,
        JSON.stringify(errorTypes), root_cause ?? null, now, now, now
      )
    }

    // SM-2 间隔复习同步：AI 评估置信度时联动调整下次复习日期
    const sm2Grade = confidence >= 0.8 ? 5 : confidence >= 0.65 ? 4 : confidence >= 0.5 ? 3
      : confidence >= 0.35 ? 2 : confidence >= 0.2 ? 1 : 0
    const sm2 = sm2Review(
      sm2Grade,
      existing?.srs_reps ?? 0,
      existing?.srs_interval ?? 1,
      existing?.srs_ease ?? 2.5
    )
    db.prepare(`UPDATE KnowledgePoint SET srs_reps=?, srs_interval=?, srs_ease=?, srs_due_at=? WHERE id=?`)
      .run(sm2.reps, sm2.interval, sm2.ease, sm2.dueAt, kpId)

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

    // 联动更新 KP 的 last_practiced，修复 Ebbinghaus 遗忘曲线精度
    const existing = db.prepare(
      `SELECT id, stability, confidence FROM KnowledgePoint
       WHERE student_id = ? AND topic = ? AND subject = ? AND delete_flag = 0`
    ).get(ctx.studentId, topic, subject) as { id: string; stability: number; confidence: number } | undefined

    if (existing) {
      if (score != null) {
        // 有得分：同步更新置信度和稳定性
        const newConf = Math.max(0.05, Math.min(1.0, score / 100))
        const newStability = newConf > 0.65
          ? Math.min(existing.stability * 1.8 + 1, 60)
          : Math.max(existing.stability * 0.5, 0.5)
        db.prepare(`
          UPDATE KnowledgePoint SET
            confidence = ?, weakness_score = ?, stability = ?,
            last_practiced = ?, attempt_count = attempt_count + 1, update_time = ?
          WHERE id = ?
        `).run(newConf, 1 - newConf, newStability, now, now, existing.id)
      } else {
        // 无得分：仅更新 last_practiced，不改变置信度
        db.prepare(`UPDATE KnowledgePoint SET last_practiced = ?, update_time = ? WHERE id = ?`)
          .run(now, now, existing.id)
      }
    }

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

// ── manage_todo ── 1.4新增：AI 智能待办管理 ─────────────────────────────
registerTool({
  name: 'manage_todo',
  description: `管理学生的智能待办事项（Todo）。支持以下操作：
- list：列出 pending 待办（可按 priority 过滤）
- create：创建新待办（提供 title，可选 content/priority/due_date/related_kp_id）。会自动检查重复标题，避免重复创建。
- complete：标记完成。优先用 title_search 按标题搜索，无需先 list 拿 id；也可用 todo_id 精确匹配。
- drop：放弃某项。同 complete，优先 title_search。
- update：修改内容（提供 todo_id + 要修改的字段）

在对话中感知到学生有未完成任务、需要提醒的事项时，主动调用此工具创建待办。
学生说"完成了/做完了 XXX"时，直接用 action=complete + title_search=XXX，不需要先 list。`,
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'create', 'complete', 'drop', 'update'],
        description: '操作类型'
      },
      todo_id: { type: 'string', description: 'complete/drop/update 时可选，与 title_search 二选一' },
      title_search: { type: 'string', description: 'complete/drop 时按标题模糊搜索，找到最匹配的 pending 待办并操作，比 todo_id 更方便' },
      title:   { type: 'string', description: 'create 时必填' },
      content: { type: 'string' },
      priority: {
        type: 'string',
        enum: ['low', 'normal', 'high', 'urgent'],
        description: '优先级，默认 normal'
      },
      due_date: {
        type: 'number',
        description: '截止日期，Unix 毫秒时间戳'
      },
      related_kp_id: { type: 'string', description: '关联的知识点 ID' },
      must_do: {
        type: 'boolean',
        description: 'create/update 时可设置为 true，表示必做项（学生必须优先完成）。监护人要求强制完成某项时使用。'
      },
      filter_status: {
        type: 'string',
        enum: ['pending', 'done', 'dropped'],
        description: 'list 时过滤状态，默认 pending'
      }
    },
    required: ['action']
  },
  async execute(params, ctx: ToolContext): Promise<string> {
    const {
      createTodo, listTodos, updateTodo, getOverdueTodos
    } = await import('../services/todo.service')
    const { getDB } = await import('../database')
    const db = getDB()

    const p = params as {
      action: string; todo_id?: string; title_search?: string; title?: string; content?: string
      priority?: any; due_date?: number; related_kp_id?: string; filter_status?: any; must_do?: boolean
    }

    // 按标题模糊匹配 pending 待办，返回最佳匹配 id
    function findByTitle(search: string): string | null {
      const rows = db.prepare(
        `SELECT id, title FROM Todo WHERE student_id=? AND status='pending' AND delete_flag=0`
      ).all(ctx.studentId) as Array<{ id: string; title: string }>
      if (rows.length === 0) return null
      const q = search.toLowerCase()
      // 精确匹配优先
      const exact = rows.find(r => r.title.toLowerCase() === q)
      if (exact) return exact.id
      // 包含匹配
      const contains = rows.filter(r => r.title.toLowerCase().includes(q) || q.includes(r.title.toLowerCase()))
      if (contains.length === 1) return contains[0].id
      if (contains.length > 1) return contains[0].id // 取第一个
      return null
    }

    switch (p.action) {
      case 'list': {
        const todos = listTodos(ctx.studentId, { status: p.filter_status ?? 'pending', limit: 20 })
        const overdue = getOverdueTodos(ctx.studentId)
        if (todos.length === 0 && overdue.length === 0) return '当前没有待办事项。'
        const overdueNote = overdue.length > 0 ? `⚠️ 逾期未完成：${overdue.length} 项\n` : ''
        const lines = todos.map(t => {
          const due = t.due_date ? `（截止 ${new Date(t.due_date).toLocaleDateString('zh-CN')}）` : ''
          const badge = t.priority === 'urgent' ? '🔴' : t.priority === 'high' ? '🟠' : t.priority === 'low' ? '⚪' : '🟡'
          return `${badge} [${t.id.slice(0,8)}] ${t.title}${due}`
        })
        return overdueNote + lines.join('\n')
      }
      case 'create': {
        if (!p.title) return '创建待办需要 title。'
        // 去重：相同标题的 pending 待办已存在则直接返回
        const existing = db.prepare(
          `SELECT id FROM Todo WHERE student_id=? AND title=? AND status='pending' AND delete_flag=0 LIMIT 1`
        ).get(ctx.studentId, p.title) as { id: string } | undefined
        if (existing) {
          return `「${p.title}」已在待办列表中（id: ${existing.id.slice(0,8)}），未重复创建。`
        }
        const todo = createTodo({
          student_id: ctx.studentId,
          title: p.title,
          content: p.content,
          priority: p.priority,
          due_date: p.due_date,
          related_kp_id: p.related_kp_id,
          must_do: p.must_do ?? false,
          agent_created: true
        })
        const due = todo.due_date ? `，截止 ${new Date(todo.due_date).toLocaleDateString('zh-CN')}` : ''
        return `✅ 已创建待办：「${todo.title}」[${todo.id.slice(0,8)}]${due}`
      }
      case 'complete': {
        const id = p.todo_id || (p.title_search ? findByTitle(p.title_search) : null)
        if (!id) return p.title_search ? `未找到匹配「${p.title_search}」的待办，请让学生确认任务名称。` : '需要提供 todo_id 或 title_search。'
        const row = db.prepare(`SELECT title FROM Todo WHERE id=? AND delete_flag=0`).get(id) as { title: string } | undefined
        updateTodo(id, { status: 'done' })
        return `✅ 已完成：「${row?.title ?? id.slice(0,8)}」`
      }
      case 'drop': {
        const id = p.todo_id || (p.title_search ? findByTitle(p.title_search) : null)
        if (!id) return p.title_search ? `未找到匹配「${p.title_search}」的待办。` : '需要提供 todo_id 或 title_search。'
        const row = db.prepare(`SELECT title FROM Todo WHERE id=? AND delete_flag=0`).get(id) as { title: string } | undefined
        updateTodo(id, { status: 'dropped' })
        return `已放弃：「${row?.title ?? id.slice(0,8)}」`
      }
      case 'update': {
        if (!p.todo_id) return '需要提供 todo_id。'
        const patch: Record<string, unknown> = {}
        if (p.title !== undefined) patch.title = p.title
        if (p.content !== undefined) patch.content = p.content
        if (p.priority !== undefined) patch.priority = p.priority
        if (p.due_date !== undefined) patch.due_date = p.due_date
        if (p.must_do !== undefined) patch.must_do = p.must_do ? 1 : 0
        updateTodo(p.todo_id, patch as any)
        return `待办已更新。`
      }
      default:
        return `未知操作：${p.action}`
    }
  }
})

// ── relay_image ───────────────────────────────────────────────────────────────
registerTool({
  name: 'relay_image',
  description: '将用户刚发送的图片转发给另一方（监护人→学生 或 学生→监护人）。调用前必须确认消息中确实包含图片，且用户明确要求转发。',
  input_schema: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        enum: ['student', 'guardian'],
        description: '转发目标：student=发给学生，guardian=发给监护人'
      },
      caption: {
        type: 'string',
        description: '附带说明文字（可选）'
      }
    },
    required: ['target']
  },
  async execute(params, ctx): Promise<string> {
    const p = params as { target: string; caption?: string }
    const { createRelay } = await import('../services/relay.service')

    // 从对话历史中找最近一条用户消息里的图片
    const msgs = ctx.rawMessages ?? []
    let imgData: string | null = null
    let imgMime = 'image/jpeg'

    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i]
      if (msg.role !== 'user') continue
      const parts = Array.isArray(msg.content) ? msg.content as Array<{ type: string; data?: string; mediaType?: string }> : []
      for (const part of parts) {
        if (part.type === 'image' && part.data) {
          imgData = part.data
          imgMime = part.mediaType ?? 'image/jpeg'
          break
        }
      }
      if (imgData) break
    }

    if (!imgData) return '未找到图片，请先上传一张图片再转发。'

    // 校验：不能转发给自己
    if (p.target === 'student' && ctx.userRole === 'student') return '学生不能把图片转发给自己。'
    if (p.target === 'guardian' && ctx.userRole === 'guardian') return '监护人不能把图片转发给自己。'

    createRelay(ctx.studentId, ctx.userRole, imgData, imgMime, p.caption)

    const who = p.target === 'student' ? '孩子' : '监护人'
    return `已将图片转发给${who}${p.caption ? `，附言：${p.caption}` : ''}。对方下次打开对话时将看到这张图片。`
  }
})

// ── describe_image ────────────────────────────────────────────────────────────
registerTool({
  name: 'describe_image',
  description: '用本地 MiniCPM-V 视觉模型对用户最近上传的图片进行专项分析。当自动识别结果不够清晰，或需要针对特定内容（某道题、某行手写字、某个图表）精确识别时使用。',
  input_schema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: '分析指令，如"请仔细识别第2题手写答案"、"提取所有数学公式"、"描述图表数据"。留空则用默认全面识别。'
      }
    },
    required: []
  },
  async execute(params, ctx): Promise<string> {
    // 每次请求最多调用 2 次，防止 agent 循环反复压 Ollama
    ctx._callCounts = ctx._callCounts ?? {}
    ctx._callCounts['describe_image'] = (ctx._callCounts['describe_image'] ?? 0) + 1
    if (ctx._callCounts['describe_image'] > 2) {
      return '已多次分析图片，本次请求不再重复调用视觉模型。请基于之前的识别结果作答。'
    }

    const p = params as { prompt?: string }
    const msgs = ctx.rawMessages ?? []
    let imgData: string | null = null
    let imgMime = 'image/jpeg'
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i]
      if (msg.role !== 'user') continue
      const parts = Array.isArray(msg.content)
        ? (msg.content as Array<{ type: string; data?: string; mediaType?: string }>)
        : []
      for (const part of parts) {
        if (part.type === 'image' && part.data) {
          imgData = part.data; imgMime = part.mediaType ?? 'image/jpeg'; break
        }
      }
      if (imgData) break
    }
    if (!imgData) return '未找到图片，请先上传图片。'
    try {
      const { describeImage } = await import('../services/vision.service')
      return await describeImage(imgData, imgMime, p.prompt || undefined)
    } catch (err) {
      return `视觉分析失败：${err instanceof Error ? err.message : String(err)}`
    }
  }
})

// ── notify_guardian ───────────────────────────────────────────────────────────
registerTool({
  name: 'notify_guardian',
  description: '学生向监护人发送一条文字通知（如"我需要新任务"、"作业做完了"、"有问题想问你"）。只有学生才能调用，监护人无法调用此工具。',
  input_schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: '发送给监护人的消息内容，简洁明了，不超过 200 字'
      }
    },
    required: ['message']
  },
  async execute(params, ctx): Promise<string> {
    const p = params as { message: string }
    if (ctx.userRole !== 'student') return '只有学生才能向监护人发送通知。'
    if (!p.message?.trim()) return '消息内容不能为空。'
    const text = p.message.trim().slice(0, 200)
    const { createRelay } = await import('../services/relay.service')
    createRelay(ctx.studentId, 'student', text, 'text/plain', text)
    return `已通知监护人："${text}"。监护人下次打开对话时将看到这条消息。`
  }
})

// ── drive_list ────────────────────────────────────────────────────────────────
registerTool({
  name: 'drive_list',
  description: '列出学生工作区文件中某目录下的文件和子文件夹。path 为空时列出根目录。',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '目录路径，如 "homework/math"，不填则为根目录' }
    }
  },
  async execute(params, ctx): Promise<string> {
    const { getDB } = await import('../database')
    const db = getDB()
    const studentId = ctx?.studentId
    if (!studentId) return '【工作区文件】无法确定学生身份。'

    const dirParam = ((params as { path?: string }).path || '').replace(/^\/+/, '')
    const prefix = dirParam ? dirParam + '/' : ''

    const rows = db.prepare(
      `SELECT rel_path, name, size, mime, modify_time FROM DriveFile
       WHERE student_id = ? AND delete_flag = 0 ORDER BY rel_path`
    ).all(studentId) as Array<{ rel_path: string; name: string; size: number; mime: string; modify_time: number }>

    const dirs = new Set<string>()
    const files: string[] = []
    for (const r of rows) {
      if (!r.rel_path.startsWith(prefix)) continue
      const rest = r.rel_path.slice(prefix.length)
      const slash = rest.indexOf('/')
      if (slash === -1) {
        const kb = (r.size / 1024).toFixed(1)
        const dt = new Date(r.modify_time).toLocaleDateString('zh-CN')
        files.push(`📄 ${rest}  (${kb} KB, ${dt})`)
      } else {
        dirs.add(rest.slice(0, slash))
      }
    }

    if (!dirs.size && !files.length) return `工作区文件目录"${dirParam || '/'}"为空。`

    const lines = [
      `**工作区文件目录：/${dirParam || ''}**`,
      ...[...dirs].sort().map(d => `📁 ${d}/`),
      ...files,
    ]
    return lines.join('\n')
  }
})

// ── drive_read ────────────────────────────────────────────────────────────────
registerTool({
  name: 'drive_read',
  description: '读取工作区文件中一个文本文件的内容（仅支持文本类文件）。',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件相对路径，如 "homework/math.md"' }
    },
    required: ['path']
  },
  async execute(params, ctx): Promise<string> {
    const { getDB } = await import('../database')
    const fs = await import('fs')
    const path = await import('path')
    const db = getDB()
    const studentId = ctx?.studentId
    if (!studentId) return '【工作区文件】无法确定学生身份。'

    const relPath = ((params as { path: string }).path || '').replace(/^\/+/, '')
    const row = db.prepare(
      `SELECT mime, size FROM DriveFile WHERE student_id = ? AND rel_path = ? AND delete_flag = 0`
    ).get(studentId, relPath) as { mime: string; size: number } | undefined

    if (!row) return `【工作区文件】文件"${relPath}"不存在。`
    if (!row.mime?.startsWith('text/') && row.mime !== 'application/json') {
      return `【工作区文件】文件"${relPath}"是二进制文件（${row.mime}），无法以文本读取。`
    }
    if (row.size > 200 * 1024) return `【工作区文件】文件过大（${(row.size/1024).toFixed(0)} KB），无法直接读取。`

    const driveRoot = path.join(process.env.DATA_DIR ?? path.join(process.cwd(), 'data'), 'drive')
    const abs = path.join(driveRoot, studentId, relPath)
    if (!fs.existsSync(abs)) return `【工作区文件】文件内容丢失，请重新同步。`

    const content = fs.readFileSync(abs, 'utf8')
    return `**工作区文件：${relPath}**\n\`\`\`\n${content}\n\`\`\``
  }
})

// ── drive_write ───────────────────────────────────────────────────────────────
registerTool({
  name: 'drive_write',
  description: '在工作区文件中写入或更新一个文本文件，内容会推送给学生客户端。',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件相对路径，如 "notes/summary.md"' },
      content: { type: 'string', description: '文件完整内容（文本）' }
    },
    required: ['path', 'content']
  },
  async execute(params, ctx): Promise<string> {
    const { getDB } = await import('../database')
    const fs = await import('fs')
    const pathMod = await import('path')
    const { v4: uuidv4 } = await import('uuid')
    const db = getDB()
    const studentId = ctx?.studentId
    if (!studentId) return '【工作区文件】无法确定学生身份。'

    const p = params as { path: string; content: string }
    const relPath = p.path.replace(/^\/+/, '')
    const name = pathMod.basename(relPath)
    const content = p.content

    const base = pathMod.join(process.env.DATA_DIR ?? pathMod.join(process.cwd(), 'data'), 'drive', studentId)
    fs.mkdirSync(base, { recursive: true })
    const abs = pathMod.resolve(base, relPath)
    if (!abs.startsWith(base)) return '【云盘】非法路径。'

    fs.mkdirSync(pathMod.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, 'utf8')

    const now = Date.now()
    const size = Buffer.byteLength(content, 'utf8')
    const existing = db.prepare(
      `SELECT id FROM DriveFile WHERE student_id = ? AND rel_path = ? AND delete_flag = 0`
    ).get(studentId, relPath)

    if (existing) {
      db.prepare(
        `UPDATE DriveFile SET size=?, modify_time=?, pending_content=? WHERE student_id=? AND rel_path=? AND delete_flag=0`
      ).run(size, now, content, studentId, relPath)
    } else {
      db.prepare(
        `INSERT INTO DriveFile (id, student_id, rel_path, name, size, mime, sync_time, modify_time, pending_content, delete_flag)
         VALUES (?, ?, ?, ?, ?, 'text/plain', ?, ?, ?, 0)`
      ).run(uuidv4(), studentId, relPath, name, size, now, now, content)
    }

    return `✅ 已写入工作区文件"${relPath}"（${(size/1024).toFixed(1)} KB），下次客户端同步时会自动应用。`
  }
})

// ── wolfram_query ─────────────────────────────────────────────────────────────
registerTool({
  name: 'wolfram_query',
  description: `调用 WolframAlpha 进行精确计算和科学查询。适合：
- 数学：解方程、化简、因式分解、微积分（导数/积分）、矩阵运算、数列
- 数值计算：精确结果、数值近似、单位换算
- 科学数据：物理常数、化学元素、天文数据
- 统计：概率、分布
注意：输入必须为英文或数学符号；不适合主观问题或需要解释的概念。`,
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '英文查询语句或数学表达式，例如："solve x^2+3x-4=0"、"integrate sin(x)dx"、"derivative of x^3"、"500 USD to CNY"'
      }
    },
    required: ['query']
  },
  async execute(params): Promise<string> {
    const { getRawWolframAppId } = await import('../services/settings.service')
    const appId = getRawWolframAppId()
    if (!appId) return '【WolframAlpha 未配置】请在系统配置中填写 WolframAlpha App ID。'

    const p = params as { query: string }
    if (!p.query?.trim()) return '查询内容不能为空。'

    const queryStr = p.query.trim()

    try {
      const url = new URL('https://www.wolframalpha.com/api/v1/llm-api')
      url.searchParams.set('appid', appId)
      url.searchParams.set('input', queryStr)

      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) })
      if (!res.ok) return `WolframAlpha 请求失败（HTTP ${res.status}）`

      const text = await res.text()
      return text.trim() || 'WolframAlpha 返回了空结果。'
    } catch (err) {
      return `WolframAlpha 调用失败：${err instanceof Error ? err.message : String(err)}`
    }
  }
})

// ── schedule_wakeup ───────────────────────────────────────────────────
registerTool({
  name: 'schedule_wakeup',
  description: `让 AI 自己安排一个未来的定时唤醒：在指定时间，向学生或监护人发送一条消息。
适用场景举例：
- 学生说"明天晚上8点提醒我背单词" → 设置唤醒，target=student
- 家长说"孩子睡前帮我提醒他交作业" → 设置唤醒，target=student，message=交作业提醒
- AI 认为某知识点应该在3天后复习 → 主动排一个唤醒
支持 action: set / list / cancel。时间用 ISO 8601 字符串或 Unix 毫秒时间戳。`,
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['set', 'list', 'cancel'],
        description: 'set=新建唤醒, list=列出待执行的唤醒, cancel=取消某条（需 schedule_id）'
      },
      trigger_at: {
        type: 'string',
        description: '唤醒时间，ISO 8601 格式（如 "2026-05-18T20:00:00"）或毫秒时间戳字符串。set 时必填。'
      },
      target: {
        type: 'string',
        enum: ['student', 'guardian', 'both'],
        description: '发给谁：student=学生, guardian=监护人, both=两者都发。默认 student。'
      },
      message: {
        type: 'string',
        description: '到时间要发送的消息内容。set 时必填，写清楚想说什么。'
      },
      note: {
        type: 'string',
        description: '给自己看的备注，解释为什么排这个唤醒（可选）'
      },
      schedule_id: {
        type: 'string',
        description: 'cancel 时必填，要取消的唤醒 id'
      }
    },
    required: ['action']
  },
  async execute(params, ctx: ToolContext): Promise<string> {
    const { getDB } = await import('../database')
    const { v4: uuidv4 } = await import('uuid')
    const db = getDB()
    const p = params as {
      action: string; trigger_at?: string; target?: string
      message?: string; note?: string; schedule_id?: string
    }

    if (p.action === 'list') {
      const rows = db.prepare(
        `SELECT id, trigger_at, target, message, note FROM AgentSchedule
         WHERE student_id=? AND status='pending' ORDER BY trigger_at ASC LIMIT 20`
      ).all(ctx.studentId) as Array<{ id: string; trigger_at: number; target: string; message: string; note: string | null }>
      if (!rows.length) return '当前没有待执行的唤醒计划。'
      return rows.map(r => {
        const dt = new Date(r.trigger_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        const who = r.target === 'student' ? '学生' : r.target === 'guardian' ? '监护人' : '两者'
        return `[${r.id.slice(0,8)}] ${dt} → ${who}：${r.message}${r.note ? `（备注：${r.note}）` : ''}`
      }).join('\n')
    }

    if (p.action === 'cancel') {
      if (!p.schedule_id) return '请提供 schedule_id。'
      const result = db.prepare(
        `UPDATE AgentSchedule SET status='cancelled' WHERE id LIKE ? AND student_id=? AND status='pending'`
      ).run(p.schedule_id.slice(0, 8) + '%', ctx.studentId)
      return result.changes > 0 ? '已取消该唤醒计划。' : '未找到对应的待执行计划，可能已执行或不存在。'
    }

    // set
    if (!p.trigger_at || !p.message?.trim()) return '请提供 trigger_at 和 message。'
    const ts = isNaN(Number(p.trigger_at))
      ? new Date(p.trigger_at).getTime()
      : Number(p.trigger_at)
    if (isNaN(ts) || ts < Date.now()) return '时间格式无效或已过去，请提供未来的时间。'

    const id = uuidv4()
    db.prepare(
      `INSERT INTO AgentSchedule (id, student_id, trigger_at, target, message, note, status, create_time)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
    ).run(id, ctx.studentId, ts, p.target ?? 'student', p.message.trim(), p.note ?? null, Date.now())

    const dt = new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const who = (p.target ?? 'student') === 'student' ? '学生' : (p.target === 'guardian' ? '监护人' : '学生和监护人')
    return `✅ 已排好：${dt} 发给${who}「${p.message.trim()}」。编号 ${id.slice(0,8)}，用 list 可查，cancel 可取消。`
  }
})

// ── record_mistake ────────────────────────────────────────────────────────────
registerTool({
  name: 'record_mistake',
  description: `记录学生做错的题目到错题本。调用时机：
- 学生做题过程中答错了某道具体题目（AI 出题，学生答错）
- 监护人上传试卷，分析后发现典型错误
- 学生自述"这道题我做错了"且提供了题目内容
记录后自动更新对应知识点的置信度。支持 action=add（新增）或 action=mark_reviewed（标记已复习）。`,
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['add', 'mark_reviewed'],
        description: 'add=新增错题, mark_reviewed=标记某条错题已复习（需提供 topic 定位）'
      },
      subject:        { type: 'string', description: '科目' },
      topic:          { type: 'string', description: '知识点' },
      question:       { type: 'string', description: '题目原文（越完整越好）' },
      student_answer: { type: 'string', description: '学生的错误答案' },
      correct_answer: { type: 'string', description: '正确答案或解题思路' },
      error_type: {
        type: 'string',
        description: '错误类型：计算错误 / 概念混淆 / 步骤遗漏 / 审题失误 / 公式记错 / 其他'
      },
      root_cause: { type: 'string', description: '根因：学生卡在哪里，比如"不理解换元的意义"' },
    },
    required: ['action', 'subject', 'topic']
  },
  async execute(params, ctx: ToolContext): Promise<string> {
    const db = getDB()
    const now = Date.now()
    const p = params as {
      action: string; subject: string; topic: string
      question?: string; student_answer?: string; correct_answer?: string
      error_type?: string; root_cause?: string
    }

    if (p.action === 'mark_reviewed') {
      const rows = db.prepare(
        `SELECT id FROM MistakeBook
         WHERE student_id=? AND subject=? AND topic=? AND reviewed=0 AND delete_flag=0
         ORDER BY create_time DESC LIMIT 5`
      ).all(ctx.studentId, p.subject, p.topic) as Array<{ id: string }>
      if (rows.length === 0) return `未找到 ${p.subject}·${p.topic} 的未复习错题。`
      const stmt = db.prepare(
        `UPDATE MistakeBook SET reviewed=1, review_count=review_count+1, last_review_at=?, update_time=? WHERE id=?`
      )
      const markAll = db.transaction(() => { for (const r of rows) stmt.run(now, now, r.id) })
      markAll()
      return `✅ 已标记 ${rows.length} 道 ${p.subject}·${p.topic} 错题为已复习。`
    }

    // action = add
    if (!p.question && !p.student_answer) return '新增错题至少需要提供 question 或 student_answer。'

    // 查找关联的 KP id
    const kp = db.prepare(
      `SELECT id, stability, confidence FROM KnowledgePoint
       WHERE student_id=? AND topic=? AND subject=? AND delete_flag=0`
    ).get(ctx.studentId, p.topic, p.subject) as { id: string; stability: number; confidence: number } | undefined

    const id = uuidv4()
    db.prepare(`
      INSERT INTO MistakeBook
        (id, student_id, subject, topic, kp_id, question, student_answer, correct_answer,
         error_type, root_cause, reviewed, review_count, source, create_time, update_time, delete_flag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'agent_observed', ?, ?, 0)
    `).run(
      id, ctx.studentId, p.subject, p.topic, kp?.id ?? null,
      p.question ?? null, p.student_answer ?? null, p.correct_answer ?? null,
      p.error_type ?? null, p.root_cause ?? null, now, now
    )

    // 同步降低对应知识点的置信度（错题 = 置信度下调）
    if (kp) {
      const newConf = Math.max(0.05, kp.confidence * 0.7)
      const newStability = Math.max(kp.stability * 0.5, 0.5)
      db.prepare(`
        UPDATE KnowledgePoint SET
          confidence=?, weakness_score=?, stability=?,
          last_practiced=?, attempt_count=attempt_count+1, update_time=?
        WHERE id=?
      `).run(newConf, 1 - newConf, newStability, now, now, kp.id)
    }

    const parts = [
      `✏️ 已记入错题本：${p.subject}·${p.topic}`,
      p.error_type ? `错误类型：${p.error_type}` : '',
      p.root_cause ? `根因：${p.root_cause}` : '',
      kp ? `（已更新知识点置信度 → ${Math.round(Math.max(0.05, kp.confidence * 0.7) * 100)}%）` : ''
    ].filter(Boolean)
    return parts.join('，')
  }
})

// ── update_student_radar ──────────────────────────────────────────────
registerTool({
  name: 'update_student_radar',
  description: '更新学生六维雷达图。分析完学生状态后调用，自由选择最能反映该学生现状的6个维度（名称和数值都由你决定），写入 Dashboard 展示。维度数量固定为6个，每个维度包含 label（中文名）和 value（0-100 的整数分值）。',
  input_schema: {
    type: 'object',
    properties: {
      dimensions: {
        type: 'array',
        description: '恰好6个维度，顺序即雷达轴顺序',
        minItems: 6,
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: '维度名称，2-6个汉字' },
            value: { type: 'number', description: '0-100 的整数分值' },
          },
          required: ['label', 'value'],
        },
      },
      note: { type: 'string', description: '一句话分析摘要（可选，不超过40字）' },
    },
    required: ['dimensions'],
  },
  async execute(params, ctx: ToolContext): Promise<string> {
    const { upsertRadar } = await import('../routes/radar.routes')
    const dims = params.dimensions as Array<{ label: string; value: number }>
    if (!Array.isArray(dims) || dims.length !== 6) return '维度数量必须为6'
    const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)))
    upsertRadar(ctx.studentId, {
      dimensions: dims.map(d => ({ label: String(d.label), value: clamp(Number(d.value) || 0) })),
      note: params.note ?? null,
      updated_at: Date.now(),
    })
    return `雷达图已更新：${dims.map(d => `${d.label}(${d.value})`).join('、')}`
  }
})
