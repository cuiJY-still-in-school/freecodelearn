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
    CREATE TABLE IF NOT EXISTS AgentSchedule (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      trigger_at INTEGER NOT NULL,
      target TEXT NOT NULL DEFAULT 'student',
      message TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      fired_at INTEGER,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS RedeemCode (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      used_by TEXT,
      used_at INTEGER,
      expires_at INTEGER,
      note TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
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

  // Todo 智能待办 — 1.4新增
  db.exec(`
    CREATE TABLE IF NOT EXISTS Todo (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'pending',
      due_date INTEGER,
      recurrence TEXT,
      agent_created INTEGER NOT NULL DEFAULT 0,
      related_kp_id TEXT,
      reminded_at INTEGER,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    )
  `)

  // Relay 图片转发 — 1.4新增
  db.exec(`
    CREATE TABLE IF NOT EXISTS Relay (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      from_role TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
      data TEXT NOT NULL,
      caption TEXT,
      status TEXT NOT NULL DEFAULT 'unread',
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    )
  `)

  // AgentThought 后台思考记录 — 1.4新增
  db.exec(`
    CREATE TABLE IF NOT EXISTS AgentThought (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      triggered_by TEXT NOT NULL DEFAULT 'heartbeat',
      summary TEXT NOT NULL,
      actions_taken TEXT,
      next_focus TEXT,
      urgency TEXT NOT NULL DEFAULT 'normal',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    )
  `)

  // OtpCode 邮件验证码
  db.exec(`
    CREATE TABLE IF NOT EXISTS OtpCode (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_otp_email ON OtpCode(email)`)
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
    CREATE INDEX IF NOT EXISTS idx_todo_student ON Todo(student_id) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_todo_status ON Todo(status) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_todo_due_date ON Todo(due_date) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_agent_thought_student ON AgentThought(student_id);
    CREATE INDEX IF NOT EXISTS idx_relay_student ON Relay(student_id);
    CREATE INDEX IF NOT EXISTS idx_relay_status ON Relay(status);
    CREATE INDEX IF NOT EXISTS idx_relay_pending ON Relay(student_id, from_role, status);
    CREATE INDEX IF NOT EXISTS idx_knowledge_srs ON KnowledgePoint(student_id, srs_due_at) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_todo_student_status ON Todo(student_id, status, delete_flag);
    CREATE INDEX IF NOT EXISTS idx_agent_log_time ON AgentLog(student_id, create_time) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_settings_key ON Settings(key, delete_flag);
    CREATE INDEX IF NOT EXISTS idx_learning_record_time ON LearningRecord(student_id, create_time) WHERE delete_flag = 0;
    CREATE INDEX IF NOT EXISTS idx_user_guardian ON User(guardian_id) WHERE delete_flag = 0;
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
    ['KnowledgePoint', 'root_cause',        'TEXT'],
    ['KnowledgePoint', 'explanation_log',   'TEXT'],
    ['KnowledgePoint', 'prerequisites',     'TEXT'],
    ['User',           'password_hash',     'TEXT'],
    ['User',           'has_set_password',  'INTEGER DEFAULT 0'],
    ['User',           'email',             'TEXT'],
    ['User',           'invite_code',       'TEXT'],
    ['Todo',           'must_do',           'INTEGER DEFAULT 0'],
    ['KnowledgePoint', 'srs_interval',      'INTEGER DEFAULT 1'],
    ['KnowledgePoint', 'srs_ease',          'REAL DEFAULT 2.5'],
    ['KnowledgePoint', 'srs_reps',          'INTEGER DEFAULT 0'],
    ['KnowledgePoint', 'srs_due_at',        'INTEGER'],
    ['User',           'sub_expires_at',    'INTEGER'],
  ]
  for (const [table, col, def] of cols) {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`) } catch { /* already exists */ }
  }

  // ClientActivity 行为记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS ClientActivity (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      app_name TEXT NOT NULL,
      window_title TEXT,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      recorded_at INTEGER NOT NULL,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_client_activity_student ON ClientActivity(student_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_client_activity_time ON ClientActivity(recorded_at)`)

  // 成绩记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS ExamScore (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      exam_name TEXT NOT NULL,
      score REAL NOT NULL,
      full_score REAL NOT NULL DEFAULT 100,
      exam_date INTEGER NOT NULL,
      create_time INTEGER NOT NULL,
      update_time INTEGER NOT NULL,
      delete_flag INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_exam_score_student ON ExamScore(student_id, delete_flag)`)

  db.exec(`
    CREATE TABLE IF NOT EXISTS DriveFile (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      rel_path TEXT NOT NULL,
      name TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      mime TEXT,
      checksum TEXT,
      sync_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      modify_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      pending_content TEXT,
      delete_flag INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_drive_student ON DriveFile(student_id, delete_flag)`)
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_drive_path ON DriveFile(student_id, rel_path) WHERE delete_flag = 0`)

  db.exec(`
    CREATE TABLE IF NOT EXISTS ChatHistory (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'ai')),
      content TEXT NOT NULL,
      thinking TEXT,
      msg_time TEXT,
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_history_user ON ChatHistory(user_id, delete_flag, create_time)`)

  db.exec(`
    CREATE TABLE IF NOT EXISTS StudentBlackRoom (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      entered_at INTEGER NOT NULL,
      exited_at INTEGER,
      exit_condition TEXT,
      triggered_by TEXT NOT NULL DEFAULT 'auto',
      delete_flag INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_blackroom_student ON StudentBlackRoom(student_id, exited_at, delete_flag)`)

  // 错题本（MistakeBook）
  db.exec(`
    CREATE TABLE IF NOT EXISTS MistakeBook (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      kp_id TEXT,
      question TEXT,
      student_answer TEXT,
      correct_answer TEXT,
      error_type TEXT,
      root_cause TEXT,
      reviewed INTEGER NOT NULL DEFAULT 0,
      review_count INTEGER NOT NULL DEFAULT 0,
      last_review_at INTEGER,
      source TEXT NOT NULL DEFAULT 'agent_observed',
      create_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      update_time INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000),
      delete_flag INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mistake_student ON MistakeBook(student_id, delete_flag)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mistake_topic ON MistakeBook(student_id, subject, reviewed, delete_flag)`)

  // KnowledgePoint 去重 + UNIQUE 约束（防止同一学生同科目同主题出现多行）
  // 先删除重复行，保留 confidence 最高的那条（同分取最新 update_time，再同取 id 字典序最大）
  db.exec(`
    DELETE FROM KnowledgePoint
    WHERE id IN (
      SELECT kp.id FROM KnowledgePoint kp
      WHERE kp.delete_flag = 0
        AND EXISTS (
          SELECT 1 FROM KnowledgePoint kp2
          WHERE kp2.student_id = kp.student_id
            AND kp2.topic      = kp.topic
            AND kp2.subject    = kp.subject
            AND kp2.delete_flag = 0
            AND kp2.id != kp.id
            AND (
              kp2.confidence > kp.confidence
              OR (kp2.confidence = kp.confidence AND kp2.update_time > kp.update_time)
              OR (kp2.confidence = kp.confidence AND kp2.update_time = kp.update_time AND kp2.id > kp.id)
            )
        )
    )
  `)
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_kp_unique ON KnowledgePoint(student_id, topic, subject) WHERE delete_flag = 0`)
  } catch { /* 索引已存在或仍有重复时忽略，不影响启动 */ }

  // 为现有学生账号补全 invite_code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const students = db.prepare(
    "SELECT id FROM User WHERE role = 'student' AND invite_code IS NULL AND delete_flag = 0"
  ).all() as Array<{ id: string }>
  for (const s of students) {
    let code: string
    do {
      code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    } while (db.prepare('SELECT id FROM User WHERE invite_code = ?').get(code))
    db.prepare('UPDATE User SET invite_code = ? WHERE id = ?').run(code, s.id)
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    console.log('[DB] Closed')
  }
}
