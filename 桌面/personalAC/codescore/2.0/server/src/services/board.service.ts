import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'

export interface BoardBlock {
  id: string
  board_id: string
  block_type: string
  content: string // JSON
  position: number
  created_by: 'student' | 'ai'
  ai_metadata: string | null
  version: number
  create_time: number
  update_time: number
}

export interface Board {
  id: string
  student_id: string
  title: string
  mode: 'study' | 'homework'
  block_count: number
  last_active_at: number | null
}

// ── 白板管理 ──────────────────────────────────────

export function getOrCreateBoard(studentId: string, mode: 'study' | 'homework' = 'study'): Board {
  const db = getDB()
  let board = db.prepare(
    'SELECT * FROM Board WHERE student_id = ? AND mode = ? AND delete_flag = 0'
  ).get(studentId, mode) as Board | undefined

  if (!board) {
    const id = uuidv4()
    const now = Date.now()
    db.prepare(
      "INSERT INTO Board (id, student_id, title, mode, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, studentId, mode === 'homework' ? '作业板' : '我的白板', mode, now, now)
    board = { id, student_id: studentId, title: mode === 'homework' ? '作业板' : '我的白板', mode, block_count: 0, last_active_at: null }
  }
  return board
}

export function touchBoard(boardId: string): void {
  const db = getDB()
  db.prepare('UPDATE Board SET last_active_at = ?, update_time = ? WHERE id = ?')
    .run(Date.now(), Date.now(), boardId)
}

// ── Block CRUD ────────────────────────────────────

export function getBlocks(boardId: string): BoardBlock[] {
  const db = getDB()
  return db.prepare(
    'SELECT * FROM BoardBlock WHERE board_id = ? AND delete_flag = 0 ORDER BY position ASC'
  ).all(boardId) as BoardBlock[]
}

export function addBlock(
  boardId: string,
  blockType: string,
  content: Record<string, any>,
  createdBy: 'student' | 'ai' = 'student',
  aiMetadata?: Record<string, any>,
  position?: number
): BoardBlock {
  const db = getDB()
  const id = uuidv4()
  const now = Date.now()

  if (position === undefined) {
    const maxPos = db.prepare(
      'SELECT MAX(position) as max FROM BoardBlock WHERE board_id = ? AND delete_flag = 0'
    ).get(boardId) as { max: number | null }
    position = (maxPos?.max ?? -1) + 1
  }

  const block: BoardBlock = {
    id, board_id: boardId, block_type: blockType,
    content: JSON.stringify(content),
    position, created_by: createdBy,
    ai_metadata: aiMetadata ? JSON.stringify(aiMetadata) : null,
    version: 1, create_time: now, update_time: now,
  }

  db.prepare(
    'INSERT INTO BoardBlock (id, board_id, block_type, content, position, created_by, ai_metadata, version, create_time, update_time) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run(block.id, block.board_id, block.block_type, block.content, block.position, block.created_by, block.ai_metadata, block.version, block.create_time, block.update_time)

  // 更新 board block_count
  db.prepare('UPDATE Board SET block_count = block_count + 1, last_active_at = ?, update_time = ? WHERE id = ?')
    .run(now, now, boardId)

  // 记录事件
  logBoardEvent(boardId, 'add_block', id, { block_type: blockType }, createdBy)

  return block
}

export function updateBlock(blockId: string, updates: { content?: Record<string, any>; block_type?: string; version?: number }): BoardBlock | null {
  const db = getDB()
  const existing = db.prepare('SELECT * FROM BoardBlock WHERE id = ? AND delete_flag = 0').get(blockId) as BoardBlock | undefined
  if (!existing) return null

  const now = Date.now()
  const content = updates.content ? JSON.stringify(updates.content) : existing.content
  const blockType = updates.block_type || existing.block_type
  const version = (existing.version || 1) + 1

  db.prepare(
    'UPDATE BoardBlock SET content = ?, block_type = ?, version = ?, update_time = ? WHERE id = ?'
  ).run(content, blockType, version, now, blockId)

  logBoardEvent(existing.board_id, 'update_block', blockId, { block_type: blockType }, 'student')

  return { ...existing, content, block_type: blockType, version, update_time: now }
}

export function deleteBlock(blockId: string): boolean {
  const db = getDB()
  const existing = db.prepare('SELECT * FROM BoardBlock WHERE id = ? AND delete_flag = 0').get(blockId) as BoardBlock | undefined
  if (!existing) return false

  const now = Date.now()
  db.prepare('UPDATE BoardBlock SET delete_flag = 1, update_time = ? WHERE id = ?').run(now, blockId)
  db.prepare('UPDATE Board SET block_count = MAX(0, block_count - 1), update_time = ? WHERE id = ?')
    .run(now, existing.board_id)

  logBoardEvent(existing.board_id, 'delete_block', blockId, {}, 'student')
  return true
}

export function reorderBlocks(boardId: string, blockIds: string[]): void {
  const db = getDB()
  const now = Date.now()
  const stmt = db.prepare('UPDATE BoardBlock SET position = ?, update_time = ? WHERE id = ? AND board_id = ?')
  const runAll = db.transaction(() => {
    blockIds.forEach((id, i) => stmt.run(i, now, id, boardId))
  })
  runAll()
  logBoardEvent(boardId, 'reorder', null, { block_ids: blockIds }, 'student')
}

// ── AI 操作 ───────────────────────────────────────

export function aiAddBlock(
  boardId: string,
  blockType: string,
  content: Record<string, any>,
  aiMetadata?: Record<string, any>,
  position?: number
): BoardBlock {
  return addBlock(boardId, blockType, content, 'ai', aiMetadata, position)
}

// ── 摘要 (注入 system prompt) ─────────────────────

export function getBoardSummary(studentId: string, mode: 'study' | 'homework' = 'study', maxBlocks: number = 10): string {
  const board = getOrCreateBoard(studentId, mode)
  const blocks = getBlocks(board.id)
  if (blocks.length === 0) return '白板为空'

  const recent = blocks.slice(-maxBlocks)
  const lines = recent.map(b => {
    const content = JSON.parse(b.content || '{}')
    const summary = typeof content.text === 'string' ? content.text.slice(0, 80)
      : content.question ? `题目: ${content.question.slice(0, 80)}`
      : content.src ? '[图片]'
      : `[${b.block_type}]`
    return `[${b.block_type}]${b.created_by === 'ai' ? '(AI)' : ''} ${summary}`
  })

  return `白板共${blocks.length}个块，最近${recent.length}个:\n${lines.join('\n')}`
}

// ── 事件日志 ──────────────────────────────────────

function logBoardEvent(boardId: string, eventType: string, blockId: string | null, data: Record<string, any>, actor: string): void {
  const db = getDB()
  db.prepare(
    'INSERT INTO BoardEvent (board_id, event_type, block_id, event_data, actor, create_time) VALUES (?,?,?,?,?,?)'
  ).run(boardId, eventType, blockId, JSON.stringify(data), actor, Date.now())
}
