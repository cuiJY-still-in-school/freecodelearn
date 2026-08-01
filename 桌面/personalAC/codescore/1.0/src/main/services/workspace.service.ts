import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import log from 'electron-log'

function getWorkspaceRoot(): string {
  return path.join(app.getPath('userData'), 'workspace')
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function resolveSafePath(subDir: string, fileName?: string): string {
  const root = getWorkspaceRoot()
  const base = path.resolve(root, subDir)
  // Prevent path traversal
  if (!base.startsWith(root)) {
    throw new Error('非法路径：禁止访问 Workspace 根目录之外')
  }
  if (fileName) {
    const full = path.resolve(base, fileName)
    if (!full.startsWith(root)) {
      throw new Error('非法路径：禁止访问 Workspace 根目录之外')
    }
    return full
  }
  return base
}

export interface WorkspaceResult {
  success: boolean
  data?: unknown
  error?: string
}

export async function write(
  subDir: string,
  fileName: string,
  content: string | Buffer
): Promise<string> {
  const dirPath = resolveSafePath(subDir)
  ensureDir(dirPath)
  const filePath = path.join(dirPath, fileName)
  if (typeof content === 'string') {
    fs.writeFileSync(filePath, content, 'utf-8')
  } else {
    fs.writeFileSync(filePath, content)
  }
  log.info(`Workspace write: ${filePath}`)
  return filePath
}

export function read(filePath: string): WorkspaceResult {
  try {
    const root = getWorkspaceRoot()
    const resolved = path.resolve(filePath)
    if (!resolved.startsWith(root)) {
      return { success: false, error: '非法路径' }
    }
    if (!fs.existsSync(resolved)) {
      return { success: false, error: '文件不存在' }
    }
    const content = fs.readFileSync(resolved, 'utf-8')
    return { success: true, data: content }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('Workspace read error:', error)
    return { success: false, error }
  }
}

export function list(subDir: string): WorkspaceResult {
  try {
    const dirPath = resolveSafePath(subDir)
    ensureDir(dirPath)
    const files = fs.readdirSync(dirPath).map((name) => {
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
    return { success: true, data: files }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('Workspace list error:', error)
    return { success: false, error }
  }
}

export function deleteFile(filePath: string): WorkspaceResult {
  try {
    const root = getWorkspaceRoot()
    const resolved = path.resolve(filePath)
    if (!resolved.startsWith(root)) {
      return { success: false, error: '非法路径' }
    }
    if (!fs.existsSync(resolved)) {
      return { success: false, error: '文件不存在' }
    }
    fs.unlinkSync(resolved)
    log.info(`Workspace delete: ${resolved}`)
    return { success: true, data: { message: '删除成功' } }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('Workspace delete error:', error)
    return { success: false, error }
  }
}

export function getStats(): WorkspaceResult {
  try {
    const root = getWorkspaceRoot()
    ensureDir(root)

    let totalSize = 0
    let fileCount = 0

    function walkDir(dir: string): void {
      const entries = fs.readdirSync(dir)
      for (const entry of entries) {
        const fullPath = path.join(dir, entry)
        const stats = fs.statSync(fullPath)
        if (stats.isDirectory()) {
          walkDir(fullPath)
        } else {
          totalSize += stats.size
          fileCount++
        }
      }
    }

    walkDir(root)

    return {
      success: true,
      data: {
        totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
        fileCount,
        root
      }
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('Workspace getStats error:', error)
    return { success: false, error }
  }
}

export function cleanupTemp(): WorkspaceResult {
  try {
    const root = getWorkspaceRoot()
    const tempDir = path.join(root, 'temp')

    if (!fs.existsSync(tempDir)) {
      return { success: true, data: { message: 'temp 目录不存在，无需清理', deletedCount: 0 } }
    }

    const now = Date.now()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    let deletedCount = 0

    const entries = fs.readdirSync(tempDir)
    for (const entry of entries) {
      const fullPath = path.join(tempDir, entry)
      const stats = fs.statSync(fullPath)
      if (!stats.isDirectory() && now - stats.mtimeMs > sevenDaysMs) {
        fs.unlinkSync(fullPath)
        deletedCount++
        log.info(`Cleaned up temp file: ${fullPath}`)
      }
    }

    return { success: true, data: { message: '清理完成', deletedCount } }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    log.error('Workspace cleanupTemp error:', error)
    return { success: false, error }
  }
}
