import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

let db: Database.Database

export function getDB(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

export function initDatabase(): void {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data')
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

  const dbPath = path.join(dataDir, 'personalac.db')
  console.log(`[DB] Initializing at: ${dbPath}`)

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = OFF')
  db.pragma('synchronous = NORMAL')

  createTables()
  createIndexes()
  runMigrations()

  console.log('[DB] Initialized successfully')
}

function createTables(): void {
  // User table — 1.3新增，支持登录和多端同步
  db.exec(`
    CREATE TABLE IF NOT EXISTS User (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      sync_token TEXT UNIQUE NOT NULL,
      display_name TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS Plan (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL DEFAULT 'superadmin',
      title TEXT NOT NULL,
      description TEXT,
      subjects TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
      create_user TEXT,
      update_user TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS Resource (
      id TEXT PRIMARY KEY,
      uploader_id TEXT NOT NULL DEFAULT 'superadmin',
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
      delete_flag INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS LearningRecord (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL DEFAULT 'superadmin',
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
      delete_flag INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS KnowledgePoint (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL DEFAULT 'superadmin',
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      weakness_score REAL NOT NULL DEFAULT 0.5,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_practiced INTEGER,
      create_user TEXT,
      update_user TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS AgentLog (
      id TEXT PRIMARY KEY,
      student_id TEXT DEFAULT 'superadmin',
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS ScheduleConfig (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL DEFAULT 'superadmin',
      cron_expression TEXT NOT NULL,
      description TEXT,
      last_run INTEGER,
      next_run INTEGER,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'deleted')),
      create_user TEXT,
      update_user TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS MessageLog (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT 'superadmin',
      direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
      message_type TEXT NOT NULL DEFAULT 'text',
      content TEXT NOT NULL,
      attachment_path TEXT,
      status TEXT NOT NULL DEFAULT 'sent' CHECK(status IN ('sent', 'failed', 'pending')),
      create_user TEXT,
      update_user TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS Settings (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      encrypted INTEGER NOT NULL DEFAULT 0,
      create_user TEXT,
      update_user TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS FileIndex (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      file_name VARCHAR(200),
      file_type VARCHAR(50),
      file_size INTEGER,
      category VARCHAR(50),
      student_id TEXT DEFAULT 'superadmin',
      source_email VARCHAR(200),
      description TEXT,
      tags TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER DEFAULT 0
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS AgentTask (
      id TEXT PRIMARY KEY,
      task_type VARCHAR(50) NOT NULL,
      student_id TEXT DEFAULT 'superadmin',
      status VARCHAR(20) DEFAULT 'pending',
      trigger_type VARCHAR(30),
      input_summary TEXT,
      output TEXT,
      error TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER DEFAULT 0
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS StudentGoal (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      exam_type TEXT,
      exam_date INTEGER,
      school_progress TEXT,
      guardian_notes TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS SobrietySnapshot (
      student_id TEXT PRIMARY KEY,
      snapshot TEXT NOT NULL,
      generated_at INTEGER NOT NULL,
      notified_at INTEGER,
      last_urgency TEXT
    )
  `)

  // FTS5 全文索引 — 1.3新增
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS ResourceFTS USING fts5(
      resource_id UNINDEXED,
      file_name,
      subject,
      parsed_text,
      content=Resource,
      content_rowid=rowid
    )
  `)
}

function createIndexes(): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_sync_token ON User(sync_token) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_plan_student_id ON Plan(student_id) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_resource_uploader ON Resource(uploader_id) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_resource_subject ON Resource(subject) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_learning_record_student ON LearningRecord(student_id) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_knowledge_point_student ON KnowledgePoint(student_id) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_agent_log_student ON AgentLog(student_id) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_agent_task_student ON AgentTask(student_id) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_agent_task_status ON AgentTask(status) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_file_index_student ON FileIndex(student_id) WHERE delete_flag = 0;
  `)
}

function runMigrations(): void {
  const cols: [string, string, string][] = [
    ['KnowledgePoint', 'confidence',   'REAL DEFAULT 0.5'],
    ['KnowledgePoint', 'data_source',  "TEXT DEFAULT 'agent_observed'"],
    ['KnowledgePoint', 'error_types',  'TEXT'],
    ['KnowledgePoint', 'stability',    'REAL DEFAULT 1.0'],
    ['User',           'role',             "TEXT DEFAULT 'guardian'"],
    ['User',           'student_name',     'TEXT'],
    ['User',           'student_grade',    'TEXT'],
    ['User',           'guardian_id',      'TEXT'],
    ['KnowledgePoint', 'root_cause',       'TEXT'],
    ['KnowledgePoint', 'explanation_log',  'TEXT'],
    ['KnowledgePoint', 'prerequisites',    'TEXT'],
  ]
  for (const [table, col, def] of cols) {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`) } catch { /* already exists */ }
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    console.log('[DB] Closed')
  }
}
