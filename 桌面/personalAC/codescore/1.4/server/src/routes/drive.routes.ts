import fs from 'fs'
import path from 'path'
import { Router, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'
import { getDB } from '../database'

const router = Router()
const DRIVE_ROOT = path.join(process.env.DATA_DIR ?? path.join(process.cwd(), 'data'), 'drive')

// ── helpers ───────────────────────────────────────────────────────────────

function driveDir(studentId: string): string {
  return path.join(DRIVE_ROOT, studentId)
}

function absPath(studentId: string, relPath: string): string {
  const base = driveDir(studentId)
  const abs = path.resolve(base, relPath.replace(/^\/+/, ''))
  if (!abs.startsWith(base)) throw new Error('path traversal')
  return abs
}

function guessMime(name: string): string {
  const ext = path.extname(name).toLowerCase()
  const map: Record<string, string> = {
    '.txt': 'text/plain', '.md': 'text/markdown', '.markdown': 'text/markdown',
    '.js': 'text/javascript', '.ts': 'text/typescript', '.py': 'text/x-python',
    '.html': 'text/html', '.css': 'text/css', '.json': 'application/json',
    '.xml': 'text/xml', '.csv': 'text/csv', '.yaml': 'text/yaml', '.yml': 'text/yaml',
    '.sh': 'text/x-sh', '.c': 'text/x-c', '.cpp': 'text/x-c++', '.java': 'text/x-java',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.mp4': 'video/mp4', '.mp3': 'audio/mpeg',
  }
  return map[ext] ?? 'application/octet-stream'
}

function isText(mime: string): boolean {
  return mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml'
}

// resolve student id: guardian can pass ?studentId=, student uses own id
function resolveStudent(req: AuthRequest, res: Response): string | null {
  if (req.userRole === 'guardian') {
    const sid = req.query.studentId as string || req.params.studentId
    if (!sid) { res.status(400).json({ success: false, error: '请指定 studentId' }); return null }
    const db = getDB()
    const ok = db.prepare(
      `SELECT id FROM User WHERE id = ? AND guardian_id = ? AND role = 'student' AND delete_flag = 0`
    ).get(sid, req.userId)
    if (!ok) { res.status(403).json({ success: false, error: '无权访问该学生文件' }); return null }
    return sid
  }
  return req.userId!
}

// ── GET /api/drive/files  list directory ─────────────────────────────────
router.get('/files', requireAuth, (req: AuthRequest, res) => {
  const studentId = resolveStudent(req, res)
  if (!studentId) return

  const dirParam = ((req.query.path as string) || '').replace(/^\/+/, '')
  const db = getDB()

  const rows = db.prepare(
    `SELECT id, rel_path, name, size, mime, modify_time FROM DriveFile
     WHERE student_id = ? AND delete_flag = 0
     ORDER BY rel_path`
  ).all(studentId) as Array<{ id: string; rel_path: string; name: string; size: number; mime: string; modify_time: number }>

  // Build virtual directory tree from flat list
  const prefix = dirParam ? dirParam + '/' : ''
  const dirs = new Set<string>()
  const files: Array<{ id: string; name: string; rel_path: string; size: number; mime: string; modify_time: number; type: 'file' }> = []

  for (const r of rows) {
    if (!r.rel_path.startsWith(prefix)) continue
    const rest = r.rel_path.slice(prefix.length)
    const slash = rest.indexOf('/')
    if (slash === -1) {
      files.push({ ...r, type: 'file' })
    } else {
      dirs.add(rest.slice(0, slash))
    }
  }

  res.json({
    success: true,
    data: {
      path: dirParam,
      dirs: [...dirs].sort().map(d => ({ name: d, rel_path: prefix + d, type: 'dir' })),
      files,
    }
  })
})

// ── GET /api/drive/file/*  read file ─────────────────────────────────────
router.get('/file/*', requireAuth, (req: AuthRequest, res) => {
  const studentId = resolveStudent(req, res)
  if (!studentId) return

  const relPath = (req.params as { '0': string })[0]
  const db = getDB()
  const row = db.prepare(
    `SELECT id, name, mime, size FROM DriveFile WHERE student_id = ? AND rel_path = ? AND delete_flag = 0`
  ).get(studentId, relPath) as { id: string; name: string; mime: string; size: number } | undefined

  if (!row) { res.status(404).json({ success: false, error: '文件不存在' }); return }

  try {
    const abs = absPath(studentId, relPath)
    if (!fs.existsSync(abs)) { res.status(404).json({ success: false, error: '文件内容丢失' }); return }

    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.name)}"`)
    }
    res.setHeader('Content-Type', row.mime || 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-cache')
    fs.createReadStream(abs).pipe(res)
  } catch {
    res.status(400).json({ success: false, error: '非法路径' })
  }
})

// ── PUT /api/drive/file/*  update file content ────────────────────────────
router.put('/file/*', requireAuth, (req: AuthRequest, res) => {
  const studentId = resolveStudent(req, res)
  if (!studentId) return

  const relPath = (req.params as { '0': string })[0]
  const { content } = req.body as { content: string }
  if (content === undefined) { res.status(400).json({ success: false, error: '缺少 content' }); return }

  const db = getDB()
  const row = db.prepare(
    `SELECT id FROM DriveFile WHERE student_id = ? AND rel_path = ? AND delete_flag = 0`
  ).get(studentId, relPath) as { id: string } | undefined

  if (!row) { res.status(404).json({ success: false, error: '文件不存在' }); return }

  try {
    const abs = absPath(studentId, relPath)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, 'utf8')
    const now = Date.now()
    db.prepare(
      `UPDATE DriveFile SET size = ?, modify_time = ?, pending_content = ? WHERE id = ?`
    ).run(Buffer.byteLength(content, 'utf8'), now, content, row.id)
    res.json({ success: true })
  } catch {
    res.status(400).json({ success: false, error: '写入失败' })
  }
})

// ── DELETE /api/drive/file/*  delete file ────────────────────────────────
router.delete('/file/*', requireAuth, (req: AuthRequest, res) => {
  const studentId = resolveStudent(req, res)
  if (!studentId) return

  const relPath = (req.params as { '0': string })[0]
  const db = getDB()
  const row = db.prepare(
    `SELECT id FROM DriveFile WHERE student_id = ? AND rel_path = ? AND delete_flag = 0`
  ).get(studentId, relPath) as { id: string } | undefined

  if (!row) { res.status(404).json({ success: false, error: '文件不存在' }); return }

  db.prepare(`UPDATE DriveFile SET delete_flag = 1, modify_time = ? WHERE id = ?`).run(Date.now(), row.id)
  try {
    const abs = absPath(studentId, relPath)
    if (fs.existsSync(abs)) fs.unlinkSync(abs)
  } catch { /* ignore */ }
  res.json({ success: true })
})

// ── POST /api/drive/mkdir  create folder (virtual) ───────────────────────
router.post('/mkdir', requireAuth, (req: AuthRequest, res) => {
  const studentId = resolveStudent(req, res)
  if (!studentId) return
  // Folders are virtual (derived from file paths), nothing to store
  res.json({ success: true })
})

// ── POST /api/drive/sync  client uploads files ───────────────────────────
// body: { files: [{ rel_path, name, content_b64, mime, modify_time, checksum }] }
router.post('/sync', requireAuth, (req: AuthRequest, res) => {
  if (req.userRole !== 'student') { res.status(403).json({ success: false, error: '仅学生客户端可同步' }); return }
  const studentId = req.userId!
  const { files } = req.body as {
    files: Array<{
      rel_path: string
      name: string
      content_b64: string
      mime?: string
      modify_time: number
      checksum: string
      deleted?: boolean
    }>
  }
  if (!Array.isArray(files)) { res.status(400).json({ success: false, error: '缺少 files' }); return }

  const db = getDB()
  const base = driveDir(studentId)
  fs.mkdirSync(base, { recursive: true })

  const getExisting = db.prepare(
    `SELECT id, modify_time, pending_content FROM DriveFile WHERE student_id = ? AND rel_path = ? AND delete_flag = 0`
  )
  const insertStmt = db.prepare(`
    INSERT INTO DriveFile (id, student_id, rel_path, name, size, mime, checksum, sync_time, modify_time, delete_flag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `)
  const updateStmt = db.prepare(`
    UPDATE DriveFile SET name=?, size=?, mime=?, checksum=?, sync_time=?, modify_time=?, pending_content=NULL
    WHERE student_id=? AND rel_path=? AND delete_flag=0
  `)
  const delStmt = db.prepare(
    `UPDATE DriveFile SET delete_flag = 1, modify_time = ? WHERE student_id = ? AND rel_path = ? AND delete_flag = 0`
  )

  let synced = 0
  const conflicts: string[] = []
  for (const f of files.slice(0, 500)) {
    if (!f.rel_path || !f.name) continue
    if (f.deleted) {
      delStmt.run(Date.now(), studentId, f.rel_path)
      continue
    }
    try {
      const abs = absPath(studentId, f.rel_path)
      fs.mkdirSync(path.dirname(abs), { recursive: true })

      // 冲突检测：服务器有未推送的编辑 → 不接受客户端旧版本
      const existing = getExisting.get(studentId, f.rel_path) as
        { id: string; modify_time: number; pending_content: string | null } | undefined
      if (existing?.pending_content !== null && existing?.pending_content !== undefined) {
        conflicts.push(f.rel_path)
        continue  // 等客户端先 pull 再 push
      }
      const buf = Buffer.from(f.content_b64, 'base64')
      fs.writeFileSync(abs, buf)
      const mime = f.mime || guessMime(f.name)
      const now = Date.now()
      if (existing) {
        updateStmt.run(f.name, buf.length, mime, f.checksum, now, f.modify_time, studentId, f.rel_path)
      } else {
        insertStmt.run(uuidv4(), studentId, f.rel_path, f.name, buf.length, mime, f.checksum, now, f.modify_time)
      }
      synced++
    } catch { /* skip bad paths */ }
  }

  res.json({ success: true, data: { synced, conflicts } })
})

// ── GET /api/drive/sync-pull  client fetches pending edits ───────────────
// Returns files that were edited on server since last pull
router.get('/sync-pull', requireAuth, (req: AuthRequest, res) => {
  if (req.userRole !== 'student') { res.status(403).json({ success: false, error: '仅学生客户端可拉取' }); return }
  const studentId = req.userId!
  const since = parseInt(req.query.since as string || '0')

  const db = getDB()
  const rows = db.prepare(
    `SELECT rel_path, name, pending_content, delete_flag FROM DriveFile
     WHERE student_id = ? AND modify_time > ? AND pending_content IS NOT NULL`
  ).all(studentId, since) as Array<{ rel_path: string; name: string; pending_content: string; delete_flag: number }>

  // Clear pending after delivering
  if (rows.length) {
    db.prepare(
      `UPDATE DriveFile SET pending_content = NULL WHERE student_id = ? AND modify_time > ? AND pending_content IS NOT NULL`
    ).run(studentId, since)
  }

  res.json({
    success: true,
    data: {
      changes: rows.map(r => ({
        rel_path: r.rel_path,
        name: r.name,
        content: r.pending_content,
        deleted: r.delete_flag === 1,
      }))
    }
  })
})

// ── POST /api/drive/upload  browser upload (base64 JSON) ─────────────────
// body: { name, content_b64, path?, mime? }
router.post('/upload', requireAuth, (req: AuthRequest, res) => {
  const studentId = resolveStudent(req, res)
  if (!studentId) return

  const { name, content_b64, path: dirParam, mime: mimeHint } = req.body as {
    name: string; content_b64: string; path?: string; mime?: string
  }
  if (!name || !content_b64) { res.status(400).json({ success: false, error: '缺少 name 或 content_b64' }); return }

  const dirClean = (dirParam || '').replace(/^\/+|\/+$/g, '')
  const fname = name.replace(/[/\\]/g, '_')
  const relPath = dirClean ? `${dirClean}/${fname}` : fname
  const mime = mimeHint || guessMime(fname)
  const base = driveDir(studentId)
  fs.mkdirSync(base, { recursive: true })

  try {
    const abs = absPath(studentId, relPath)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    const buf = Buffer.from(content_b64, 'base64')
    fs.writeFileSync(abs, buf)

    const db = getDB()
    const now = Date.now()
    db.prepare(`
      INSERT INTO DriveFile (id, student_id, rel_path, name, size, mime, sync_time, modify_time, delete_flag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(student_id, rel_path) WHERE delete_flag = 0
      DO UPDATE SET size=excluded.size, mime=excluded.mime, sync_time=excluded.sync_time,
                    modify_time=excluded.modify_time, pending_content=NULL, delete_flag=0
    `).run(uuidv4(), studentId, relPath, fname, buf.length, mime, now, now)

    res.json({ success: true, data: { rel_path: relPath } })
  } catch {
    res.status(400).json({ success: false, error: '上传失败' })
  }
})

export default router
