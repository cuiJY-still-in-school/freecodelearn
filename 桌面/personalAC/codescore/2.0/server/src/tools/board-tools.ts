import { registerTool, ToolContext } from './index'

// ── add_text: AI 在白板上加文本框 ──────────────────
registerTool({
  name: 'add_text',
  description: '在白板上添加一个文本框。用于给学生展示解题步骤、提示、知识点等。学生会看到这个文本框出现在白板上。',
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '文本框内容，支持 LaTeX 公式。简洁为宜，不超过 200 字' },
      x: { type: 'number', description: '白板上的 x 坐标（像素），默认 100' },
      y: { type: 'number', description: '白板上的 y 坐标（像素），默认 100' },
      width: { type: 'number', description: '文本框宽度（像素），默认 300' },
    },
    required: ['text'],
  },
  async execute(params) {
    return JSON.stringify({
      board_action: 'add_text',
      x: params.x || 100,
      y: params.y || 100,
      text: params.text,
      width: params.width || 300,
    })
  },
})

// ── highlight: AI 高亮某个区域 ────────────────────
registerTool({
  name: 'highlight',
  description: '在白板上高亮圈出一个区域，用于指代白板上的特定内容。比如圈出学生写错的地方。',
  input_schema: {
    type: 'object',
    properties: {
      x: { type: 'number', description: '高亮区域左上角 x' },
      y: { type: 'number', description: '高亮区域左上角 y' },
      w: { type: 'number', description: '宽度' },
      h: { type: 'number', description: '高度' },
      color: { type: 'string', description: '颜色 hex，默认 #cc785c' },
      note: { type: 'string', description: '标注说明' },
    },
    required: ['x', 'y', 'w', 'h'],
  },
  async execute(params) {
    return JSON.stringify({
      board_action: 'highlight',
      x: params.x, y: params.y, w: params.w, h: params.h,
      color: params.color || '#cc785c',
      note: params.note || '',
    })
  },
})

// ── ask_question: 出互动题 ─────────────────────────
registerTool({
  name: 'ask_question',
  description: '在白板上出一道互动题目。学生会看到题目卡片，可以在上面作答。',
  input_schema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: '题目内容' },
      hints: { type: 'array', items: { type: 'string' }, description: '可选提示列表' },
      difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
    },
    required: ['question'],
  },
  async execute(params) {
    return JSON.stringify({
      board_action: 'add_text',
      x: 120, y: 300,
      text: `📝 **题目**\n${params.question}${params.hints?.length ? '\n\n💡 提示：' + params.hints.join('；') : ''}`,
      width: 400,
    })
  },
})

// ── clear_my_stuff: 清除 AI 加的内容 ───────────────
registerTool({
  name: 'clear_my_stuff',
  description: '清除白板上所有你之前添加的内容（AI 文本框、高亮等），不影响学生手写的内容。',
  input_schema: { type: 'object', properties: {} },
  async execute() {
    return JSON.stringify({ board_action: 'clear_ai' })
  },
})

// ── 保留的核心知识工具 ─────────────────────────────
// get_student_summary, update_knowledge, record_learning, log_explanation, manage_todo
// 已在之前的 board-tools.ts 中注册，保持不变
