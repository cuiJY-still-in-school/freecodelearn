import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'
import { getAIConfig } from './settings.service'
import { sm2Review } from './srs.service'

export interface GradedProblem {
  index: number
  question: string
  studentAnswer: string
  correct: boolean
  score: number
  maxScore: number
  explanation: string
  errorType?: string
  topic?: string
}

export interface HomeworkResult {
  problems: GradedProblem[]
  totalScore: number
  maxTotal: number
  percentage: number
  summary: string
  weakTopics: string[]
}

const GRADE_PROMPT = `你是一位严格但耐心的老师，正在批改学生的作业照片。

请仔细识别图片中的：
1. 每道题目的题号和题目内容
2. 学生写的答案
3. 判断答案是否正确（数学题计算结果、步骤方法是否正确）

以 JSON 格式返回批改结果，格式如下：
{
  "problems": [
    {
      "index": 1,
      "question": "题目描述",
      "studentAnswer": "学生答案",
      "correct": true/false,
      "score": 得分,
      "maxScore": 满分,
      "explanation": "批改说明，错题要详细解释正确解法",
      "errorType": "计算错误/概念错误/书写错误/审题错误/null",
      "topic": "该题对应的知识点名称（如：一元一次方程、勾股定理）"
    }
  ],
  "summary": "整体评价（50字以内）",
  "weakTopics": ["薄弱知识点1", "薄弱知识点2"]
}

要求：
- 每题满分默认10分（若图中有标注则用标注分数）
- 步骤部分对但结果错可酌情给分
- errorType 仅在答错时填写
- 如果图片模糊或无法识别，在 summary 中说明
- 必须返回合法 JSON，不要加代码块标记`

export async function gradeHomework(
  imageBase64: string,
  mimeType: string,
  subject: string,
  studentId: string
): Promise<HomeworkResult> {
  const cfgResult = getAIConfig()
  if (!cfgResult.success || !cfgResult.data) throw new Error('AI 未配置')
  const cfg = cfgResult.data as { apiKey: string; modelId: string; baseUrl?: string }
  if (!cfg.apiKey) throw new Error('AI API Key 未配置')

  const baseUrl = cfg.baseUrl || 'https://api.minimaxi.com/v1'
  const modelId = cfg.modelId || 'MiniMax-M2.7'

  const reqBody = {
    model: modelId,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          { type: 'text', text: GRADE_PROMPT + (subject ? `\n\n科目：${subject}` : '') }
        ]
      }
    ],
    max_tokens: 2000,
    temperature: 0.1
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
    signal: AbortSignal.timeout(30000)
  })

  if (!res.ok) throw new Error(`AI API error: ${res.status}`)
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
  const raw = data.choices?.[0]?.message?.content || ''

  let parsed: { problems: GradedProblem[]; summary: string; weakTopics: string[] }
  try {
    // 处理可能包裹在 ```json ``` 中的情况
    const jsonStr = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
    parsed = JSON.parse(jsonStr)
  } catch {
    // AI 未按格式返回，构造降级结果
    return {
      problems: [],
      totalScore: 0,
      maxTotal: 0,
      percentage: 0,
      summary: raw.slice(0, 200) || '批改失败，请重新拍照上传（确保图片清晰）',
      weakTopics: []
    }
  }

  const problems = parsed.problems || []
  const totalScore = problems.reduce((s, p) => s + (p.score || 0), 0)
  const maxTotal = problems.reduce((s, p) => s + (p.maxScore || 10), 0)

  // 将薄弱点写入 KnowledgePoint 表，并同步 SM-2
  if (studentId && parsed.weakTopics?.length) {
    const db = getDB()
    const now = Date.now()
    for (const topic of parsed.weakTopics) {
      const existing = db.prepare(
        'SELECT id, confidence, COALESCE(srs_reps,0) AS srs_reps, COALESCE(srs_interval,1) AS srs_interval, COALESCE(srs_ease,2.5) AS srs_ease FROM KnowledgePoint WHERE student_id = ? AND topic = ? AND subject = ? AND delete_flag = 0'
      ).get(studentId, topic, subject || '未知科目') as { id: string; confidence: number; srs_reps: number; srs_interval: number; srs_ease: number } | undefined

      let kpId: string
      let prevReps = 0, prevInterval = 1, prevEase = 2.5
      if (existing) {
        kpId = existing.id
        prevReps = existing.srs_reps; prevInterval = existing.srs_interval; prevEase = existing.srs_ease
        const newConf = Math.max(0.1, (existing.confidence || 0.5) - 0.1)
        db.prepare('UPDATE KnowledgePoint SET confidence = ?, update_time = ? WHERE id = ?')
          .run(newConf, now, kpId)
      } else {
        kpId = uuidv4()
        db.prepare(`
          INSERT INTO KnowledgePoint (id, student_id, subject, topic, weakness_score, confidence, attempt_count,
            data_source, create_time, update_time, delete_flag)
          VALUES (?, ?, ?, ?, 0.6, 0.4, 1, 'homework_grading', ?, ?, 0)
        `).run(kpId, studentId, subject || '未知科目', topic, now, now)
      }

      // SM-2 同步：作业批改发现薄弱点 → grade=1（困难）
      const sm2 = sm2Review(1, prevReps, prevInterval, prevEase)
      db.prepare(`UPDATE KnowledgePoint SET srs_reps=?, srs_interval=?, srs_ease=?, srs_due_at=? WHERE id=?`)
        .run(sm2.reps, sm2.interval, sm2.ease, sm2.dueAt, kpId)
    }
  }

  // 将答错的题写入 MistakeBook
  if (studentId) {
    const db = getDB()
    const now = Date.now()
    const wrongProblems = problems.filter(p => !p.correct)
    for (const p of wrongProblems) {
      const topic = p.topic || parsed.weakTopics?.[0] || '未知知识点'
      db.prepare(`
        INSERT INTO MistakeBook (id, student_id, subject, topic, question, student_answer,
          correct_answer, error_type, root_cause, reviewed, review_count, source,
          create_time, update_time, delete_flag)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'homework_grading', ?, ?, 0)
      `).run(
        uuidv4(), studentId, subject || '未知科目', topic,
        p.question || null,
        p.studentAnswer || null,
        p.explanation || null,
        p.errorType || null,
        null,
        now, now
      )
    }
  }

  return {
    problems,
    totalScore,
    maxTotal,
    percentage: maxTotal > 0 ? Math.round((totalScore / maxTotal) * 100) : 0,
    summary: parsed.summary || '',
    weakTopics: parsed.weakTopics || []
  }
}
