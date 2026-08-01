import fs from 'fs'
import path from 'path'

function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data')
}

function getDbPath(): string {
  return path.join(getDataDir(), 'personalac.db')
}

function getBackupDir(): string {
  return path.join(getDataDir(), 'backups')
}

export interface BackupInfo {
  filename: string
  size: number
  createdAt: number
}

export function performBackup(): { success: boolean; filename?: string; error?: string } {
  try {
    const dbPath = getDbPath()
    if (!fs.existsSync(dbPath)) {
      return { success: false, error: '数据库文件不存在' }
    }

    const backupDir = getBackupDir()
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })

    const date = new Date()
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const filename = `personalac-${dateStr}.db`
    const destPath = path.join(backupDir, filename)

    fs.copyFileSync(dbPath, destPath)

    // Keep last 7 backups
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('personalac-') && f.endsWith('.db'))
      .sort()
    if (files.length > 7) {
      files.slice(0, files.length - 7).forEach(f => {
        try { fs.unlinkSync(path.join(backupDir, f)) } catch { /* ignore */ }
      })
    }

    console.log(`[Backup] Created: ${filename}`)
    return { success: true, filename }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function listBackups(): BackupInfo[] {
  try {
    const backupDir = getBackupDir()
    if (!fs.existsSync(backupDir)) return []
    return fs.readdirSync(backupDir)
      .filter(f => f.startsWith('personalac-') && f.endsWith('.db'))
      .sort()
      .reverse()
      .map(filename => {
        const stat = fs.statSync(path.join(backupDir, filename))
        return { filename, size: stat.size, createdAt: stat.mtimeMs }
      })
  } catch {
    return []
  }
}

export function getBackupPath(filename: string): string | null {
  // Prevent path traversal
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) return null
  if (!filename.startsWith('personalac-') || !filename.endsWith('.db')) return null
  const p = path.join(getBackupDir(), filename)
  return fs.existsSync(p) ? p : null
}
