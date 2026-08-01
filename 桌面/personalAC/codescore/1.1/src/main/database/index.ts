import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import log from 'electron-log'

let db: Database.Database

export function getDB(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'personalac.db')

  log.info(`Initializing database at: ${dbPath}`)

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')

  createTables()
  createIndexes()

  log.info('Database initialized successfully')
}

function createTables(): void {
  // User table — role only allows student / guardian (plus admin for first guardian)
  db.exec(`
    CREATE TABLE IF NOT EXISTS User (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'guardian', 'student')),
      login_fail_count INTEGER DEFAULT 0,
      locked_until INTEGER,
      create_user TEXT,
      update_user TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    )
  `)

  // GuardianStudentBinding table
  db.exec(`
    CREATE TABLE IF NOT EXISTS GuardianStudentBinding (
      id TEXT PRIMARY KEY,
      guardian_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      create_user TEXT,
      update_user TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (guardian_id) REFERENCES User(id),
      FOREIGN KEY (student_id) REFERENCES User(id)
    )
  `)

  // Session table
  db.exec(`
    CREATE TABLE IF NOT EXISTS Session (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at INTEGER NOT NULL,
      create_user TEXT,
      update_user TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES User(id)
    )
  `)

  // Plan table (learning direction)
  db.exec(`
    CREATE TABLE IF NOT EXISTS Plan (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      subjects TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
      create_user TEXT,
      update_user TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (student_id) REFERENCES User(id)
    )
  `)

  // Resource table — replaced teacher_id with source_email
  db.exec(`
    CREATE TABLE IF NOT EXISTS Resource (
      id TEXT PRIMARY KEY,
      uploader_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      subject TEXT,
      source_email VARCHAR(200),
      parsed_text TEXT,
      create_user TEXT,
      update_user TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (uploader_id) REFERENCES User(id)
    )
  `)

  // LearningRecord table
  db.exec(`
    CREATE TABLE IF NOT EXISTS LearningRecord (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      score INTEGER,
      duration_minutes INTEGER DEFAULT 0,
      note TEXT,
      record_date INTEGER NOT NULL,
      create_user TEXT,
      update_user TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (student_id) REFERENCES User(id)
    )
  `)

  // KnowledgePoint table
  db.exec(`
    CREATE TABLE IF NOT EXISTS KnowledgePoint (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      weakness_score REAL NOT NULL DEFAULT 0.5,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_practiced INTEGER,
      create_user TEXT,
      update_user TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (student_id) REFERENCES User(id)
    )
  `)

  // AgentLog table
  db.exec(`
    CREATE TABLE IF NOT EXISTS AgentLog (
      id TEXT PRIMARY KEY,
      student_id TEXT,
      action_type TEXT NOT NULL,
      action_detail TEXT,
      trigger_type TEXT NOT NULL,
      model_used TEXT,
      status TEXT NOT NULL DEFAULT 'success' CHECK(status IN ('success', 'failed', 'pending')),
      error_message TEXT,
      create_user TEXT,
      update_user TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    )
  `)

  // ScheduleConfig table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ScheduleConfig (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      description TEXT,
      last_run INTEGER,
      next_run INTEGER,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'deleted')),
      create_user TEXT,
      update_user TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (student_id) REFERENCES User(id)
    )
  `)

  // BotConfig table
  db.exec(`
    CREATE TABLE IF NOT EXISTS BotConfig (
      id TEXT PRIMARY KEY,
      bot_type TEXT NOT NULL,
      credential_encrypted TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      installed_by TEXT NOT NULL,
      create_user TEXT,
      update_user TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (installed_by) REFERENCES User(id)
    )
  `)

  // BotUserBinding table
  db.exec(`
    CREATE TABLE IF NOT EXISTS BotUserBinding (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      bot_config_id TEXT NOT NULL,
      platform_user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      create_user TEXT,
      update_user TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES User(id),
      FOREIGN KEY (bot_config_id) REFERENCES BotConfig(id)
    )
  `)

  // MessageLog table
  db.exec(`
    CREATE TABLE IF NOT EXISTS MessageLog (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      bot_config_id TEXT,
      direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
      message_type TEXT NOT NULL DEFAULT 'text',
      content TEXT NOT NULL,
      attachment_path TEXT,
      platform_user_id TEXT,
      status TEXT NOT NULL DEFAULT 'sent' CHECK(status IN ('sent', 'failed', 'pending')),
      create_user TEXT,
      update_user TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    )
  `)

  // Settings table — with two new fields: email_api_config and last_model_json
  db.exec(`
    CREATE TABLE IF NOT EXISTS Settings (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      encrypted INTEGER NOT NULL DEFAULT 0,
      email_api_config TEXT,
      last_model_json TEXT,
      create_user TEXT,
      update_user TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    )
  `)

  // FileIndex table — SQL management of Workspace file index
  db.exec(`
    CREATE TABLE IF NOT EXISTS FileIndex (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      file_name VARCHAR(200),
      file_type VARCHAR(50),
      file_size INTEGER,
      category VARCHAR(50),
      student_id INTEGER,
      source_email VARCHAR(200),
      description TEXT,
      tags TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      last_accessed_at DATETIME,
      create_user TEXT,
      update_user TEXT,
      create_time DATETIME DEFAULT (datetime('now')),
      update_time DATETIME DEFAULT (datetime('now')),
      delete_flag INTEGER DEFAULT 0
    )
  `)
}

function createIndexes(): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_username ON User(username) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_session_token ON Session(token) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_session_user_id ON Session(user_id) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_plan_student_id ON Plan(student_id) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_plan_status ON Plan(status) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_resource_uploader ON Resource(uploader_id) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_resource_subject ON Resource(subject) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_resource_source_email ON Resource(source_email) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_learning_record_student ON LearningRecord(student_id) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_learning_record_date ON LearningRecord(record_date) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_knowledge_point_student ON KnowledgePoint(student_id) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_agent_log_student ON AgentLog(student_id) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_schedule_student ON ScheduleConfig(student_id) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_bot_binding_platform_user ON BotUserBinding(platform_user_id, bot_config_id) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_message_log_user ON MessageLog(user_id) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_guardian_binding ON GuardianStudentBinding(guardian_id, student_id) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_file_index_path ON FileIndex(file_path) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_file_index_category ON FileIndex(category) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_file_index_student ON FileIndex(student_id) WHERE delete_flag = 0;
  `)
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    log.info('Database closed')
  }
}
