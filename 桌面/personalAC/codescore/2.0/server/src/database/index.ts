import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

let db: Database.Database

export function getDB(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

export function initDatabase(): void {
  const dataDir = process.env.DATA_DIR || './data'
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

  const dbPath = path.join(dataDir, 'personalac.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON') // 2.0: 开启外键约束

  createTables()
  createIndexes()
  runMigrations()
}

export function closeDatabase(): void {
  if (db) db.close()
}

// ── 建表 (20 张) ──────────────────────────────────

function createTables(): void {
  db.exec(`

    -- 用户
    CREATE TABLE IF NOT EXISTS User (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      sync_token TEXT UNIQUE NOT NULL,
      display_name TEXT,
      role TEXT NOT NULL DEFAULT 'guardian' CHECK(role IN ('guardian','student')),
      student_grade TEXT,
      guardian_id TEXT REFERENCES User(id),
      password_hash TEXT,
      has_set_password INTEGER NOT NULL DEFAULT 0,
      email TEXT,
      invite_code TEXT,
      sub_expires_at INTEGER,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    );

    -- OTP 验证码
    CREATE TABLE IF NOT EXISTS OtpCode (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
    );

    -- 学习计划
    CREATE TABLE IF NOT EXISTS Plan (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES User(id),
      title TEXT NOT NULL,
      description TEXT,
      subjects TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    );

    -- 学习记录
    CREATE TABLE IF NOT EXISTS LearningRecord (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES User(id),
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      score INTEGER,
      duration_minutes INTEGER DEFAULT 0,
      note TEXT,
      board_session_id TEXT,
      record_date INTEGER NOT NULL,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    );

    -- 知识点
    CREATE TABLE IF NOT EXISTS KnowledgePoint (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES User(id),
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      weakness_score REAL NOT NULL DEFAULT 0.5,
      confidence REAL NOT NULL DEFAULT 0.5,
      stability REAL NOT NULL DEFAULT 1.0,
      srs_reps INTEGER DEFAULT 0,
      srs_interval REAL DEFAULT 0,
      srs_ease REAL DEFAULT 2.5,
      srs_due_at INTEGER,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_practiced INTEGER,
      data_source TEXT DEFAULT 'agent_observed',
      error_types TEXT,
      root_cause TEXT,
      explanation_log TEXT,
      prerequisites TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    );

    -- 学生目标
    CREATE TABLE IF NOT EXISTS StudentGoal (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES User(id),
      exam_type TEXT,
      exam_date INTEGER,
      school_progress TEXT,
      guardian_notes TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    );

    -- 清醒快照
    CREATE TABLE IF NOT EXISTS SobrietySnapshot (
      student_id TEXT PRIMARY KEY REFERENCES User(id),
      snapshot TEXT NOT NULL,
      generated_at INTEGER NOT NULL,
      notified_at INTEGER,
      last_urgency TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
    );

    -- Agent 日志
    CREATE TABLE IF NOT EXISTS AgentLog (
      id TEXT PRIMARY KEY,
      student_id TEXT REFERENCES User(id),
      action_type TEXT NOT NULL,
      action_detail TEXT,
      trigger_type TEXT NOT NULL,
      model_used TEXT,
      status TEXT DEFAULT 'success' CHECK(status IN ('success','failed','pending')),
      error_message TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    );

    -- Agent 任务
    CREATE TABLE IF NOT EXISTS AgentTask (
      id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL,
      student_id TEXT REFERENCES User(id),
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','done','failed')),
      trigger_type TEXT,
      input_summary TEXT,
      output TEXT,
      error TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    );

    -- 定时调度
    CREATE TABLE IF NOT EXISTS ScheduleConfig (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES User(id),
      cron_expression TEXT NOT NULL,
      description TEXT,
      last_run INTEGER,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','deleted')),
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    );

    -- 待办
    CREATE TABLE IF NOT EXISTS Todo (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES User(id),
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('high','normal','low')),
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','done','cancelled')),
      due_date INTEGER,
      must_do INTEGER DEFAULT 0,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    );

    -- 设置
    CREATE TABLE IF NOT EXISTS Settings (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      encrypted INTEGER NOT NULL DEFAULT 0,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    );

    -- 资源文件
    CREATE TABLE IF NOT EXISTS Resource (
      id TEXT PRIMARY KEY,
      uploader_id TEXT NOT NULL REFERENCES User(id),
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      subject TEXT,
      parsed_text TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    );

    -- 文件索引
    CREATE TABLE IF NOT EXISTS FileIndex (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      file_name TEXT,
      file_type TEXT,
      file_size INTEGER,
      category TEXT,
      student_id TEXT REFERENCES User(id),
      description TEXT,
      tags TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    );

    -- 消息日志
    CREATE TABLE IF NOT EXISTS MessageLog (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES User(id),
      direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
      content TEXT NOT NULL,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    );

    -- ★ 白板
    CREATE TABLE IF NOT EXISTS Board (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES User(id),
      title TEXT DEFAULT '我的白板',
      mode TEXT NOT NULL DEFAULT 'study' CHECK(mode IN ('study','homework')),
      block_count INTEGER DEFAULT 0,
      last_active_at INTEGER,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    );

    -- ★ 白板 Block
    CREATE TABLE IF NOT EXISTS BoardBlock (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES Board(id),
      block_type TEXT NOT NULL,
      content TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_by TEXT NOT NULL DEFAULT 'student' CHECK(created_by IN ('student','ai')),
      ai_metadata TEXT,
      version INTEGER DEFAULT 1,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    );

    -- ★ 学伴配置
    CREATE TABLE IF NOT EXISTS CompanionConfig (
      student_id TEXT PRIMARY KEY REFERENCES User(id),
      companion_name TEXT DEFAULT '小伴',
      companion_style TEXT DEFAULT 'friendly' CHECK(companion_style IN ('friendly','encouraging','strict')),
      current_state TEXT DEFAULT 'idle' CHECK(current_state IN ('idle','watching','thinking','writing')),
      last_state_change INTEGER,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
    );

    -- ★ 作业
    CREATE TABLE IF NOT EXISTS Homework (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES User(id),
      subject TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','submitted','reviewed')),
      assigned_by TEXT DEFAULT 'ai' CHECK(assigned_by IN ('ai','guardian','student')),
      difficulty TEXT DEFAULT 'medium' CHECK(difficulty IN ('easy','medium','hard')),
      due_date INTEGER,
      score INTEGER,
      review_notes TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    );

    -- ★ 家长指令
    CREATE TABLE IF NOT EXISTS GuardianCommand (
      id TEXT PRIMARY KEY,
      guardian_id TEXT NOT NULL REFERENCES User(id),
      student_id TEXT NOT NULL REFERENCES User(id),
      instruction TEXT NOT NULL,
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('high','normal','low')),
      active INTEGER DEFAULT 1,
      acknowledged INTEGER DEFAULT 0,
      executed_count INTEGER DEFAULT 0,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    );

    -- ★ 白板事件日志
    CREATE TABLE IF NOT EXISTS BoardEvent (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id TEXT NOT NULL REFERENCES Board(id),
      event_type TEXT NOT NULL CHECK(event_type IN ('add_block','update_block','delete_block','reorder','ai_highlight')),
      block_id TEXT,
      event_data TEXT,
      actor TEXT NOT NULL CHECK(actor IN ('student','ai','system')),
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
    );

    -- ★ 聊天消息
    CREATE TABLE IF NOT EXISTS ChatMessage (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES User(id),
      board_id TEXT REFERENCES Board(id),
      role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
      content TEXT NOT NULL,
      source TEXT DEFAULT 'chat' CHECK(source IN ('chat','board_command','guardian')),
      metadata TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
    );

  `)
}

// ── 索引 ──────────────────────────────────────────

function createIndexes(): void {
  const indexes = [
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sync_token ON User(sync_token) WHERE delete_flag=0',
    'CREATE INDEX IF NOT EXISTS idx_board_student ON Board(student_id, mode) WHERE delete_flag=0',
    'CREATE INDEX IF NOT EXISTS idx_board_block_board ON BoardBlock(board_id, position) WHERE delete_flag=0',
    'CREATE INDEX IF NOT EXISTS idx_board_event_board ON BoardEvent(board_id, create_time)',
    'CREATE INDEX IF NOT EXISTS idx_chat_message_student ON ChatMessage(student_id, create_time)',
    'CREATE INDEX IF NOT EXISTS idx_homework_student ON Homework(student_id, status) WHERE delete_flag=0',
    'CREATE INDEX IF NOT EXISTS idx_guardian_command_student ON GuardianCommand(student_id, active) WHERE delete_flag=0',
    'CREATE INDEX IF NOT EXISTS idx_plan_student ON Plan(student_id) WHERE delete_flag=0',
    'CREATE INDEX IF NOT EXISTS idx_learning_record_student ON LearningRecord(student_id) WHERE delete_flag=0',
    'CREATE INDEX IF NOT EXISTS idx_knowledge_point_student ON KnowledgePoint(student_id) WHERE delete_flag=0',
    'CREATE INDEX IF NOT EXISTS idx_agent_log_student ON AgentLog(student_id) WHERE delete_flag=0',
    'CREATE INDEX IF NOT EXISTS idx_agent_task_student ON AgentTask(student_id) WHERE delete_flag=0',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_kp_unique ON KnowledgePoint(student_id, topic, subject) WHERE delete_flag=0',
    'CREATE INDEX IF NOT EXISTS idx_otp_email ON OtpCode(email)',
    'CREATE INDEX IF NOT EXISTS idx_user_email ON User(email) WHERE delete_flag=0',
    'CREATE INDEX IF NOT EXISTS idx_user_guardian ON User(guardian_id) WHERE delete_flag=0',
  ]
  for (const sql of indexes) {
    try { db.exec(sql) } catch (_) { /* ignore duplicate index errors */ }
  }
}

// ── 迁移 (幂等 ADD COLUMN) ─────────────────────────

function runMigrations(): void {
  const migrations: [string, string][] = [
    ['User', 'role'],
    ['User', 'student_grade'],
    ['User', 'guardian_id'],
    ['KnowledgePoint', 'confidence'],
    ['KnowledgePoint', 'stability'],
    ['KnowledgePoint', 'srs_reps'],
    ['KnowledgePoint', 'srs_interval'],
    ['KnowledgePoint', 'srs_ease'],
    ['KnowledgePoint', 'srs_due_at'],
    ['KnowledgePoint', 'data_source'],
    ['KnowledgePoint', 'error_types'],
    ['KnowledgePoint', 'root_cause'],
    ['KnowledgePoint', 'explanation_log'],
    ['KnowledgePoint', 'prerequisites'],
    ['LearningRecord', 'board_session_id'],
    ['User', 'password_hash'],
    ['User', 'has_set_password'],
    ['User', 'email'],
    ['User', 'invite_code'],
    ['User', 'sub_expires_at'],
  ]
  for (const [table, column] of migrations) {
    try {
      const colType = column === 'srs_reps' || column === 'attempt_count' ? 'INTEGER DEFAULT 0'
        : column === 'srs_interval' || column === 'srs_ease' || column === 'confidence' || column === 'stability' || column === 'weakness_score' ? 'REAL DEFAULT 0.5'
        : column === 'srs_due_at' ? 'INTEGER'
        : column === 'board_session_id' ? 'TEXT'
        : 'TEXT'
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${colType}`)
    } catch (_) { /* column exists, skip */ }
  }
}
