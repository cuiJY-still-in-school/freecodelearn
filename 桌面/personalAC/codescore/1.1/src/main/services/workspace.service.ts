import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDB } from '../database'
import log from 'electron-log'

const MAX_STORAGE_BYTES = 10 * 1024 * 1024 * 1024 // 10 GB

export interface FileInfo {
  name: string
  path: string
  size: number
  isDirectory: boolean
  mtime: number
}

export interface WorkspaceResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface RegisterFileParams {
  relativePath: string
  fileName: string
  fileType: string
  fileSize: number
  category: string
  studentId?: number
  sourceEmail?: string
  description?: string
  tags?: string[]
}

class WorkspaceService {
  private workspaceRoot: string

  constructor() {
    this.workspaceRoot = path.join(app.getPath('userData'), 'workspace')
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
  }

  private resolveSafe(relativePath: string): string {
    const full = path.resolve(this.workspaceRoot, relativePath)
    if (!full.startsWith(this.workspaceRoot)) {
      throw new Error('非法路径：禁止访问 Workspace 根目录之外')
    }
    return full
  }

  private walkDir(dir: string): number {
    let total = 0
    if (!fs.existsSync(dir)) return 0
    const entries = fs.readdirSync(dir)
    for (const entry of entries) {
      const full = path.join(dir, entry)
      const stats = fs.statSync(full)
      if (stats.isDirectory()) {
        total += this.walkDir(full)
      } else {
        total += stats.size
      }
    }
    return total
  }

  // -------------------------------------------------------------------------
  // getEffectiveLimit — min(10GB, available disk space)
  // -------------------------------------------------------------------------

  async getEffectiveLimit(): Promise<number> {
    try {
      this.ensureDir(this.workspaceRoot)
      // Use statvfs via statfs (Node 18+)
      const statfs: { bfree: bigint; bsize: bigint } = await new Promise((resolve, reject) => {
        fs.statfs(this.workspaceRoot, (err, stats) => {
          if (err) reject(err)
          else resolve(stats as unknown as { bfree: bigint; bsize: bigint })
        })
      })
      const availableBytes = Number(BigInt(statfs.bfree) * BigInt(statfs.bsize))
      return Math.min(MAX_STORAGE_BYTES, availableBytes)
    } catch (err) {
      log.warn('getEffectiveLimit: statfs failed, returning MAX_STORAGE_BYTES:', err)
      return MAX_STORAGE_BYTES
    }
  }

  // -------------------------------------------------------------------------
  // getUsage — current workspace disk usage
  // -------------------------------------------------------------------------

  async getUsage(): Promise<number> {
    this.ensureDir(this.workspaceRoot)
    return this.walkDir(this.workspaceRoot)
  }

  // -------------------------------------------------------------------------
  // hasSpace — checks if writing size bytes is within limit
  // -------------------------------------------------------------------------

  async hasSpace(size: number): Promise<boolean> {
    const [usage, limit] = await Promise.all([this.getUsage(), this.getEffectiveLimit()])
    return usage + size <= limit
  }

  // -------------------------------------------------------------------------
  // write — AI self-directed write (space check + optional cleanup trigger)
  // -------------------------------------------------------------------------

  async write(
    relativePath: string,
    content: Buffer | string
  ): Promise<{ success: boolean; absolutePath?: string; error?: string }> {
    try {
      const size = typeof content === 'string' ? Buffer.byteLength(content, 'utf-8') : content.length

      if (!(await this.hasSpace(size))) {
        // Trigger agent cleanup event
        try {
          const { getAgentEngine } = require('../agent')
          const engine = getAgentEngine()
          if (engine) {
            engine.handleEvent({ type: 'workspace_full', requiredBytes: size })
          }
        } catch {
          // agent not ready
        }
        return { success: false, error: 'Workspace 空间不足，已触发清理' }
      }

      const absolutePath = this.resolveSafe(relativePath)
      this.ensureDir(path.dirname(absolutePath))

      if (typeof content === 'string') {
        fs.writeFileSync(absolutePath, content, 'utf-8')
      } else {
        fs.writeFileSync(absolutePath, content)
      }

      log.info(`Workspace write: ${absolutePath}`)
      return { success: true, absolutePath }
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err)
      log.error('Workspace write error:', error)
      return { success: false, error }
    }
  }

  // -------------------------------------------------------------------------
  // read
  // -------------------------------------------------------------------------

  async read(
    relativePath: string
  ): Promise<{ success: boolean; content?: Buffer; error?: string }> {
    try {
      const absolutePath = this.resolveSafe(relativePath)
      if (!fs.existsSync(absolutePath)) {
        return { success: false, error: '文件不存在' }
      }

      // Update last_accessed_at in FileIndex
      try {
        const db = getDB()
        db.prepare(
          'UPDATE FileIndex SET last_accessed_at = ? WHERE file_path = ? AND delete_flag = 0'
        ).run(new Date().toISOString(), absolutePath)
      } catch {
        // ignore index update error
      }

      const content = fs.readFileSync(absolutePath)
      return { success: true, content }
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err)
      log.error('Workspace read error:', error)
      return { success: false, error }
    }
  }

  // -------------------------------------------------------------------------
  // list — directory listing
  // -------------------------------------------------------------------------

  async list(
    relativePath: string
  ): Promise<{ success: boolean; files?: FileInfo[]; error?: string }> {
    try {
      const dirPath = this.resolveSafe(relativePath)
      this.ensureDir(dirPath)

      const files: FileInfo[] = fs.readdirSync(dirPath).map((name) => {
        const fullPath = path.join(dirPath, name)
        const stats = fs.statSync(fullPath)
        return {
          name,
          path: fullPath,
          size: stats.size,
          isDirectory: stats.isDirectory(),
          mtime: stats.mtimeMs
        }
      })

      return { success: true, files }
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err)
      log.error('Workspace list error:', error)
      return { success: false, error }
    }
  }

  // -------------------------------------------------------------------------
  // delete — remove file and mark FileIndex
  // -------------------------------------------------------------------------

  async delete(
    relativePath: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const absolutePath = this.resolveSafe(relativePath)
      if (!fs.existsSync(absolutePath)) {
        return { success: false, error: '文件不存在' }
      }

      fs.unlinkSync(absolutePath)
      log.info(`Workspace delete: ${absolutePath}`)

      // Mark as deleted in FileIndex
      try {
        const db = getDB()
        const now = new Date().toISOString()
        db.prepare(
          'UPDATE FileIndex SET delete_flag = 1, update_time = ? WHERE file_path = ?'
        ).run(now, absolutePath)
      } catch {
        // ignore index update error
      }

      return { success: true }
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err)
      log.error('Workspace delete error:', error)
      return { success: false, error }
    }
  }

  // -------------------------------------------------------------------------
  // getStats
  // -------------------------------------------------------------------------

  async getStats(): Promise<{
    usage: number
    limit: number
    usagePercent: number
    path: string
  }> {
    this.ensureDir(this.workspaceRoot)
    const [usage, limit] = await Promise.all([this.getUsage(), this.getEffectiveLimit()])
    const usagePercent = limit > 0 ? Math.round((usage / limit) * 100) : 0
    return { usage, limit, usagePercent, path: this.workspaceRoot }
  }

  // -------------------------------------------------------------------------
  // cleanupTemp — delete temp files older than 7 days
  // -------------------------------------------------------------------------

  async cleanupTemp(): Promise<{ deleted: number; freedBytes: number }> {
    const tempDir = path.join(this.workspaceRoot, 'temp')
    if (!fs.existsSync(tempDir)) {
      return { deleted: 0, freedBytes: 0 }
    }

    const now = Date.now()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    let deleted = 0
    let freedBytes = 0

    try {
      const entries = fs.readdirSync(tempDir)
      for (const entry of entries) {
        const fullPath = path.join(tempDir, entry)
        const stats = fs.statSync(fullPath)
        if (!stats.isDirectory() && now - stats.mtimeMs > sevenDaysMs) {
          freedBytes += stats.size
          fs.unlinkSync(fullPath)
          deleted++
          log.info(`Cleaned up temp file: ${fullPath}`)

          // Update FileIndex
          try {
            const db = getDB()
            db.prepare(
              'UPDATE FileIndex SET delete_flag = 1, update_time = ? WHERE file_path = ?'
            ).run(new Date().toISOString(), fullPath)
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      log.error('cleanupTemp error:', err)
    }

    return { deleted, freedBytes }
  }

  // -------------------------------------------------------------------------
  // registerFile — register a file in FileIndex after writing
  // -------------------------------------------------------------------------

  async registerFile(params: RegisterFileParams): Promise<void> {
    try {
      const absolutePath = this.resolveSafe(params.relativePath)
      const db = getDB()
      const now = new Date().toISOString()

      db.prepare(`
        INSERT INTO FileIndex
          (file_path, file_name, file_type, file_size, category, student_id, source_email, description, tags, created_at, create_time, update_time, delete_flag)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(
        absolutePath,
        params.fileName,
        params.fileType,
        params.fileSize,
        params.category,
        params.studentId || null,
        params.sourceEmail || null,
        params.description || null,
        params.tags ? JSON.stringify(params.tags) : null,
        now,
        now,
        now
      )
    } catch (err) {
      log.error('registerFile error:', err)
    }
  }
}

export const workspaceService = new WorkspaceService()

// Legacy function exports for backward compatibility used by resource.service
export async function write(
  subDir: string,
  fileName: string,
  content: string | Buffer
): Promise<string> {
  const relativePath = `${subDir}/${fileName}`
  const result = await workspaceService.write(relativePath, content)
  if (!result.success || !result.absolutePath) {
    throw new Error(result.error || 'Workspace write failed')
  }
  return result.absolutePath
}
