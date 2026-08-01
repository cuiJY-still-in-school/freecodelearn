import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'
import { getDB } from '../database'
import { verifyToken } from './auth.service'
import { write as workspaceWrite } from './workspace.service'
import log from 'electron-log'

export interface Resource {
  id: string
  uploader_id: string
  uploader_name?: string
  file_name: string
  file_path: string
  file_type: string
  file_size: number
  subject?: string
  source_email?: string
  parsed_text?: string
  create_time: number
}

export interface ResourceResult {
  success: boolean
  data?: Resource | Resource[] | { total: number; items: Resource[] } | { message: string }
  error?: string
}

async function parseFileContent(filePath: string, fileType: string): Promise<string> {
  try {
    const lowerType = fileType.toLowerCase()
    if (lowerType === 'txt' || lowerType === 'md') {
      return fs.readFileSync(filePath, 'utf-8').slice(0, 10000)
    }
    if (lowerType === 'pdf') {
      const pdfParse = require('pdf-parse')
      const dataBuffer = fs.readFileSync(filePath)
      const data = await pdfParse(dataBuffer)
      return (data.text as string).slice(0, 10000)
    }
    if (lowerType === 'docx' || lowerType === 'doc') {
      const mammoth = require('mammoth')
      const result = await mammoth.extractRawText({ path: filePath })
      return (result.value as string).slice(0, 10000)
    }
    return ''
  } catch (err) {
    log.warn('Failed to parse file content:', err)
    return ''
  }
}

// ---------------------------------------------------------------------------
// upload — any authenticated user can upload resources (no teacher restriction)
// ---------------------------------------------------------------------------

export async function upload(
  token: string,
  filePath: string,
  fileName: string,
  fileType: string,
  subject?: string,
  sourceEmail?: string
): Promise<ResourceResult> {
  try {
    const db = getDB()
    const now = Date.now()

    const tokenResult = verifyToken(token)
    if (!tokenResult.valid || !tokenResult.user) {
      return { success: false, error: 'Token 无效或已过期' }
    }

    const user = tokenResult.user

    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' }
    }

    const fileStats = fs.statSync(filePath)
    const fileSize = fileStats.size

    // Copy file to workspace
    const fileContent = fs.readFileSync(filePath)
    const storedSubDir = `resources/${subject || 'general'}`
    const storedFileName = `${uuidv4()}_${fileName}`
    const storedPath = await workspaceWrite(storedSubDir, storedFileName, fileContent)

    // Parse content
    const parsedText = await parseFileContent(filePath, fileType)

    const resourceId = uuidv4()

    db.prepare(`
      INSERT INTO Resource (id, uploader_id, file_name, file_path, file_type, file_size, subject, source_email, parsed_text, create_user, update_user, create_time, update_time, delete_flag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      resourceId,
      user.id,
      fileName,
      storedPath,
      fileType,
      fileSize,
      subject || null,
      sourceEmail || null,
      parsedText || null,
      user.id,
      user.id,
      now,
      now
    )

    log.info(`Resource uploaded: ${fileName} by ${user.username}`)

    // Notify agent
    try {
      const { getAgentEngine } = require('../agent')
      const engine = getAgentEngine()
      if (engine) {
        engine.handleEvent({
          type: 'new_resource',
          resourceId,
          subject,
          uploaderId: user.id,
          sourceEmail: sourceEmail || null
        })
      }
    } catch {
      // Agent not ready
    }

    const resource: Resource = {
      id: resourceId,
      uploader_id: user.id,
      file_name: fileName,
      file_path: storedPath,
      file_type: fileType,
      file_size: fileSize,
      subject,
      source_email: sourceEmail,
      parsed_text: parsedText,
      create_time: now
    }

    return { success: true, data: resource }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('Resource upload error:', error)
    return { success: false, error }
  }
}

// ---------------------------------------------------------------------------
// list — list resources with optional filters (no teacher filter)
// ---------------------------------------------------------------------------

export function list(
  token: string,
  subject?: string,
  fileType?: string,
  page: number = 1,
  pageSize: number = 20
): ResourceResult {
  try {
    const db = getDB()

    const tokenResult = verifyToken(token)
    if (!tokenResult.valid || !tokenResult.user) {
      return { success: false, error: 'Token 无效或已过期' }
    }

    const conditions: string[] = ['r.delete_flag = 0']
    const params: (string | number)[] = []

    if (subject) {
      conditions.push('r.subject = ?')
      params.push(subject)
    }

    if (fileType) {
      conditions.push('r.file_type = ?')
      params.push(fileType)
    }

    const whereClause = conditions.join(' AND ')
    const offset = (page - 1) * pageSize

    const total = (
      db.prepare(`SELECT COUNT(*) as cnt FROM Resource r WHERE ${whereClause}`).get(...params) as {
        cnt: number
      }
    ).cnt

    const rows = db
      .prepare(
        `SELECT r.*, u.username as uploader_name
         FROM Resource r
         LEFT JOIN User u ON u.id = r.uploader_id
         WHERE ${whereClause}
         ORDER BY r.create_time DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, offset) as Resource[]

    return { success: true, data: { total, items: rows } }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('Resource list error:', error)
    return { success: false, error }
  }
}

// ---------------------------------------------------------------------------
// deleteResource — uploader or admin can delete
// ---------------------------------------------------------------------------

export function deleteResource(token: string, resourceId: string): ResourceResult {
  try {
    const db = getDB()
    const now = Date.now()

    const tokenResult = verifyToken(token)
    if (!tokenResult.valid || !tokenResult.user) {
      return { success: false, error: 'Token 无效或已过期' }
    }

    const user = tokenResult.user

    const resource = db
      .prepare('SELECT * FROM Resource WHERE id = ? AND delete_flag = 0')
      .get(resourceId) as Resource | undefined

    if (!resource) {
      return { success: false, error: '资源不存在' }
    }

    // Only uploader or admin can delete
    if (resource.uploader_id !== user.id && user.role !== 'admin') {
      return { success: false, error: '无权删除该资源' }
    }

    db.prepare(
      'UPDATE Resource SET delete_flag = 1, update_user = ?, update_time = ? WHERE id = ?'
    ).run(user.id, now, resourceId)

    return { success: true, data: { message: '删除成功' } }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('Resource delete error:', error)
    return { success: false, error }
  }
}
