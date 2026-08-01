# PersonalAC v1.3 — 数据库结构参考

> 引擎：**SQLite**（`better-sqlite3`），文件位于 `$DATA_DIR/personalac.db`  
> PRAGMA：`journal_mode = WAL`、`synchronous = NORMAL`、`foreign_keys = OFF`  
> 所有时间戳均为 **Unix 毫秒**（`INTEGER`），除非特别说明。

---

## 目录

1. [通用约定](#通用约定)
2. [表结构](#表结构)
   - [User](#user)
   - [Plan](#plan)
   - [Resource](#resource)
   - [LearningRecord](#learningrecord)
   - [KnowledgePoint](#knowledgepoint)
   - [AgentLog](#agentlog)
   - [AgentTask](#agenttask)
   - [ScheduleConfig](#scheduleconfig)
   - [MessageLog](#messagelog)
   - [Settings](#settings)
   - [FileIndex](#fileindex)
   - [StudentGoal](#studentgoal)
   - [SobrietySnapshot](#sobritysnapshot)
   - [ResourceFTS（虚拟表）](#resourcefts虚拟表)
3. [索引](#索引)
4. [表间关系](#表间关系)
5. [迁移机制](#迁移机制)
6. [JSON 列结构详解](#json-列结构详解)

---

## 通用约定

### 软删除（delete_flag）

所有主表都使用软删除模式，而非物理 `DELETE`。

| 值 | 含义 |
|---|---|
| `0` | 正常记录（默认） |
| `1` | 已删除（逻辑删除） |

所有索引均带有 `WHERE delete_flag = 0` 条件过滤，查询时应始终加此过滤。

### 时间戳字段

| 字段名 | 类型 | 含义 |
|---|---|---|
| `create_time` | `INTEGER` | 记录创建时间（Unix ms），默认由 SQLite `strftime` 自动填充 |
| `update_time` | `INTEGER` | 最后更新时间（Unix ms），应用层负责在每次 UPDATE 时更新此字段 |

### 操作人字段

| 字段名 | 类型 | 含义 |
|---|---|---|
| `create_user` | `TEXT` | 创建该记录的用户 ID（可为 null，表示系统自动创建） |
| `update_user` | `TEXT` | 最后修改该记录的用户 ID |

---

## 表结构

---

### User

**描述：** v1.3 新增。系统用户表，支持登录鉴权与多端同步。支持两种角色：家长（`guardian`）与学生（`student`）。家长通过 `guardian_id` 与学生账号形成监护关系。

| 列名 | 类型 | 约束 | 语义说明 |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | 用户唯一标识（UUID） |
| `username` | `TEXT` | `UNIQUE NOT NULL` | 登录用户名，全局唯一 |
| `sync_token` | `TEXT` | `UNIQUE NOT NULL` | 多端同步令牌，用于免密同步鉴权，全局唯一 |
| `display_name` | `TEXT` | — | 显示名称（昵称），可为 null |
| `role` | `TEXT` | 迁移列，DEFAULT `'guardian'` | 账号角色：`'guardian'`（家长/监护人）或 `'student'`（学生）|
| `student_name` | `TEXT` | 迁移列 | 若 `role='guardian'`，此字段存储其绑定学生的姓名；若 `role='student'` 则为本人姓名 |
| `student_grade` | `TEXT` | 迁移列 | 学生所在年级（如 `'高三'`、`'初二'`），可为 null |
| `guardian_id` | `TEXT` | 迁移列，FK → `User.id` | 若 `role='student'`，此字段指向对应监护人的 `User.id`；`foreign_keys = OFF` 故不强制约束 |
| `create_time` | `INTEGER` | `NOT NULL` | 账号创建时间（Unix ms） |
| `update_time` | `INTEGER` | `NOT NULL` | 账号最后更新时间（Unix ms） |
| `delete_flag` | `INTEGER` | `NOT NULL DEFAULT 0` | 软删除标志 |

**注意：** `role`、`student_name`、`student_grade`、`guardian_id` 四列通过 `runMigrations()` 追加，老数据库升级时自动添加。

---

### Plan

**描述：** 学习计划表。一个计划可关联多个学科，记录学生的总体学习目标和安排。

| 列名 | 类型 | 约束 | 语义说明 |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | 计划唯一标识（UUID） |
| `student_id` | `TEXT` | `NOT NULL DEFAULT 'superadmin'` | 所属学生用户 ID，关联 `User.id` |
| `title` | `TEXT` | `NOT NULL` | 计划标题 |
| `description` | `TEXT` | — | 计划详情/备注，可为 null |
| `subjects` | `TEXT` | `NOT NULL` | 涉及学科列表，JSON 编码的字符串数组，如 `["数学","语文","英语"]` |
| `status` | `TEXT` | `DEFAULT 'active'` CHECK `IN ('active','archived')` | 计划状态：`active`（进行中）或 `archived`（已归档） |
| `create_user` | `TEXT` | — | 创建人用户 ID |
| `update_user` | `TEXT` | — | 最后修改人用户 ID |
| `create_time` | `INTEGER` | `NOT NULL` | 创建时间（Unix ms） |
| `update_time` | `INTEGER` | `NOT NULL` | 更新时间（Unix ms） |
| `delete_flag` | `INTEGER` | `NOT NULL DEFAULT 0` | 软删除标志 |

**JSON 列：** `subjects` — `string[]`，学科名称数组。

---

### Resource

**描述：** 上传文件资源表。存储学生或家长上传的学习材料（PDF、图片等），支持 OCR 解析文本后进行全文检索（配合 `ResourceFTS`）。

| 列名 | 类型 | 约束 | 语义说明 |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | 资源唯一标识（UUID） |
| `uploader_id` | `TEXT` | `NOT NULL DEFAULT 'superadmin'` | 上传者用户 ID，关联 `User.id` |
| `file_name` | `TEXT` | `NOT NULL` | 原始文件名（含扩展名） |
| `file_path` | `TEXT` | `NOT NULL` | 服务器存储路径（相对于 `DATA_DIR`） |
| `file_type` | `TEXT` | `NOT NULL` | MIME 类型或文件扩展名（如 `application/pdf`、`image/jpeg`） |
| `file_size` | `INTEGER` | `NOT NULL DEFAULT 0` | 文件大小（字节） |
| `subject` | `TEXT` | — | 文件所属学科（可手动标注，如 `'数学'`），可为 null |
| `source_email` | `VARCHAR(200)` | — | 若文件来源于邮件转发，此字段记录发件人邮箱地址 |
| `parsed_text` | `TEXT` | — | OCR 或文档解析后的纯文本内容，供全文检索使用 |
| `create_user` | `TEXT` | — | 创建人用户 ID |
| `update_user` | `TEXT` | — | 最后修改人用户 ID |
| `create_time` | `INTEGER` | `NOT NULL` | 上传时间（Unix ms） |
| `update_time` | `INTEGER` | `NOT NULL` | 更新时间（Unix ms） |
| `delete_flag` | `INTEGER` | `NOT NULL DEFAULT 0` | 软删除标志 |

---

### LearningRecord

**描述：** 学习行为记录表。每条记录代表一次学习活动（上课、做题、自习等），是 SobrietySnapshot 计算学科分布和活跃度的数据来源。

| 列名 | 类型 | 约束 | 语义说明 |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | 记录唯一标识（UUID） |
| `student_id` | `TEXT` | `NOT NULL DEFAULT 'superadmin'` | 所属学生用户 ID |
| `subject` | `TEXT` | `NOT NULL` | 学科名称（如 `'数学'`、`'英语'`） |
| `topic` | `TEXT` | `NOT NULL` | 具体学习主题/知识点名称 |
| `score` | `INTEGER` | — | 本次练习/测验得分（0–100），可为 null（无评分场景） |
| `duration_minutes` | `INTEGER` | `DEFAULT 0` | 本次学习时长（分钟） |
| `note` | `TEXT` | — | 学习备注（学生/家长填写的文字说明） |
| `record_date` | `INTEGER` | `NOT NULL` | 学习发生的时间（Unix ms），用于时间序列分析 |
| `create_user` | `TEXT` | — | 创建人用户 ID |
| `update_user` | `TEXT` | — | 最后修改人用户 ID |
| `create_time` | `INTEGER` | `NOT NULL` | 记录插入时间（Unix ms） |
| `update_time` | `INTEGER` | `NOT NULL` | 更新时间（Unix ms） |
| `delete_flag` | `INTEGER` | `NOT NULL DEFAULT 0` | 软删除标志 |

**关键用途：**
- `MAX(record_date)` → 计算 `days_since_active`（距上次学习天数）
- 近 14 天 `SUM(duration_minutes) GROUP BY subject` → 计算学科分布漂移

---

### KnowledgePoint

**描述：** 知识点掌握状态表。系统核心表之一，记录每个知识点的遗忘曲线参数、掌握程度、错误模式及讲解历史，驱动 AI 复习推荐与 SobrietySnapshot 生成。

| 列名 | 类型 | 约束 | 语义说明 |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | 知识点唯一标识（UUID） |
| `student_id` | `TEXT` | `NOT NULL DEFAULT 'superadmin'` | 所属学生用户 ID |
| `subject` | `TEXT` | `NOT NULL` | 所属学科 |
| `topic` | `TEXT` | `NOT NULL` | 知识点名称（如 `'二次函数求根公式'`） |
| `weakness_score` | `REAL` | `NOT NULL DEFAULT 0.5` | 薄弱程度（0–1）；`1.0` 表示完全不会，`0.0` 表示完全掌握；注意方向与 `confidence` 相反 |
| `confidence` | `REAL` | 迁移列，`DEFAULT 0.5` | 掌握程度（0–1）；`1.0` 表示完全掌握，`0.0` 表示完全不会；与 `weakness_score` 语义相反，`confidence ≈ 1 - weakness_score` |
| `stability` | `REAL` | 迁移列，`DEFAULT 1.0` | Ebbinghaus 记忆稳定性参数；值越大表示记忆越稳固，遗忘越慢；用于遗忘曲线公式 |
| `attempt_count` | `INTEGER` | `NOT NULL DEFAULT 0` | 该知识点累计练习/被检测次数 |
| `last_practiced` | `INTEGER` | — | 最后一次练习时间（Unix ms）；为 null 表示从未练习 |
| `data_source` | `TEXT` | 迁移列，`DEFAULT 'agent_observed'` | 数据来源标识：`'agent_observed'`（AI 观测）、`'manual'`（手动录入）等 |
| `error_types` | `TEXT` | 迁移列 | **JSON 数组**，见下方详解 |
| `root_cause` | `TEXT` | 迁移列 | AI 归因的根本错误原因（自然语言描述，如 `'概念混淆：把极值点等同于最值点'`） |
| `explanation_log` | `TEXT` | 迁移列 | **JSON 数组**，见下方详解 |
| `prerequisites` | `TEXT` | 迁移列 | **JSON 数组**，见下方详解 |
| `create_user` | `TEXT` | — | 创建人用户 ID |
| `update_user` | `TEXT` | — | 最后修改人用户 ID |
| `create_time` | `INTEGER` | `NOT NULL` | 创建时间（Unix ms） |
| `update_time` | `INTEGER` | `NOT NULL` | 更新时间（Unix ms） |
| `delete_flag` | `INTEGER` | `NOT NULL DEFAULT 0` | 软删除标志 |

**Ebbinghaus 遗忘曲线公式：**

```
retention = e ^ ( -days / (stability × 5) )
```

- `days`：距 `last_practiced` 经过的天数
- `stability`：记忆稳定性（越大遗忘越慢）
- `retention < 0.5` 时视为"待复习"，进入 `SobrietySnapshot.due_reviews`

**持续卡点判定条件：** `attempt_count >= 3` 且 `confidence < 0.5`

---

### AgentLog

**描述：** AI Agent 操作日志表。记录每次 Agent 执行的动作类型、触发来源、使用的模型及执行结果，用于审计和调试。

| 列名 | 类型 | 约束 | 语义说明 |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | 日志唯一标识（UUID） |
| `student_id` | `TEXT` | `DEFAULT 'superadmin'` | 关联的学生用户 ID |
| `action_type` | `TEXT` | `NOT NULL` | 动作类型（如 `'analyze_weakness'`、`'send_report'`、`'plan_review'`） |
| `action_detail` | `TEXT` | — | 动作详情（JSON 或自然语言描述），可为 null |
| `trigger_type` | `TEXT` | `NOT NULL` | 触发来源：如 `'scheduled'`（定时触发）、`'manual'`（手动触发）、`'webhook'`（消息触发） |
| `model_used` | `TEXT` | — | 执行本次动作所用的 LLM 模型标识（如 `'claude-3-5-sonnet-20241022'`） |
| `status` | `TEXT` | `DEFAULT 'success'` CHECK `IN ('success','failed','pending')` | 执行状态 |
| `error_message` | `TEXT` | — | 若 `status='failed'`，此字段记录错误信息 |
| `create_user` | `TEXT` | — | 创建人用户 ID |
| `update_user` | `TEXT` | — | 最后修改人用户 ID |
| `create_time` | `INTEGER` | `NOT NULL` | 日志产生时间（Unix ms） |
| `update_time` | `INTEGER` | `NOT NULL` | 更新时间（Unix ms） |
| `delete_flag` | `INTEGER` | `NOT NULL DEFAULT 0` | 软删除标志 |

---

### AgentTask

**描述：** 后台任务执行追踪表。用于追踪异步 Agent 任务的生命周期：从创建（`pending`）到执行（`started_at`）到完成（`completed_at`）。与 `AgentLog` 的区别在于：`AgentTask` 追踪任务执行过程，`AgentLog` 记录已完成的动作结果。

| 列名 | 类型 | 约束 | 语义说明 |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | 任务唯一标识（UUID） |
| `task_type` | `VARCHAR(50)` | `NOT NULL` | 任务类型标识（如 `'sobriety_refresh'`、`'weekly_report'`） |
| `student_id` | `TEXT` | `DEFAULT 'superadmin'` | 关联学生用户 ID |
| `status` | `VARCHAR(20)` | `DEFAULT 'pending'` | 任务状态：`'pending'`（排队中）、`'running'`（执行中）、`'done'`（已完成）、`'failed'`（失败） |
| `trigger_type` | `VARCHAR(30)` | — | 触发来源（同 `AgentLog.trigger_type`） |
| `input_summary` | `TEXT` | — | 任务输入参数摘要（自然语言或 JSON），便于调试 |
| `output` | `TEXT` | — | 任务执行输出（JSON 或文本），任务完成后填写 |
| `error` | `TEXT` | — | 若任务失败，此字段存储错误信息 |
| `started_at` | `INTEGER` | — | 任务开始执行时间（Unix ms）；null 表示尚未开始 |
| `completed_at` | `INTEGER` | — | 任务完成/失败时间（Unix ms）；null 表示尚未结束 |
| `create_time` | `INTEGER` | `NOT NULL` | 任务创建时间（Unix ms） |
| `update_time` | `INTEGER` | `NOT NULL` | 更新时间（Unix ms） |
| `delete_flag` | `INTEGER` | `DEFAULT 0` | 软删除标志 |

---

### ScheduleConfig

**描述：** 定时任务配置表。每条记录对应一个 cron 定时任务配置，控制 Agent 的自动化触发频率。

| 列名 | 类型 | 约束 | 语义说明 |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | 配置唯一标识（UUID） |
| `student_id` | `TEXT` | `NOT NULL DEFAULT 'superadmin'` | 关联学生用户 ID |
| `cron_expression` | `TEXT` | `NOT NULL` | Cron 表达式（如 `'0 20 * * *'` 表示每天 20:00） |
| `description` | `TEXT` | — | 任务描述（如 `'每日晚间 SobrietySnapshot 刷新'`） |
| `last_run` | `INTEGER` | — | 上次执行时间（Unix ms）；null 表示从未执行 |
| `next_run` | `INTEGER` | — | 下次预计执行时间（Unix ms） |
| `status` | `TEXT` | `DEFAULT 'active'` CHECK `IN ('active','paused','deleted')` | 任务状态：`active`（激活）、`paused`（暂停）、`deleted`（逻辑删除，不同于 `delete_flag`） |
| `create_user` | `TEXT` | — | 创建人用户 ID |
| `update_user` | `TEXT` | — | 最后修改人用户 ID |
| `create_time` | `INTEGER` | `NOT NULL` | 创建时间（Unix ms） |
| `update_time` | `INTEGER` | `NOT NULL` | 更新时间（Unix ms） |
| `delete_flag` | `INTEGER` | `NOT NULL DEFAULT 0` | 软删除标志 |

---

### MessageLog

**描述：** 消息收发记录表。记录系统与用户之间所有往来消息（微信/邮件/API 等渠道），包括收到的用户消息和系统发出的报告/提醒。

| 列名 | 类型 | 约束 | 语义说明 |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | 消息唯一标识（UUID） |
| `user_id` | `TEXT` | `DEFAULT 'superadmin'` | 关联用户 ID（消息发送方或接收方） |
| `direction` | `TEXT` | `NOT NULL` CHECK `IN ('inbound','outbound')` | 消息方向：`inbound`（用户发给系统）或 `outbound`（系统发给用户） |
| `message_type` | `TEXT` | `NOT NULL DEFAULT 'text'` | 消息类型：`'text'`（文本）、`'image'`（图片）、`'file'`（文件）、`'report'`（报告） |
| `content` | `TEXT` | `NOT NULL` | 消息正文内容 |
| `attachment_path` | `TEXT` | — | 附件文件路径（服务器本地路径），可为 null |
| `status` | `TEXT` | `DEFAULT 'sent'` CHECK `IN ('sent','failed','pending')` | 消息状态：`sent`（已发送/已收到）、`failed`（发送失败）、`pending`（待发送） |
| `create_user` | `TEXT` | — | 创建人用户 ID |
| `update_user` | `TEXT` | — | 最后修改人用户 ID |
| `create_time` | `INTEGER` | `NOT NULL` | 消息产生时间（Unix ms） |
| `update_time` | `INTEGER` | `NOT NULL` | 更新时间（Unix ms） |
| `delete_flag` | `INTEGER` | `NOT NULL DEFAULT 0` | 软删除标志 |

---

### Settings

**描述：** 系统配置键值对表。存储全局或用户级别的配置项（API 密钥、推送开关、系统参数等），支持加密标记。

| 列名 | 类型 | 约束 | 语义说明 |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | 配置项唯一标识（UUID） |
| `key` | `TEXT` | `UNIQUE NOT NULL` | 配置项键名（全局唯一），如 `'openai_api_key'`、`'push_enabled'` |
| `value` | `TEXT` | `NOT NULL` | 配置项值（字符串形式存储；加密时存储加密后的密文） |
| `encrypted` | `INTEGER` | `NOT NULL DEFAULT 0` | 加密标志：`0` 明文存储，`1` 表示 `value` 已加密，读取时需解密 |
| `create_user` | `TEXT` | — | 创建人用户 ID |
| `update_user` | `TEXT` | — | 最后修改人用户 ID |
| `create_time` | `INTEGER` | `NOT NULL` | 创建时间（Unix ms） |
| `update_time` | `INTEGER` | `NOT NULL` | 更新时间（Unix ms） |
| `delete_flag` | `INTEGER` | `NOT NULL DEFAULT 0` | 软删除标志 |

---

### FileIndex

**描述：** 文件系统索引表。与 `Resource` 不同，`FileIndex` 是更轻量的文件目录索引，主要用于扫描和追踪文件系统中已存在的文件（包括非上传途径产生的文件）。主键使用自增整型。

| 列名 | 类型 | 约束 | 语义说明 |
|---|---|---|---|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | 自增整型主键 |
| `file_path` | `TEXT` | `NOT NULL` | 文件绝对路径或相对路径 |
| `file_name` | `VARCHAR(200)` | — | 文件名（含扩展名） |
| `file_type` | `VARCHAR(50)` | — | 文件类型/扩展名（如 `'pdf'`、`'jpg'`） |
| `file_size` | `INTEGER` | — | 文件大小（字节） |
| `category` | `VARCHAR(50)` | — | 文件分类标签（如 `'homework'`、`'exam_paper'`、`'note'`） |
| `student_id` | `TEXT` | `DEFAULT 'superadmin'` | 关联学生用户 ID |
| `source_email` | `VARCHAR(200)` | — | 若来源于邮件，记录发件人邮箱 |
| `description` | `TEXT` | — | 文件描述/摘要 |
| `tags` | `TEXT` | — | 标签列表（JSON 字符串数组，如 `["数学","期末","2024"]`） |
| `create_time` | `INTEGER` | `NOT NULL` | 索引创建时间（Unix ms） |
| `update_time` | `INTEGER` | `NOT NULL` | 更新时间（Unix ms） |
| `delete_flag` | `INTEGER` | `DEFAULT 0` | 软删除标志 |

---

### StudentGoal

**描述：** 学生考试目标表。记录学生的目标考试信息（类型、日期），以及当前学校课程进度和家长备注，驱动 SobrietySnapshot 中的倒计时与紧迫度计算。

| 列名 | 类型 | 约束 | 语义说明 |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | 目标记录唯一标识（UUID） |
| `student_id` | `TEXT` | `NOT NULL` | 所属学生用户 ID，关联 `User.id` |
| `exam_type` | `TEXT` | — | 考试类型（如 `'高考'`、`'中考'`、`'期末'`、`'竞赛'`） |
| `exam_date` | `INTEGER` | — | 考试日期（**Unix 毫秒时间戳**），用于计算 `days_left = ceil((exam_date - now) / 86400000)` |
| `school_progress` | `TEXT` | — | 当前学校课程进度（自然语言描述，如 `'高三上学期，已完成导数全章'`） |
| `guardian_notes` | `TEXT` | — | 家长备注（对学生状态、特殊需求等的补充说明） |
| `create_time` | `INTEGER` | `NOT NULL` | 创建时间（Unix ms） |
| `update_time` | `INTEGER` | `NOT NULL` | 更新时间（Unix ms） |
| `delete_flag` | `INTEGER` | `NOT NULL DEFAULT 0` | 软删除标志 |

**关键查询：** SobrietySnapshot 生成时取 `ORDER BY update_time DESC LIMIT 1` 的最新目标记录。

---

### SobrietySnapshot

**描述：** AI 自我清醒快照表。每个学生维护一条记录（以 `student_id` 为主键），存储 AI 对该学生当前学习状态的完整认知快照。该快照在每次对话开始前注入到 system prompt，使 AI 无需重新推断就能直接感知当前局势。

| 列名 | 类型 | 约束 | 语义说明 |
|---|---|---|---|
| `student_id` | `TEXT` | `PRIMARY KEY` | 学生用户 ID，每生仅一条记录（upsert 模式） |
| `snapshot` | `TEXT` | `NOT NULL` | 完整快照 JSON，对应 `SobrietySnapshot` 接口（见下方详解） |
| `generated_at` | `INTEGER` | `NOT NULL` | 快照生成时间（Unix ms），用于判断缓存是否过期 |
| `notified_at` | `INTEGER` | — | 最后一次向家长/学生推送提醒的时间（Unix ms）；null 表示从未推送 |
| `last_urgency` | `TEXT` | — | 上一次快照的紧迫度级别（`'idle'` \| `'normal'` \| `'attention'` \| `'urgent'`），用于检测"是否新升级到 urgent"以避免重复推送 |

**缓存策略：** `getOrRefreshSnapshot()` 默认缓存 30 分钟（`maxAgeMs = 30 * 60 * 1000`），超时则重新从 DB 推导生成。

---

### ResourceFTS（虚拟表）

**描述：** v1.3 新增。基于 FTS5 引擎的全文检索虚拟表，对 `Resource` 表的 `file_name`、`subject`、`parsed_text` 字段建立全文索引。

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS ResourceFTS USING fts5(
  resource_id UNINDEXED,  -- 关联 Resource.id，不参与全文索引
  file_name,              -- 文件名全文索引
  subject,                -- 学科名全文索引
  parsed_text,            -- OCR 解析文本全文索引
  content=Resource,       -- 外部内容表（从 Resource 表同步）
  content_rowid=rowid     -- rowid 对应关系
)
```

查询示例：
```sql
SELECT resource_id FROM ResourceFTS WHERE ResourceFTS MATCH '导数 极值';
```

---

## 索引

| 索引名 | 表 | 列 | 过滤条件 |
|---|---|---|---|
| `idx_user_sync_token` | `User` | `sync_token` | `delete_flag = 0` |
| `idx_plan_student_id` | `Plan` | `student_id` | `delete_flag = 0` |
| `idx_resource_uploader` | `Resource` | `uploader_id` | `delete_flag = 0` |
| `idx_resource_subject` | `Resource` | `subject` | `delete_flag = 0` |
| `idx_learning_record_student` | `LearningRecord` | `student_id` | `delete_flag = 0` |
| `idx_knowledge_point_student` | `KnowledgePoint` | `student_id` | `delete_flag = 0` |
| `idx_agent_log_student` | `AgentLog` | `student_id` | `delete_flag = 0` |
| `idx_agent_task_student` | `AgentTask` | `student_id` | `delete_flag = 0` |
| `idx_agent_task_status` | `AgentTask` | `status` | `delete_flag = 0` |
| `idx_file_index_student` | `FileIndex` | `student_id` | `delete_flag = 0` |

所有索引均为**部分索引**（Partial Index），仅覆盖未软删除的记录，减少索引体积。

---

## 表间关系

```
User (id)
  │
  ├──[guardian_id]──► User (id)          自引用：student → guardian
  │
  ├──[student_id]──► Plan
  ├──[student_id]──► LearningRecord
  ├──[student_id]──► KnowledgePoint
  ├──[student_id]──► AgentLog
  ├──[student_id]──► AgentTask
  ├──[student_id]──► ScheduleConfig
  ├──[student_id]──► FileIndex
  ├──[student_id]──► StudentGoal
  ├──[student_id]──► SobrietySnapshot (PRIMARY KEY = student_id)
  │
  └──[uploader_id]──► Resource
                          │
                          └──[resource_id]──► ResourceFTS (虚拟表)
```

**注意：** 由于 `foreign_keys = OFF`，上述外键关系不由数据库强制约束，由应用层保证数据一致性。

### 多租户数据隔离

几乎所有业务表都带有 `student_id` 字段，所有查询应携带 `student_id` 条件进行数据隔离。历史单用户数据（v1.2 及更早）使用默认值 `'superadmin'`。

---

## 迁移机制

`runMigrations()` 函数负责对已存在的数据库（从旧版本升级时）追加新列。其设计特点：

**幂等性：** 使用 `ALTER TABLE ... ADD COLUMN` + `try/catch` 模式——若列已存在，SQLite 会报错，catch 块静默忽略，保证可重复执行不报错。

**无回滚：** 仅支持向前追加列，不支持删除列或修改列类型（SQLite 原生限制）。

当前迁移列清单：

| 表 | 新增列 | 默认值 | 版本说明 |
|---|---|---|---|
| `KnowledgePoint` | `confidence` | `0.5` | 掌握程度，与 `weakness_score` 互补 |
| `KnowledgePoint` | `data_source` | `'agent_observed'` | 数据来源标识 |
| `KnowledgePoint` | `error_types` | `NULL` | 错误类型 JSON 数组 |
| `KnowledgePoint` | `stability` | `1.0` | Ebbinghaus 稳定性参数 |
| `KnowledgePoint` | `root_cause` | `NULL` | AI 归因的根本原因 |
| `KnowledgePoint` | `explanation_log` | `NULL` | 讲解历史 JSON 数组 |
| `KnowledgePoint` | `prerequisites` | `NULL` | 前置知识点 JSON 数组 |
| `User` | `role` | `'guardian'` | 用户角色 |
| `User` | `student_name` | `NULL` | 学生姓名 |
| `User` | `student_grade` | `NULL` | 学生年级 |
| `User` | `guardian_id` | `NULL` | 监护人 ID（自引用 FK） |

---

## JSON 列结构详解

### KnowledgePoint.error_types

存储该知识点出现过的错误类型标签数组。

**类型：** `string[]`

```json
["概念混淆", "计算粗心", "方法错误"]
```

---

### KnowledgePoint.explanation_log

存储 AI 对该知识点进行讲解的历史记录，每次讲解后追加一条。

**类型：** `Array<ExplanationEntry>`

```typescript
interface ExplanationEntry {
  method?: string        // 讲解方法（如 '类比法'、'例题演示'、'图形推导'）
  understood?: boolean   // 本次讲解后学生是否理解（false 时进入 unresolved_from_last）
  root_cause?: string    // 本次讲解中 AI 归因的根本原因
  date?: number          // 讲解时间（Unix ms）
}
```

**示例：**

```json
[
  {
    "method": "例题演示",
    "understood": false,
    "root_cause": "混淆了极值点与最值点的定义",
    "date": 1746748800000
  },
  {
    "method": "图形推导",
    "understood": true,
    "root_cause": null,
    "date": 1746835200000
  }
]
```

`unresolved_from_last` 判断逻辑：取最新一条 `understood === false` 的记录。

---

### KnowledgePoint.prerequisites

存储学习该知识点所需的前置知识点列表，用于依赖关系分析和学习路径规划。

**类型：** `Array<Prerequisite>`

```typescript
interface Prerequisite {
  topic: string    // 前置知识点名称
  subject: string  // 前置知识点所属学科
}
```

**示例：**

```json
[
  { "topic": "函数的定义与性质", "subject": "数学" },
  { "topic": "导数的几何意义", "subject": "数学" }
]
```

---

### SobrietySnapshot.snapshot（完整接口）

`snapshot` 列存储整个 `SobrietySnapshot` 接口序列化后的 JSON。

```typescript
interface SobrietySnapshot {
  generated_at: number            // 快照生成时间（Unix ms）
  days_since_active: number | null  // 距上次学习的天数；null 表示无学习记录

  exam: {                         // 最近一个目标考试；null 表示未设置
    type: string                  // 考试类型（如 '高考'）
    date: number                  // 考试日期（Unix ms）
    days_left: number             // 距今剩余天数（负数表示已过期）
  } | null

  due_reviews: Array<{            // 按 retention 升序排列，最多 5 条
    topic: string                 // 知识点名称
    subject: string               // 所属学科
    retention: number             // Ebbinghaus 估计保留率（0–1，保留两位小数）
    days_overdue: number          // 距上次练习天数（四舍五入）
  }>

  persistent_blocks: Array<{      // 持续卡点，最多 3 条
    topic: string                 // 知识点名称
    subject: string               // 所属学科
    root_cause: string | null     // AI 归因的根本原因
    attempts: number              // 累计尝试次数
  }>

  subject_drift: {
    recent_distribution: Record<string, number>  // 近 14 天各学科学习时间占比（%）
    primary_subject: string | null               // 占比最高的学科
    drift_warning: string | null                 // 漂移警告文本；null 表示无漂移
  }

  unresolved_from_last: string | null  // 上次未理清的悬念（格式："topic（root_cause）— 上次未理清"）

  urgency: {
    level: 'idle' | 'normal' | 'attention' | 'urgent'  // 紧迫度级别
    reasons: string[]                                    // 触发紧迫度的原因列表
  }

  today_priority: string           // 注入 system prompt 的中文摘要（≤400字）
}
```

**紧迫度级别说明：**

| 级别 | 含义 | 触发条件 |
|---|---|---|
| `idle` | 无数据 | 无任何学习记录 |
| `normal` | 正常 | 默认级别 |
| `attention` | 需关注 | 距考试 30–90 天，或 3+ 天未学习，或 3+ 个知识点待复习 |
| `urgent` | 紧迫 | 距考试 < 30 天 |

---

### Plan.subjects

**类型：** `string[]`

```json
["数学", "物理", "化学"]
```

---

### FileIndex.tags

**类型：** `string[]`

```json
["数学", "期末", "2024", "选择题"]
```
