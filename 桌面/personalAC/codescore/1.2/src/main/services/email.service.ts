import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDB } from '../database'
import { getRawEmailConfig } from './settings.service'
import log from 'electron-log'

interface EmailServiceStatus {
  polling: boolean
  lastCheck: Date | null
  error: string | null
}

class EmailService {
  private polling: boolean = false
  private intervalId: ReturnType<typeof setInterval> | null = null
  private lastCheck: Date | null = null
  private lastError: string | null = null

  // -------------------------------------------------------------------------
  // init — read config and verify connectivity (called once on startup)
  // -------------------------------------------------------------------------

  async init(): Promise<void> {
    const config = getRawEmailConfig()
    if (!config) {
      log.info('EmailService: no config found, skipping init')
      return
    }
    log.info(`EmailService initialized for ${config.email}`)
  }

  // -------------------------------------------------------------------------
  // startPolling — check every 5 minutes
  // -------------------------------------------------------------------------

  startPolling(): void {
    if (this.polling) {
      log.info('EmailService: already polling')
      return
    }
    this.polling = true
    log.info('EmailService: starting polling (every 5 minutes)')

    // Run immediately
    this.checkNewEmails().catch((err) => {
      log.error('EmailService: initial check failed:', err)
    })

    this.intervalId = setInterval(() => {
      this.checkNewEmails().catch((err) => {
        log.error('EmailService: scheduled check failed:', err)
      })
    }, 5 * 60 * 1000)
  }

  // -------------------------------------------------------------------------
  // stopPolling
  // -------------------------------------------------------------------------

  stopPolling(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.polling = false
    log.info('EmailService: polling stopped')
  }

  // -------------------------------------------------------------------------
  // checkNewEmails — connect via IMAP, fetch unread, save attachments
  // -------------------------------------------------------------------------

  async checkNewEmails(): Promise<void> {
    const config = getRawEmailConfig()
    if (!config) {
      this.lastError = '邮件未配置'
      return
    }

    let client: import('imapflow').ImapFlow | null = null

    try {
      const { ImapFlow } = await import('imapflow')

      client = new ImapFlow({
        host: config.imapHost,
        port: config.imapPort,
        secure: config.imapPort === 993,
        auth: { user: config.email, pass: config.authCode },
        logger: false
      })

      await client.connect()
      log.info('EmailService: connected to IMAP')

      const lock = await client.getMailboxLock('INBOX')

      try {
        // Search for unseen messages
        const seenUids: number[] = []

        for await (const message of client.fetch('1:*', {
          flags: true,
          envelope: true,
          bodyStructure: true,
          source: true
        })) {
          // Only process unseen
          if (message.flags.has('\\Seen')) continue

          const uid = message.uid
          const envelope = message.envelope

          const senderEmail =
            envelope.from?.[0]?.address || envelope.sender?.[0]?.address || 'unknown'
          const subject = envelope.subject || '(无主题)'

          log.info(`EmailService: processing message uid=${uid} from=${senderEmail} subject=${subject}`)

          // Parse body and attachments from source
          const source = message.source
          if (source) {
            await this.processEmailSource(source, senderEmail, subject)
          }

          seenUids.push(uid)
        }

        // Mark processed emails as read
        if (seenUids.length > 0) {
          for (const uid of seenUids) {
            await client.messageFlagsAdd({ uid }, ['\\Seen'])
          }
          log.info(`EmailService: marked ${seenUids.length} emails as read`)
        }
      } finally {
        lock.release()
      }

      await client.logout()
      this.lastCheck = new Date()
      this.lastError = null
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err)
      this.lastError = error
      log.error('EmailService: checkNewEmails error:', error)

      try {
        await client?.logout()
      } catch {
        // ignore logout error
      }
    }
  }

  // -------------------------------------------------------------------------
  // processEmailSource — parse raw email, extract text and attachments
  // -------------------------------------------------------------------------

  private async processEmailSource(
    source: Buffer,
    senderEmail: string,
    subject: string
  ): Promise<void> {
    try {
      // Use mailparser for parsing if available, otherwise do basic text extraction
      let plainText = ''
      const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = []

      try {
        const { simpleParser } = await import('mailparser')
        const parsed = await simpleParser(source)
        plainText = parsed.text || parsed.html?.replace(/<[^>]+>/g, ' ') || ''

        if (parsed.attachments) {
          for (const att of parsed.attachments) {
            if (att.content && att.filename) {
              attachments.push({
                filename: att.filename,
                content: att.content,
                contentType: att.contentType || 'application/octet-stream'
              })
            }
          }
        }
      } catch {
        // mailparser not available, do basic extraction
        plainText = source.toString('utf-8').slice(0, 5000)
      }

      // Save attachments to workspace
      const workspaceRoot = path.join(app.getPath('userData'), 'workspace')
      const uploadDir = path.join(workspaceRoot, 'uploads', 'email')
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true })
      }

      for (const att of attachments) {
        const timestamp = Date.now()
        const safeFilename = att.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
        const savedFilename = `${timestamp}_${safeFilename}`
        const savedPath = path.join(uploadDir, savedFilename)
        const relativePath = `uploads/email/${savedFilename}`

        fs.writeFileSync(savedPath, att.content)
        log.info(`EmailService: saved attachment ${savedFilename}`)

        const ext = path.extname(att.filename).replace('.', '').toLowerCase()

        // Register in FileIndex
        this.registerFileIndex({
          filePath: savedPath,
          fileName: att.filename,
          fileType: ext || 'bin',
          fileSize: att.content.length,
          category: 'uploads',
          sourceEmail: senderEmail,
          description: `来自邮件: ${subject}`
        })

        // Register in Resource table
        this.registerResource({
          filePath: savedPath,
          fileName: att.filename,
          fileType: ext || 'bin',
          fileSize: att.content.length,
          sourceEmail: senderEmail,
          parsedText: plainText.slice(0, 10000)
        })

        // Notify agent
        this.notifyAgent(senderEmail, att.filename, relativePath)
      }

      // If there are no attachments but there is text content, still notify agent
      if (attachments.length === 0 && plainText.trim().length > 0) {
        log.info(`EmailService: email from ${senderEmail} has no attachments, text only`)
      }
    } catch (err) {
      log.error('EmailService: processEmailSource error:', err)
    }
  }

  // -------------------------------------------------------------------------
  // registerFileIndex — writes a record to FileIndex table
  // -------------------------------------------------------------------------

  private registerFileIndex(params: {
    filePath: string
    fileName: string
    fileType: string
    fileSize: number
    category: string
    sourceEmail?: string
    description?: string
    studentId?: number
    tags?: string[]
  }): void {
    try {
      const db = getDB()
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO FileIndex
          (file_path, file_name, file_type, file_size, category, student_id, source_email, description, tags, created_at, create_time, update_time, delete_flag)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(
        params.filePath,
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
      log.error('EmailService: registerFileIndex error:', err)
    }
  }

  // -------------------------------------------------------------------------
  // registerResource — writes a record to Resource table
  // -------------------------------------------------------------------------

  private registerResource(params: {
    filePath: string
    fileName: string
    fileType: string
    fileSize: number
    sourceEmail: string
    parsedText?: string
  }): void {
    try {
      const db = getDB()
      const now = Date.now()

      // Use a system/admin uploader id — find the admin user
      const admin = db
        .prepare("SELECT id FROM User WHERE role = 'admin' AND delete_flag = 0 LIMIT 1")
        .get() as { id: string } | undefined

      if (!admin) {
        log.warn('EmailService: no admin user found, cannot register resource')
        return
      }

      const resourceId = uuidv4()
      db.prepare(`
        INSERT INTO Resource
          (id, uploader_id, file_name, file_path, file_type, file_size, source_email, parsed_text, create_user, update_user, create_time, update_time, delete_flag)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(
        resourceId,
        admin.id,
        params.fileName,
        params.filePath,
        params.fileType,
        params.fileSize,
        params.sourceEmail,
        params.parsedText || null,
        admin.id,
        admin.id,
        now,
        now
      )
    } catch (err) {
      log.error('EmailService: registerResource error:', err)
    }
  }

  // -------------------------------------------------------------------------
  // notifyAgent — triggers agent new_resource event
  // -------------------------------------------------------------------------

  private notifyAgent(senderEmail: string, fileName: string, relativePath: string): void {
    try {
      const { getAgentEngine } = require('../agent')
      const engine = getAgentEngine()
      if (engine) {
        engine.handleEvent({
          type: 'new_resource',
          sourceEmail: senderEmail,
          fileName,
          relativePath
        })
      }
    } catch (err) {
      log.warn('EmailService: failed to notify agent:', err)
    }
  }

  // -------------------------------------------------------------------------
  // getStatus
  // -------------------------------------------------------------------------

  getStatus(): EmailServiceStatus {
    return {
      polling: this.polling,
      lastCheck: this.lastCheck,
      error: this.lastError
    }
  }
}

export const emailService = new EmailService()
