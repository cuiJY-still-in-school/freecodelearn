# PersonalAC v1.5 — AI 学习助手（Claude Code 开发指南）

> **目录名 1.4，包名 personalac，版本号 1.5.0，文档标注 v1.3。以 package.json 为准：v1.5。**

---

## 0. 30 秒速览

| 项目 | 值 |
|------|-----|
| 定位 | 面向家长 + 学生的 AI 学习管理系统（Express + React 18 SPA） |
| 运行端口 | 7575（生产）；3000（开发） |
| 全局 CLI | `/home/jayson2013/.config/nvm/versions/node/v22.22.2/bin/personalac` |
| 数据目录 | `~/.personalac/`（DB 2.3MB + 下载 220MB） |
| 服务管理 | `systemctl --user <start/stop/restart> personalac` |
| 技术栈 | Node.js 22 + Express + better-sqlite3 + React 18 + Vite 5 + MUI v6 |
| AI 提供商 | MiniMax（生产）、OpenAI/Anthropic/Ollama 可选 |
| 认证方式 | `x-sync-token` header（UUID token，无 JWT 过期） |

---

## 1. 快速启动

### 开发模式
```bash
# 终端 1: 后端
cd /home/jayson2013/桌面/personalAC/codescore/1.4/server
npm run dev          # ts-node-dev --respawn --transpile-only src/index.ts → port 3000

# 终端 2: 前端
cd /home/jayson2013/桌面/personalAC/codescore/1.4/frontend
npm run dev          # vite → port 5173，Vite 自动 proxy /api → localhost:3000
```

### 生产构建
```bash
# 两个目录分别 build
cd server && npm run build    # tsc → dist/
cd frontend && npm run build  # tsc + vite build → dist/

# 复制 server dist 到全局包
cp -r server/dist/. ~/.config/nvm/versions/node/v22.22.2/lib/node_modules/personalac/dist/
```

### 重启生产服务
```bash
systemctl --user daemon-reload
systemctl --user restart personalac
curl http://localhost:7575/api/health
```

### 生产部署拓扑（当前环境）
```
用户浏览器 → jkt100.cn (HTTPS)
    → nginx 反代 (CORS + gzip + 缓存)
    → localhost:7575
    → systemd 用户服务 personalac.service
        (PORT=7575, DATA_DIR=~/.personalac, CORS_ORIGIN=https://jkt100.cn)
```

Systemd 配置文件: `/home/jayson2013/.config/systemd/user/personalac.service`

**注意：无测试、无 CI、无 lint 规则。基础设施零。改动后手动 `npm run dev` 验证。**

---

## 2. 架构总览

```
┌──────────────────────────────────────────────┐
│  前端 (React 18 + Vite 5 + MUI v6)          │
│  28 页面，懒加载分包，SSE 流式聊天            │
│  src/api/http.ts 封装全部 HTTP 请求          │
└──────────────┬───────────────────────────────┘
               │ HTTP + SSE
┌──────────────▼───────────────────────────────┐
│  路由层 (27 个挂载点)                        │
│  index.ts 注册所有路由 + 速率限制              │
└──────┬───────────────────────────────────────┘
       │
┌──────▼────────────┐ ┌───────────────────────┐
│ 中间件层           │ │ Agent 子系统           │
│ requireAuth       │ │ ┌───────────────────┐ │
│ requireAdmin      │ │ │ Planner           │ │
│ requireAdminOr    │ │ │ (buildPlanner     │ │
│   Guardian        │ │ │  Prompt + parse)  │ │
└──────┬────────────┘ │ └───┬───────────────┘ │
       │              │     ▼                  │
┌──────▼────────────┐ │ ┌───────────────────┐ │
│ 服务层 (20 个)     │ │ │ Executors (8 种)  │ │
│ auth, homework,   │ │ │ callAI() ← 统一   │ │
│ srs, vision, ocr, │ │ │ 调用 getAIConfig  │ │
│ todo, report, ... │ │ └───┬───────────────┘ │
└──────┬────────────┘ │     ▼                  │
       │              │ ┌───────────────────┐ │
┌──────▼────────────┐ │ │ Tools (22 个)      │ │
│ 数据层              │ │ │ ReAct 循环中调用  │ │
│ better-sqlite3    │ │ └───────────────────┘ │
│ WAL mode, UUID PK │ │ 定时: node-cron       │
│ 26 张表, 软删除    │ │ 调度: Scheduler.ts   │
└───────────────────┘ └───────────────────────┘
```

### 关键数据流
1. **ReAct 对话循环** (`agent/index.ts`): 用户消息 → 构建上下文 (context.ts) → 组装 system prompt → callAI → 解析 tool_calls → 执行工具 → 结果回填 → 继续直到 max 5 轮或无 tool_calls → SSE 流式返回
2. **后台自主任务** (`agent/index.ts` runAutonomousCycle): cron 触发 → buildContext → Planner 选任务类型 → 各 executor 异步执行 → 更新 AgentLog + AgentTask → 产生 BotMessage 副作用
3. **清醒系统** (`sobriety.service.ts`): 综合分析学生状态（遗忘曲线、目标进度、最近活跃度）→ JSON 注入 system prompt

---

## 3. 目录结构速查

```
1.4/
├── server/                    # 后端 (Node.js + Express + TypeScript)
│   ├── src/
│   │   ├── index.ts           # ★ 入口：Express 启动、路由注册、速率限制、静态服务
│   │   ├── agent/             # ★ AI Agent 子系统
│   │   │   ├── index.ts       # AgentEngine: ReAct 循环 + callAI + chat flow
│   │   │   ├── planner.ts     # buildPlannerPrompt + PlannedTaskType 枚举
│   │   │   ├── executors.ts   # 8 种背景任务执行器 + AIConfig/BotMessage 类型
│   │   │   ├── scheduler.ts   # AgentScheduler: per-student cron + 心跳补偿
│   │   │   └── context.ts     # AgentContext: 组装学生全量上下文
│   │   ├── routes/            # 路由处理器 (28 文件，一一对应 index.ts 挂载)
│   │   ├── services/          # 业务逻辑 (20 文件)
│   │   ├── tools/             # AI 函数调用工具 (4 文件, 22 个工具)
│   │   ├── middleware/        # 认证中间件
│   │   └── database/
│   │       └── index.ts       # SQLite init + 建表 + 迁移
│   ├── dist/                  # tsc 编译输出
│   ├── data/                  # 开发环境数据库文件
│   └── cli/                   # pac.js CLI 工具
├── frontend/                  # 前端 (React 18 + Vite 5)
│   ├── src/
│   │   ├── App.tsx            # ★ SPA 路由定义 (lazy-loaded)
│   │   ├── main.tsx           # ReactDOM.createRoot 入口
│   │   ├── api/http.ts        # ★ 全部 HTTP API 封装
│   │   ├── pages/             # 28 个页面组件
│   │   ├── components/        # 7 个共享组件
│   │   ├── context/           # UserContext + ToastContext
│   │   └── styles/global.css  # 完整设计系统 (~994 行)
│   └── dist/                  # Vite 构建输出
├── README.md                  # 项目概述
├── ARCHITECTURE.md            # 开发者详细架构参考 (1058 行)
├── API.md                     # 完整 HTTP API 参考 (1252 行)
├── SCHEMA.md                  # 数据库表结构 (608 行)
└── USAGE.md                   # 用户使用指南 (423 行)
```

**全局包路径** (生产运行时):
- 二进制: `/home/jayson2013/.config/nvm/versions/node/v22.22.2/bin/personalac`
- 源码: `/home/jayson2013/.config/nvm/versions/node/v22.22.2/lib/node_modules/personalac/dist/`
- 修改生产代码: 改 `1.4/server/src/` → `npm run build` → 复制 dist 到全局包

---

## 4. 完整路由表 (27 条)

### 认证 (3)
| 路径 | 文件 | 说明 | 鉴权 |
|------|------|------|------|
| `/api/auth/*` | `auth.routes.ts` | 登录/注册/OTP/改密码/邀请/学生管理 | 混合（部分公开） |
| `/api/oauth/*` | `oauth.routes.ts` | Anthropic PKCE + OpenAI 设备码授权 | 混合 |
| `/api/admin/*` | `admin.routes.ts` | 用户列表/删除/角色切换 | requireAdmin |

### 学习数据 (5)
| 路径 | 文件 | 说明 |
|------|------|------|
| `/api/data/*` | `data.routes.ts` | 学习记录 CRUD + 概要统计 |
| `/api/progress/*` | `progress.routes.ts` | 周统计/热力图/信心图 |
| `/api/srs/*` | `srs.routes.ts` | SM-2 间隔重复：待复习项、记录评分 |
| `/api/scores/*` | `scores.routes.ts` | 成绩录入与历史 |
| `/api/radar/*` | `radar.routes.ts` | 六维雷达图数据（监护人配置） |

### AI 交互 (3)
| 路径 | 文件 | 说明 |
|------|------|------|
| `/api/chat/*` | `chat.routes.ts` | SSE 流式聊天（RateLimit: 20/min） |
| `/api/chat-history/*` | `chat-history.routes.ts` | 对话历史 CRUD |
| `/api/agent/*` | `agent.routes.ts` | Agent 日志/任务/手动触发 |

### 学习工具 (4)
| 路径 | 文件 | 说明 |
|------|------|------|
| `/api/homework/*` | `homework.routes.ts` | AI 批改作业（图片上传） |
| `/api/mistakes/*` | `mistake.routes.ts` | 错题本：按科目/状态筛选 |
| `/api/todo/*` | `todo.routes.ts` | 待办事项：优先级/截止/递归/必做 |
| `/api/plans/*` | `plans.routes.ts` | 学习计划：创建/激活/归档 |

### 内容管理 (4)
| 路径 | 文件 | 说明 |
|------|------|------|
| `/api/workspace/*` | `workspace.routes.ts` | AI 工作区文件：写/读/删/统计 |
| `/api/drive/*` | `drive.routes.ts` | 云盘：上传/下载/目录/搜索 (RateLimit: 10/min sync) |
| `/api/relay/*` | `relay.routes.ts` | 图片中继：监护人与学生间的图片传输 |
| `/api/download/*` | `download.routes.ts` | CLI 下载 + 客户端 APK 分发 |

### 系统配置 (3)
| 路径 | 文件 | 说明 |
|------|------|------|
| `/api/settings/*` | `settings.routes.ts` | AI/搜索/Wolfram/Vision 配置 |
| `/api/backup/*` | `backup.routes.ts` | 数据库备份：创建/下载/列表 |
| `/api/redeem/*` | `redeem.routes.ts` | 兑换码：生成/兑换/订阅状态 |

### 客户端 (3)
| 路径 | 文件 | 说明 |
|------|------|------|
| `/api/client/*` | `client.routes.ts` | 客户端配置/截图上传/监护人验证 |
| `/api/notify/*` | `notify.routes.ts` | SSE 实时推送 |
| `/api/goals/*` | `goals.routes.ts` | 学生目标：考试类型/日期/进度 |
| `/api/feedback/*` | `feedback.routes.ts` | 用户反馈提交与查看 |
| `/api/report/*` | `report.routes.ts` | 周报：HTML + JSON |

### 特殊端点
| 端点 | 说明 |
|------|------|
| `GET /api/health` | 健康检查：DB/AI/Vision 状态 + uptime（无鉴权） |
| `GET /cli/*` | CLI 工具分发（pac.js + install.sh） |

---

## 5. 完整服务表 (20 个)

| 文件 | 核心功能 | 被谁调用 |
|------|---------|---------|
| `auth.service.ts` | 用户 CRUD/登录/注册/OTP/邀请/学生绑定 | auth.routes, client.routes |
| `settings.service.ts` | AES-256 加密 KV 配置存储、AI/Wolfram/Vision 配置 | settings.routes, agent/index, homework.service, oauth.service |
| `resource.service.ts` | 资源文件上传/解析(PDF/docx)/搜索(FTS5)/删除 | plans.routes, chat-tools |
| `plan.service.ts` | 学习计划 CRUD + 激活/归档 | plans.routes, agent/context |
| `data.service.ts` | 学习记录打分/统计/连续天数 | data.routes, agent/context |
| `workspace.service.ts` | AI 工作区文件管理（磁盘空间告警） | workspace.routes, chat-tools |
| `todo.service.ts` | 待办 CRUD/优先级排序/过期检测/必做标记 | todo.routes, chat-tools, agent/context |
| `srs.service.ts` | **SM-2** 间隔重复算法：评分→更新间隔/难度因子 | srs.routes, homework.service, agent/context |
| `homework.service.ts` | AI 批改作业图片解析→错题自动录入→**联动 SM-2** | homework.routes |
| `vision.service.ts` | 图片描述（本地 Ollama MiniCPM-V，LRU 缓存 50 条/2h） | chat-tools (describe_image) |
| `ocr.service.ts` | 图片中文 OCR（tesseract.js 懒加载单例） | chat.routes (消息预处理) |
| `oauth.service.ts` | Anthropic PKCE + OpenAI 设备码授权流程 | oauth.routes |
| `email.service.ts` | OTP 邮件发送（Resend API + HTML 模板） | auth.routes, notify.service |
| `notify.service.ts` | SSE 客户端池管理 + 消息推送 | notify.routes, agent/executors |
| `sobriety.service.ts` | **清醒系统**：考试倒计时/遗忘估算/弱点分析/风险评估 | agent/context, agent/index |
| `relay.service.ts` | 图片中继（监护人⇔学生） | relay.routes, chat-tools |
| `report.service.ts` | 周报生成：聚合统计+薄弱点+连续天数+HTML 渲染 | report.routes |
| `backup.service.ts` | 数据库备份到 `$DATA_DIR/backups/`，保留最近 7 份 | backup.routes |
| `blackroom.service.ts` | "小黑屋"设备锁定状态 | client.routes, agent/index |
| `thought.service.ts` | Agent 思考日志记录（触发因素+摘要+后续关注） | agent/index |

---

## 6. 完整 AI 工具表 (22 个)

### chat-tools.ts (20 个)
| 工具名 | 触发场景 | 做什么 |
|---------|---------|--------|
| `get_student_summary` | 获取学生概览 | 返回学生档案+学习计划+进度摘要 |
| `update_knowledge` | 更新知识点状态 | 写入 KnowledgePoint：信心/弱点评分/SM-2 参数 |
| `set_plan` | 设定学习计划 | 创建/更新 Plan |
| `record_learning` | 记录学习活动 | 写入 LearningRecord（科目/主题/分数/时长） |
| `log_explanation` | 记录知识讲解 | 写入 KnowledgePoint.explanation_log |
| `link_prerequisite` | 建立知识点前置关系 | 更新 KnowledgePoint.prerequisites JSON |
| `check_prerequisites` | 查前置知识掌握情况 | 查询前置知识点信心值 |
| `get_sobriety` | 获取清醒报告 | 返回 SobrietySnapshot（考试倒计时/遗忘曲线/风险） |
| `manage_todo` | 管理待办事项 | 创建/更新/完成 Todo |
| `relay_image` | 转发图片 | 通过 Relay 中继向监护人发图片 |
| `describe_image` | 图像识别 | 调用 vision.service 分析截图/照片 |
| `notify_guardian` | 通知监护人 | 通过 notify.service 推送消息 |
| `drive_list` | 云盘列目录 | 列出 FileIndex 中的文件 |
| `drive_read` | 云盘读文件 | 读取 FileIndex 文件内容 |
| `drive_write` | 云盘写文件 | 写入文件到 FileIndex |
| `wolfram_query` | 数学计算 | 调用 Wolfram Alpha API |
| `schedule_wakeup` | 定时唤醒 | 创建 AgentSchedule（未来自动触发） |
| `record_mistake` | 记录错题 | 写入 MistakeBook（错题/错误类型/根因） |
| `update_student_radar` | 更新雷达图 | 写入六维评估数据 |

### search-tool.ts (1 个)
| 工具名 | 做什么 |
|---------|--------|
| `web_search` | 网络搜索：优先 Serper.dev API → 中文维基百科降级 |

### python-tool.ts (1 个)
| 工具名 | 做什么 | 限制 |
|---------|--------|------|
| `run_python` | 沙箱 Python 执行（数学/科学计算） | 白名单 import、8s 超时、512KB 输出限制 |

---

## 7. 数据表速查 (26 张表)

### 核心业务
| 表名 | 用途 | 关键列 |
|------|------|--------|
| `User` | 用户（guardian/student/admin） | sync_token(UUID 认证), guardian_id(绑定关系), role |
| `Plan` | 学习计划 | title, description, subjects(JSON), status(active/archived) |
| `LearningRecord` | 学习记录 | student_id, subject, topic, score, duration, recorded_at |
| `KnowledgePoint` | 知识点状态 | student_id, confidence, weakness_score, srs_*, prerequisites(JSON), explanation_log |
| `Todo` | 待办事项 | student_id, priority, status, due_date, recurrence(cron), must_do |
| `SobrietySnapshot` | 清醒系统快照 | student_id, snapshot(JSON), created_at |

### Agent 系统
| 表名 | 用途 |
|------|------|
| `AgentLog` | Agent 操作日志（type, reason, result, student_id, model_id） |
| `AgentTask` | 背景任务状态（type, status, priority, result, scheduled_at） |
| `AgentThought` | Agent 推理记录（trigger, summary, actions_taken, next_focus） |
| `AgentSchedule` | Agent 定时唤醒计划（schedule expression） |
| `ScheduleConfig` | 每学生 cron 计划配置 |

### 学习工具
| 表名 | 用途 |
|------|------|
| `MistakeBook` | 错题本（subject, topic, error_type, root_cause, reviewed） |
| `ExamScore` | 考试成绩（subject, exam_name, score, full_score） |
| `Resource` | 上传资源（parsed_text, source_email, FTS5 索引） |
| `ResourceFTS` | FTS5 虚拟表（全文搜索 Resource.parsed_text） |

### 内容与通信
| 表名 | 用途 |
|------|------|
| `FileIndex` | 云盘文件索引（rel_path, size, mime, tags, parsed_text） |
| `DriveFile` | 云盘同步文件 |
| `Relay` | 图片中继（guardian_id, student_id, image_data, read_flag） |
| `ChatHistory` | 聊天历史（user_id, role, content, thinking） |
| `MessageLog` | 通知消息（user_id, content, ai_generated） |

### 系统
| 表名 | 用途 |
|------|------|
| `Settings` | KV 配置（key, value, encrypted, delete_flag） |
| `RedeemCode` | 兑换码 |
| `OtpCode` | OTP 验证码 |
| `ClientActivity` | 客户端行为上报（app_name, window_title, duration） |
| `StudentBlackRoom` | 设备锁定状态（reason, entered_at, exit_condition） |
| `StudentGoal` | 学生考试目标（exam_type, exam_date, school_progress, notes） |

**所有表通用特征**: UUID 主键、delete_flag 软删除、create_time/update_time Unix 毫秒时间戳、`foreign_keys=OFF`（应用层保证一致性）。

---

## 8. 认证体系

### 三种鉴权中间件 (`middleware/auth.middleware.ts`)
```
requireAuth()          → 有 sync-token 即可
requireAdmin()         → sync-token + role === 'admin'（严格相等）
requireAdminOrGuardian() → sync-token + role IN ('admin','guardian')
```

### 用户角色
- **student**: 学生，由 guardian 创建，只能访问自己的数据
- **guardian**: 家长，可以访问所有绑定学生的数据
- **admin**: 管理员（当前生产 DB 无 admin 用户）

### 访问控制模式 (`canAccessStudent`)
```typescript
// 学生 → 自己; 监护人 → 必须是 DB 中 guardian_id 匹配的学生
function canAccessStudent(req: AuthRequest, studentId: string): boolean {
  if (req.userRole === 'student') return req.userId === studentId
  const db = getDB()
  const linked = db.prepare(
    'SELECT id FROM User WHERE id = ? AND guardian_id = ? AND delete_flag = 0'
  ).get(studentId, req.userId!)
  return !!linked
}
```

### OAuth 流程 (未在现有文档记录)
- **Anthropic PKCE**: `/api/oauth/anthropic/start` → 浏览器重定向到 Anthropic 授权页 → `/api/oauth/anthropic/callback` 接收 code → 换 token → 保存到 Settings 表
- **OpenAI 设备码**: `POST /api/oauth/openai/start` → 返回 device_code + 验证 URL → 轮询 `GET /api/oauth/openai/status/:flowId`
- 实现文件: `services/oauth.service.ts` (247 行)

---

## 9. Agent 子系统

### 两阶段架构
```
┌────────────┐   buildPlannerPrompt()   ┌──────────────┐
│  Planner   │ ←───────────────────── │ AgentContext  │
│  (callAI)  │   学生全量上下文 JSON    │ (context.ts)  │
└─────┬──────┘                         └──────────────┘
      │ parsePlan() → PlannedTask[]
      ▼
┌──────────────┐
│  Executor ×8 │  每种任务类型一个执行器
│  (callAI)    │  产生 ExecutorResult
└──────┬───────┘   包含 SideEffect (BotMessage / SetSchedule)
       │
       ▼  applySideEffect() → 存入 MessageLog → SSE 推送
```

### PlannedTaskType 枚举 (planner.ts)
```
push_suggestion    → 学习建议推送
daily_review       → 每日回顾
weakness_quiz      → 薄弱知识点测验
resource_brief     → 资源推荐简介
set_schedule       → 设置定时计划
overdue_analysis   → 过期任务分析
proactive_encouragement → 主动鼓励
exam_alert         → 考试提醒
no_action          → 不操作
```

### 自主循环 (`runAutonomousCycle`)
1. **免打扰检查**: `isDoNotDisturb()` — 时间段配置内跳过
2. **去重锁**: `processingStudents` Set — 同一学生不允许并发
3. **Planner 判是否需要动作**: Planner 输出 PlannedTask[]，过滤 no_action
4. **消息限制**: 每次循环最多 1 条 BotMessage（防刷屏）
5. **并行执行**: `Promise.all(activeTasks.map(t => runExecutorTask(t, ...)))`

### 调度器 (`scheduler.ts`)
- **实现**: `node-cron` per-student cron jobs
- **存储**: `ScheduleConfig` 表 (id, student_id, cron_expression, description)
- **心跳补偿**: `compensateMissedTasks()` — 恢复超过 1 小时未触发的任务
- **启动**: `AgentEngine.init()` → `scheduler.init()` → `loadActiveSchedules()`

---

## 10. 前后端交互

### SSE 流式聊天 (`chat.routes.ts` + `agent/index.ts`)
```
GET /api/chat/stream?message=...&studentId=...
  → 设置 SSE headers (text/event-stream, no-cache)
  → AgentEngine.streamChatResponse()
  → while (true):
      callAI(messages, tools) → OpenAI chat/completions
      → 如果有 tool_calls → 执行工具 → 结果回填 messages
      → 如果没有 tool_calls → 流式返回 content → break
      → 超过 5 轮 → 返回错误 "工具调用轮次超限"
  → Keep-alive: 每 15s ping
```
**RateLimit**: 20 req/min (超过返回 `{ success: false, error: '发送太频繁，请稍等片刻再试' }`)

### 前端 API 层 (`frontend/src/api/http.ts`)
- **authApi**: login/register/setupPassword/changePassword/resetToken/adminPasswordCheck/verifyOtp/sendOtp
- **settingsApi**: AI 配置/模型列表/Wolfram/Vision
- **planApi**, **agentApi**, **chatApi**, **srsApi**, **homeworkApi**, **driveApi**, **todoApi**...
- 统一模式: `fetchApi(url, { method, body })` + 自动附带 `x-sync-token`
- Workspace 代理检测: 自动判断本地/远程路径

### 前端路由懒加载 (`App.tsx`)
```
/ → Landing
/login → Login
/dashboard → Dashboard
/chat → Chat (含 Markdown/KaTeX/Mermaid)
/config → Config (AI/搜索/Wolfram/Vision/备份 五个 tab)
/plans, /todo, /srs, /progress, /homework, /mistakes, /grades
/accounts, /drive, /screentime, /download, /agent-logs, /agent-tasks
/setup, /join, /docs, /quick
/admin (仅 admin 角色)
/student → StudentHome
/student/chat → StudentChat (无侧栏全屏聊天)
```

---

## 11. 已知陷阱 & 排障

### 致命陷阱
1. **改 ENCRYPT_SECRET 会让所有已存 API Key 无法解密** — Settings 表中的 apiKey 用 AES-256-CBC 加密，密钥变了就废了。生产密钥在 systemd service 文件中
2. **SQLite foreign_keys=OFF** — 删除 User 不会级联删除关联数据，必须手动处理
3. **processingStudents 死锁** — 如果 agent 周期 panic，student 会被永远锁住。解决：重启服务

### 速率限制速查
| 端点 | 限制 | 窗口 |
|------|------|------|
| `/api/auth/login` | 20 次 | 15 min |
| `/api/auth/register` | 10 次 | 15 min |
| `/api/auth/send-otp` | 10 次 | 15 min |
| `/api/auth/verify-otp` | 10 次 | 15 min |
| `/api/client/screenshot` | 5 次 | 1 min |
| `/api/drive/sync` | 10 次 | 1 min |
| `/api/chat/stream` | 20 次 | 1 min |

### 超时与限制
- `run_python` 工具: 8s 超时 + 512KB stdout 上限 + import 白名单
- `web_search` 工具: Serper 8s 超时 → 降级维基百科 6s 超时
- `callAI()` (agent): 30s 超时
- `describeImage()` (vision): 60s 超时
- `ocrRemote()`: 30s 超时
- `express.json({ limit: '50mb' })` — 超过 50MB 的请求被静默拒绝

### 双记忆系统说明
代码中有**两套**间隔重复算法同时存在：
- **SM-2** (`srs.service.ts`): 用于作业批改发现的薄弱知识点 — grade 0-5 → 更新 interval/ease/reps
- **Ebbinghaus 遗忘曲线** (`sobriety.service.ts`): 用于清醒系统估算遗忘程度 — `retention = e^(-days/(stability*5))`
- 两个系统操作同一张 `KnowledgePoint` 表的不同列（SM-2 写 srs_* 列，Ebbinghaus 只读不写）

### 版本号混乱
- 目录: `1.4` （因为 v1.3 目录已存在）
- package.json: `1.5.0` （实际版本，以这个为准）
- 文档 (README/ARCHITECTURE/API/SCHEMA/USAGE): 均标注 `v1.3` （过时）
- **开发时以 `1.4/server/` 和 `1.4/frontend/` 为源码，`package.json` 的 `1.5.0` 为版本号**

---

## 12. 尚未完成 / 已知缺口

1. **零测试** — 无 test 目录、无测试框架、无 CI
2. **文档过时** — README/ARCHITECTURE/API/SCHEMA/USAGE 均为 v1.3，遗漏 18 条路由 + 12 个服务 + 14 个 AI 工具
3. **Windows 集成已废弃** — 曾部署 OCR Worker + Ollama 视觉模型到 LAN Windows (192.168.1.45)，现已关闭。相关代码回退到本地 tesseract。`ollama-ctl.sh` 和 SSH key (`~/.ssh/personalac_win`) 保留以备将来复用
4. **无 TypeScript strict 之外的质量保障** — 无 lint、无 prettier、无 pre-commit hooks
5. **Python 沙箱白名单** (`python-tool.ts`) 可能不够安全 — 仅靠 import 白名单实现，无进程隔离
6. **SRSItem 表存在但未在 SCHEMA.md 中记录**（可能在 `srs.service.ts` 中使用了不同表名）

---

## 13. 常见操作 Cookbook

### 加一个新路由
1. `server/src/routes/xxx.routes.ts` — 创建 Router + handler
2. `server/src/index.ts` — 加 `app.use('/api/xxx', xxxRoutes)`
3. `frontend/src/api/http.ts` — 加 API 函数封装
4. 重新 build server + 复制 dist 到全局包 + `systemctl --user restart personalac`

### 加一个新 AI 工具
1. `server/src/tools/chat-tools.ts` — 加 `registerTool({ name: '...', ... })`
2. 工具注册是模块级别的副作用，import 即可生效（无需手动注册表）
3. 新工具在 ReAct 循环中自动可用

### 加一个新 Services
1. `server/src/services/xxx.service.ts` — 纯函数/无状态
2. Routes 或 Tools 中 import 调用
3. 如需数据表 → `server/src/database/index.ts` 的 `createTables()` 中加 `CREATE TABLE`

### 查生产日志 / 状态
```bash
journalctl --user -u personalac -f         # 实时日志
systemctl --user status personalac          # 服务状态
curl http://localhost:7575/api/health       # 健康检查
sqlite3 ~/.personalac/personalac.db ".tables"  # 数据表列表
```

### 生产数据库紧急查询
```bash
sqlite3 ~/.personalac/personalac.db "SELECT key, substr(value,1,60) FROM Settings WHERE delete_flag=0"
sqlite3 ~/.personalac/personalac.db "SELECT id, display_name, role FROM User WHERE delete_flag=0"
```
