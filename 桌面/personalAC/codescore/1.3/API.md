# PersonalAC v1.3 — API 参考文档

> 本文档覆盖服务端全部 HTTP 接口与 AI Chat 工具（Function Call）的完整规格说明。
>
> **Base URL**：`http://localhost:<PORT>/api`（默认端口见 `.env`）
>
> **认证方式**：除 `POST /api/auth/login` 外，所有接口均需在请求头携带 `x-sync-token`。
>
> **统一响应结构**：
> ```json
> { "success": true, "data": { ... } }
> { "success": false, "error": "错误描述" }
> ```

---

## 目录

- [第一部分：HTTP API](#第一部分http-api)
  - [Auth — 认证与账户管理](#auth--认证与账户管理)
  - [Settings — 系统配置](#settings--系统配置)
  - [Plans — 学习计划](#plans--学习计划)
  - [Agent — 自主代理](#agent--自主代理)
  - [Email — 邮件服务](#email--邮件服务)
  - [Chat — AI 对话](#chat--ai-对话)
  - [Data — 学习数据](#data--学习数据)
  - [Workspace — 文件工作区](#workspace--文件工作区)
  - [Goals — 学习目标](#goals--学习目标)
- [第二部分：Chat 工具（AI Function Call）](#第二部分chat-工具ai-function-call)
- [第三部分：认证体系说明](#第三部分认证体系说明)

---

## 第一部分：HTTP API

---

### Auth — 认证与账户管理

路由前缀：`/api/auth`

---

#### `POST /api/auth/login`

令牌登录，获取当前用户身份信息。

- **需要认证**：否
- **Request Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `syncToken` | `string` | 是 | 访问码（`x-sync-token` 的值） |

- **Response**

```json
{
  "success": true,
  "data": {
    "id": "用户ID",
    "role": "guardian | student",
    "name": "用户名称",
    "syncToken": "访问码"
  }
}
```

- **说明**：纯令牌登录，无密码。前端拿到 `syncToken` 后存入本地，后续请求放入 `x-sync-token` 请求头。

---

#### `GET /api/auth/me`

获取当前登录用户信息。

- **需要认证**：是
- **Request Body**：无
- **Response**

```json
{
  "success": true,
  "data": {
    "id": "用户ID",
    "role": "guardian | student",
    "name": "用户名称",
    "syncToken": "访问码"
  }
}
```

---

#### `POST /api/auth/setup`

监护人初次配置：设置显示名称。

- **需要认证**：是（监护人 token）
- **Request Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `guardianName` | `string` | 是 | 监护人称呼 |

- **Response**

```json
{ "success": true }
```

---

#### `GET /api/auth/students`

列出当前监护人名下的所有学生账户。

- **需要认证**：是（监护人 token）
- **Request Body**：无
- **Response**

```json
{
  "success": true,
  "data": [
    { "id": "学生ID", "name": "学生姓名", "grade": "年级", "syncToken": "学生令牌" }
  ]
}
```

---

#### `POST /api/auth/students`

创建学生账户。若同时传入 `subjects`，会自动为该学生生成一个初始学习计划。

- **需要认证**：是（监护人 token）
- **Request Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | 是 | 学生姓名 |
| `grade` | `string` | 否 | 年级，如"高二" |
| `subjects` | `string[]` | 否 | 科目列表，传入后自动创建学习计划 |

- **Response**

```json
{
  "success": true,
  "data": {
    "id": "学生ID",
    "name": "学生姓名",
    "grade": "高二",
    "syncToken": "学生访问码"
  }
}
```

- **说明**：返回的 `syncToken` 即为学生端登录使用的令牌，应妥善保存。

---

#### `DELETE /api/auth/students/:id`

删除指定学生账户（软删除）。

- **需要认证**：是（监护人 token）
- **Path Params**：`id` — 学生 ID
- **Response**

```json
{ "success": true }
```

---

#### `POST /api/auth/reset-token`

重置当前用户的 `syncToken`（旧令牌立即失效）。

- **需要认证**：是
- **Request Body**：无
- **Response**

```json
{
  "success": true,
  "data": { "syncToken": "新令牌" }
}
```

---

### Settings — 系统配置

路由前缀：`/api/settings`（全部需要认证）

---

#### `GET /api/settings/models`

获取当前 AI provider 支持的可用模型列表。

- **需要认证**：是
- **Response**

```json
{
  "success": true,
  "data": [
    { "id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet" }
  ]
}
```

---

#### `POST /api/settings/ai`

保存 AI provider 配置。

- **需要认证**：是
- **Request Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `provider` | `string` | 是 | 提供商名称，如 `"anthropic"` / `"openai"` |
| `modelId` | `string` | 是 | 模型 ID，如 `"claude-3-5-sonnet-20241022"` |
| `modelName` | `string` | 是 | 模型展示名称 |
| `apiKey` | `string` | 是 | API 密钥 |
| `baseUrl` | `string` | 否 | 自定义接口地址（用于代理或私有部署） |

- **Response**

```json
{ "success": true }
```

---

#### `GET /api/settings/ai`

读取当前已保存的 AI 配置。

- **需要认证**：是
- **Response**

```json
{
  "success": true,
  "data": {
    "provider": "anthropic",
    "modelId": "claude-3-5-sonnet-20241022",
    "modelName": "Claude 3.5 Sonnet",
    "baseUrl": null
  }
}
```

> **注意**：出于安全考虑，响应中不返回 `apiKey` 明文。

---

#### `POST /api/settings/email`

保存邮件接收配置（IMAP）。

- **需要认证**：是
- **Request Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `email` | `string` | 是 | 邮箱地址 |
| `authCode` | `string` | 是 | 邮箱授权码（非登录密码） |
| `imapHost` | `string` | 是 | IMAP 服务器地址，如 `"imap.qq.com"` |
| `imapPort` | `number` | 是 | IMAP 端口，如 `993` |

- **Response**

```json
{ "success": true }
```

---

#### `GET /api/settings/email`

读取当前已保存的邮件配置。

- **需要认证**：是
- **Response**

```json
{
  "success": true,
  "data": {
    "email": "xxx@qq.com",
    "imapHost": "imap.qq.com",
    "imapPort": 993
  }
}
```

---

#### `POST /api/settings/email/test`

测试当前邮件配置是否可以正常连接。

- **需要认证**：是
- **Request Body**：无
- **Response**

```json
{ "success": true, "data": { "message": "连接成功" } }
```

---

### Plans — 学习计划

路由前缀：`/api/plans`（全部需要认证）

---

#### `POST /api/plans`

创建新的学习计划（会将之前 active 的计划归档）。

- **需要认证**：是
- **Request Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | `string` | 是 | 计划名称 |
| `description` | `string` | 否 | 计划详细说明 |
| `subjects` | `string[]` | 是 | 科目列表 |

- **Response**

```json
{
  "success": true,
  "data": {
    "id": "计划ID",
    "title": "高考数学冲刺",
    "subjects": ["数学", "物理"],
    "status": "active"
  }
}
```

---

#### `GET /api/plans/active`

获取当前激活的学习计划。

- **需要认证**：是
- **Response**

```json
{
  "success": true,
  "data": {
    "id": "计划ID",
    "title": "计划名称",
    "description": "...",
    "subjects": ["数学"],
    "status": "active",
    "create_time": 1710000000000
  }
}
```

---

#### `GET /api/plans`

获取当前用户的全部学习计划列表（含已归档）。

- **需要认证**：是
- **Response**

```json
{
  "success": true,
  "data": [
    { "id": "...", "title": "...", "status": "active | archived", "create_time": 1710000000000 }
  ]
}
```

---

### Agent — 自主代理

路由前缀：`/api/agent`（全部需要认证）

---

#### `GET /api/agent/logs`

获取 Agent 执行日志。

- **需要认证**：是
- **Query Params**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `limit` | `number` | 否 | 最多返回条数，默认 50 |

- **Response**

```json
{
  "success": true,
  "data": [
    {
      "id": "日志ID",
      "student_id": "学生ID",
      "action_type": "动作类型",
      "action_detail": "动作详情",
      "trigger_type": "schedule | manual | email",
      "model_used": "claude-3-5-sonnet-20241022",
      "status": "success | failed",
      "error_message": null,
      "create_time": 1710000000000
    }
  ]
}
```

---

#### `GET /api/agent/tasks`

分页查询 Agent 任务列表。

- **需要认证**：是
- **Query Params**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `status` | `string` | 否 | 筛选状态：`pending` / `running` / `completed` / `failed` |
| `page` | `number` | 否 | 页码，默认 1 |
| `pageSize` | `number` | 否 | 每页条数，默认 20 |

- **Response**

```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "id": "任务ID",
        "task_type": "任务类型",
        "student_id": "学生ID",
        "status": "completed",
        "trigger_type": "schedule",
        "input_summary": "输入摘要",
        "output": "执行结果",
        "error": null,
        "started_at": 1710000000000,
        "completed_at": 1710000060000,
        "create_time": 1710000000000
      }
    ],
    "total": 42,
    "page": 1,
    "pageSize": 20
  }
}
```

---

#### `POST /api/agent/run`

手动触发一次 Agent 自主周期（Planner → Executor 完整流程）。

- **需要认证**：是
- **Request Body**：无
- **Response**

```json
{ "success": true, "data": { "message": "Agent 周期执行完毕" } }
```

- **说明**：该接口为同步调用，Agent 完成整个周期后才返回，耗时可能较长。

---

#### `POST /api/agent/report`

手动触发生成当天的学习日报并发送给监护人。

- **需要认证**：是
- **Request Body**：无
- **Response**

```json
{ "success": true, "data": { "message": "日报已生成" } }
```

---

#### `POST /api/agent/dnd`

设置 Agent 勿扰时段（勿扰期间不主动发起任务）。

- **需要认证**：是
- **Request Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `start` | `string` | 是 | 开始时间，格式 `"HH:MM"`，如 `"22:00"` |
| `end` | `string` | 是 | 结束时间，格式 `"HH:MM"`，如 `"08:00"` |

- **Response**

```json
{ "success": true, "data": { "message": "勿扰模式已设置" } }
```

---

#### `DELETE /api/agent/dnd`

清除 Agent 勿扰时段设置。

- **需要认证**：是
- **Request Body**：无
- **Response**

```json
{ "success": true, "data": { "message": "勿扰模式已清除" } }
```

---

### Email — 邮件服务

路由前缀：`/api/email`（全部需要认证）

---

#### `GET /api/email/status`

获取邮件轮询服务的当前运行状态。

- **需要认证**：是
- **Response**

```json
{
  "success": true,
  "data": {
    "running": true,
    "lastChecked": 1710000000000,
    "errorCount": 0
  }
}
```

---

#### `POST /api/email/start`

启动邮件轮询服务（定期检查新邮件并触发 Agent 处理）。

- **需要认证**：是
- **Request Body**：无
- **Response**

```json
{ "success": true, "data": { "message": "邮件轮询已启动" } }
```

---

#### `POST /api/email/stop`

停止邮件轮询服务。

- **需要认证**：是
- **Request Body**：无
- **Response**

```json
{ "success": true, "data": { "message": "邮件轮询已停止" } }
```

---

### Chat — AI 对话

路由前缀：`/api/chat`（全部需要认证）

---

#### `POST /api/chat/send`

发送单条消息，等待完整回复（非流式）。

- **需要认证**：是
- **Request Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | `string` | 是 | 用户消息内容 |

- **Response**

```json
{ "success": true, "data": "AI 的完整回复文本" }
```

---

#### `POST /api/chat/stream`

流式对话接口，使用 **Server-Sent Events (SSE)** 协议，逐 token 实时推送 AI 回复。

- **需要认证**：是
- **Request Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `messages` | `Array<{role, content}>` | 是 | 对话历史，`role` 为 `"user"` 或 `"assistant"` |

- **Response Headers**

```
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

- **SSE 事件格式**

每个 SSE 帧均以 `data: <JSON>\n\n` 格式发送，共四种消息类型：

| 事件类型 | 数据结构 | 说明 |
|----------|----------|------|
| 文字 token | `{ "token": "你好" }` | AI 回复的单个文字片段，客户端拼接后得到完整回复 |
| 工具调用指示 | `{ "tool": "get_student_summary", "display": "正在查询学习状态…" }` | AI 正在调用某个 Chat 工具，`display` 为展示给用户的提示文案 |
| 思考 token | `{ "thinking": "让我先分析一下…" }` | 推理模型（如 claude-3-5-sonnet thinking 模式）的内部思考内容 |
| 结束标志 | `[DONE]`（字符串，非 JSON） | 流结束，客户端应关闭连接 |
| 错误 | `{ "error": "错误信息" }` | 发生异常，流随后关闭 |

- **客户端接入示例**

```typescript
const es = new EventSource('/api/chat/stream')  // 实际用 fetch + ReadableStream

// 接收到 data: {"token":"..."} → 追加到消息气泡
// 接收到 data: {"tool":"...","display":"..."} → 显示工具调用指示器
// 接收到 data: [DONE] → 关闭连接，标记消息完成
```

---

### Data — 学习数据

路由前缀：`/api/data`（全部需要认证）

---

#### `POST /api/data/learning`

手动记录一条学习活动。

- **需要认证**：是
- **Request Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subject` | `string` | 是 | 科目 |
| `topic` | `string` | 是 | 知识点/话题 |
| `duration_minutes` | `number` | 否 | 学习时长（分钟） |
| `score` | `number` | 否 | 评分（0–100） |
| `note` | `string` | 否 | 备注 |

- **Response**

```json
{ "success": true, "data": { "id": "记录ID" } }
```

---

#### `GET /api/data/summary`

查询学习数据统计摘要，支持按时间范围和科目筛选。

- **需要认证**：是
- **Query Params**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `dateFrom` | `number` | 否 | 起始时间戳（ms） |
| `dateTo` | `number` | 否 | 结束时间戳（ms） |
| `subject` | `string` | 否 | 按科目过滤 |

- **Response**

```json
{
  "success": true,
  "data": {
    "totalSessions": 12,
    "totalMinutes": 360,
    "bySubject": {
      "数学": { "sessions": 8, "minutes": 240 }
    },
    "records": [ { "id": "...", "subject": "数学", "topic": "...", "record_date": 1710000000000 } ]
  }
}
```

---

### Workspace — 文件工作区

路由前缀：`/api/workspace`（全部需要认证）

Agent 操作文件时使用此接口组，所有路径均为相对于工作区根目录的相对路径。

---

#### `POST /api/workspace/write`

写入文件（不存在则创建，存在则覆盖）。

- **需要认证**：是
- **Request Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `relativePath` | `string` | 是 | 相对路径，如 `"notes/数学.md"` |
| `content` | `string` | 是 | 文件内容 |

- **Response**

```json
{ "success": true }
```

---

#### `GET /api/workspace/read`

读取文件内容。

- **需要认证**：是
- **Query Params**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | 是 | 文件相对路径 |

- **Response**

```json
{ "success": true, "data": { "content": "文件内容字符串" } }
```

---

#### `GET /api/workspace/list`

列出目录内容。

- **需要认证**：是
- **Query Params**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | 否 | 目录相对路径，默认为根目录 `""` |

- **Response**

```json
{
  "success": true,
  "data": [
    { "name": "notes", "type": "directory" },
    { "name": "report.md", "type": "file", "size": 1024 }
  ]
}
```

---

#### `DELETE /api/workspace/delete`

删除文件或目录。

- **需要认证**：是
- **Query Params**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | 是 | 目标相对路径 |

- **Response**

```json
{ "success": true }
```

---

#### `GET /api/workspace/stats`

获取工作区磁盘使用统计。

- **需要认证**：是
- **Response**

```json
{
  "success": true,
  "data": {
    "totalFiles": 23,
    "totalSizeBytes": 102400
  }
}
```

---

#### `POST /api/workspace/cleanup-temp`

清理工作区临时文件（`temp/` 目录）。

- **需要认证**：是
- **Request Body**：无
- **Response**

```json
{ "success": true, "data": { "deletedCount": 5 } }
```

---

### Goals — 学习目标

路由前缀：`/api/goals`（全部需要认证）

监护人和学生均可操作。若当前 token 为监护人，系统会自动解析到其名下主要学生。

---

#### `GET /api/goals`

获取当前学生的最新学习目标。

- **需要认证**：是
- **Response**

```json
{
  "success": true,
  "data": {
    "id": "目标ID",
    "student_id": "学生ID",
    "exam_type": "高考",
    "exam_date": 1748000000000,
    "school_progress": "高三上学期，已完成必修1-4",
    "guardian_notes": "数学要重点加强",
    "update_time": 1710000000000
  }
}
```

若尚未设置目标，`data` 为 `null`。

---

#### `POST /api/goals`

创建或更新学习目标（已有记录则更新，没有则新建）。

- **需要认证**：是
- **Request Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `examType` | `string` | 否 | 考试类型，如 `"高考"` / `"中考"` / `"期末"` |
| `examDate` | `number` | 否 | 考试日期时间戳（ms） |
| `schoolProgress` | `string` | 否 | 当前学校进度说明 |
| `guardianNotes` | `string` | 否 | 监护人备注，会注入 AI 系统提示 |

- **Response**

```json
{ "success": true }
```

---

## 第二部分：Chat 工具（AI Function Call）

以下工具通过 `chat-tools.ts` 注册，在 AI 回复过程中自动调用。工具均在服务端执行，客户端通过 SSE 事件 `{ "tool": "<name>", "display": "..." }` 感知调用发生。

所有工具的执行上下文包含 `ToolContext`：

```typescript
interface ToolContext {
  userId: string      // 当前登录用户ID（可能是监护人）
  studentId: string   // 实际操作的学生ID（监护人时自动解析）
}
```

---

### 1. `get_student_summary`

**描述**：获取学生当前学习状态综合摘要。在回答涉及学习进度、推荐复习内容、给出建议前，AI 必须先调用此工具。

**输入参数**：无

**查询内容**：
- 当前激活的学习计划（`Plan` 表）
- 置信度最低的前 10 个知识点（`KnowledgePoint` 表，按 `confidence ASC`）
- 最近 7 天学习记录条数（`LearningRecord` 表）

**返回值格式**：

```json
{
  "activePlan": {
    "title": "高考数学冲刺",
    "subjects": ["数学", "物理"]
  },
  "weakPoints": [
    {
      "topic": "换元积分法",
      "subject": "数学",
      "confidence": 42,
      "estimatedRetention": 35,
      "daysSinceReview": 8,
      "rootCause": "不理解为什么要换元",
      "workedMethods": ["具体数值例子"],
      "failedMethods": ["公式推导"],
      "prerequisiteGaps": [
        { "topic": "复合函数", "subject": "数学", "confidence": 55 }
      ]
    }
  ],
  "sessionsThisWeek": 5
}
```

| 字段 | 说明 |
|------|------|
| `confidence` | 掌握置信度（0–100） |
| `estimatedRetention` | 基于遗忘曲线估算的当前记忆保留率（%） |
| `daysSinceReview` | 距上次练习天数 |
| `rootCause` | 历史记录的卡点根因（如有） |
| `workedMethods` | 过去讲解有效的方法 |
| `failedMethods` | 过去讲解无效的方法 |
| `prerequisiteGaps` | 掌握度 < 70% 的前置知识点 |

---

### 2. `update_knowledge`

**描述**：更新学生某个知识点的掌握状态，并根据置信度动态调整记忆稳定性（Stability）。

**调用规则**：
- 监护人上传成绩/试卷 → `source="guardian_upload"`
- Agent 出题验证通过 → `source="agent_observed"`，置信度上调
- 学生声称"我会了"但未验证 → **不调用**，先出题
- 发现持续错误 → 同时填写 `error_type` 和 `root_cause`

**输入参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `topic` | `string` | 是 | 知识点名称，尽量精确 |
| `subject` | `string` | 是 | 科目 |
| `confidence` | `number` | 是 | 掌握置信度 0.0–1.0 |
| `source` | `"guardian_upload" \| "agent_observed" \| "student_report"` | 是 | 数据来源 |
| `evidence` | `string` | 否 | 判断依据描述 |
| `error_type` | `string` | 否 | 错误类型，如 `"计算错误"` / `"概念混淆"` |
| `root_cause` | `string` | 否 | 根因分析：学生具体卡在哪里 |

**写入数据库**：`KnowledgePoint` 表，更新或插入记录，同时更新 `stability`（记忆稳定性）、`error_types`（错误类型频次 JSON）、`root_cause`、`last_practiced`。

Stability 更新规则：
- `confidence > 0.65` → `stability = min(prevStability × 1.8 + 1, 60)`（记忆巩固）
- `confidence ≤ 0.65` → `stability = max(prevStability × 0.5, 0.5)`（记忆衰减）

**返回值**：

```
"已记录：数学·换元积分法 → 42%，来源：Agent验证，错误：步骤遗漏，根因：不理解换元目的"
```

---

### 3. `set_plan`

**描述**：设置或更新学生的学习计划。监护人首次配置或变更学习方向时调用。调用后旧的 `active` 计划自动归档。

**输入参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | `string` | 是 | 计划名称，如 `"高考数学冲刺"` |
| `description` | `string` | 否 | 详细说明 |
| `subjects` | `string[]` | 是 | 科目列表，如 `["数学", "物理", "化学"]` |

**写入数据库**：
1. `Plan` 表：将该学生所有 `status='active'` 的计划设为 `'archived'`
2. `Plan` 表：插入新计划，`status='active'`

**返回值**：

```
"学习计划已设置：《高考数学冲刺》，科目：数学、物理、化学"
```

---

### 4. `record_learning`

**描述**：从对话中提取到学习信息（学了什么、多久）时调用，记录一次学习活动。

**输入参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subject` | `string` | 是 | 科目 |
| `topic` | `string` | 是 | 知识点/话题 |
| `duration_minutes` | `number` | 否 | 学习时长（分钟），不确定时填 0 |
| `score` | `number` | 否 | 评分（0–100），有则填 |
| `note` | `string` | 否 | 备注，如 `"学生提到这部分很难"` |

**写入数据库**：`LearningRecord` 表，插入一条记录。

**返回值**：

```
"已记录学习活动：数学·换元积分法，时长 30 分钟，得分 85"
```

---

### 5. `log_explanation`

**描述**：记录一次"讲解-反馈"闭环：AI 用了什么方法讲解，学生是否理解了。每次换方法重讲可追加多条记录（最多保留最近 20 条）。

**调用时机**：
- 学生明确表示听懂了 → `understood=true`
- 学生表示没懂、继续追问或答题仍出错 → `understood=false`，填 `root_cause`
- **不要每次对话都调用**，只在有明确讲解-反馈闭环时记录

**输入参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `topic` | `string` | 是 | 知识点名称 |
| `subject` | `string` | 是 | 科目 |
| `method` | `string` | 是 | 本次解释使用的方法，如 `"公式推导"` / `"类比生活场景"` / `"反例"` |
| `understood` | `boolean` | 是 | 学生是否理解 |
| `root_cause` | `string` | 否 | 若未理解，学生具体卡住的原因 |
| `note` | `string` | 否 | 其他观察 |

**写入数据库**：`KnowledgePoint.explanation_log`（JSON 数组追加），若 `root_cause` 不为空则同时更新 `KnowledgePoint.root_cause`。若知识点记录不存在则自动创建（`confidence=0.5`）。

**返回值**：

```
"已记录：数学·换元积分法，方法"类比生活场景"→ 理解"
"已记录：数学·换元积分法，方法"公式推导"→ 未理解（不清楚为什么要换元）"
```

---

### 6. `link_prerequisite`

**描述**：记录知识点之间的前置依赖关系。当判断学生在知识点 B 上卡住的根因是知识点 A 没学好时调用。记录后建议立即调用 `check_prerequisites` 确认前置状态。

**输入参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `topic` | `string` | 是 | 当前卡住的知识点（B） |
| `subject` | `string` | 是 | B 所属科目 |
| `requires_topic` | `string` | 是 | 前置知识点（A） |
| `requires_subject` | `string` | 是 | A 所属科目（通常与 `subject` 相同） |
| `reason` | `string` | 否 | 为什么判断这是前置依赖 |

**写入数据库**：`KnowledgePoint.prerequisites`（JSON 数组追加 `{topic, subject}`），若知识点不存在则自动创建。不重复添加已有的依赖关系。

**返回值**：

```
"已记录依赖：数学·换元积分法 → 需要 数学·复合函数（学生卡在换元对象的选择上）。前置状态：掌握度 55%（不足，建议先补）"
```

---

### 7. `check_prerequisites`

**描述**：查询某知识点的所有前置依赖及其当前掌握情况，辅助 AI 决定是"先补前置"还是"直接讲当前知识点"。

**输入参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `topic` | `string` | 是 | 知识点名称 |
| `subject` | `string` | 是 | 所属科目 |

**读取数据库**：`KnowledgePoint.prerequisites` 字段，逐个查询各前置知识点的 `confidence`。

**返回值格式**：

```json
{
  "topic": "换元积分法",
  "subject": "数学",
  "prerequisites": [
    {
      "topic": "复合函数",
      "subject": "数学",
      "confidence": 55,
      "status": "掌握一般",
      "needsWork": true,
      "rootCause": "..."
    }
  ],
  "recommendation": "发现 1 个前置不足：数学·复合函数（掌握一般），建议先补这些再讲 换元积分法。"
}
```

| `status` 值 | 条件 |
|-------------|------|
| `"掌握良好"` | `confidence >= 70` |
| `"掌握一般"` | `50 ≤ confidence < 70` |
| `"明显薄弱"` | `confidence < 50` |
| `"无记录"` | 数据库中无该知识点 |

若无前置依赖，直接返回字符串 `"数学·换元积分法 无前置依赖。"`

---

### 8. `get_sobriety`

**描述**：获取学生完整的"清醒视角"快照（SobrietySnapshot），包含考试倒计时、高遗忘风险知识点、持续卡点、学科分布漂移、上次未理清的悬念。仅在 system prompt 中的清醒视角摘要需要展开细节时调用，避免不必要的调用。

**输入参数**：无

**读取来源**：`sobriety.service` — `getOrRefreshSnapshot(studentId, 5min缓存)`

**返回值格式**（完整 SobrietySnapshot JSON）：

```json
{
  "generatedAt": 1710000000000,
  "examCountdown": {
    "examType": "高考",
    "examDate": 1748000000000,
    "daysRemaining": 45
  },
  "highForgettingRisk": [
    {
      "topic": "换元积分法",
      "subject": "数学",
      "estimatedRetention": 28,
      "daysSinceReview": 12,
      "confidence": 42
    }
  ],
  "persistentBlocks": [
    {
      "topic": "换元积分法",
      "subject": "数学",
      "rootCause": "不理解为什么要换元",
      "failedMethods": ["公式推导"],
      "attemptCount": 3
    }
  ],
  "subjectDrift": {
    "recentFocus": ["语文", "英语"],
    "neglected": ["数学", "物理"]
  },
  "unresolvedHooks": []
}
```

---

## 第三部分：认证体系说明

### `x-sync-token` 认证方案

PersonalAC 采用**基于令牌的无密码认证**，所有 HTTP 请求（除登录接口外）需在请求头中携带：

```
x-sync-token: <token值>
```

### 如何获取 Token

1. **首次启动**：服务器首次运行时会在终端打印初始监护人 token，格式如：
   ```
   ✅ 初始访问码：pac_xxxxxxxxxxxx
   ```
2. **Config 页面**：登录后可在前端"设置 → 配置"页面查看或重置 token。
3. **学生 token**：通过 `POST /api/auth/students` 创建学生时，响应中包含学生专属 token。

### 令牌类型

| 类型 | 角色 | 权限 |
|------|------|------|
| 监护人 token | `role: "guardian"` | 可管理学生账户、修改系统配置（AI/邮件）、查看所有学生数据 |
| 学生 token | `role: "student"` | 仅能访问自己的数据，不可管理账户或修改系统配置 |

### 监护人操作学生数据的机制

当监护人携带监护人 token 与 AI 对话或调用 goals/data 等接口时，系统通过以下机制透明地将操作路由到学生数据：

```typescript
// 服务端 ToolContext 构建逻辑（伪代码）
const toolContext: ToolContext = {
  userId: guardianId,           // 登录用户（监护人）
  studentId: resolveStudent()   // 自动解析为主要学生ID
}
```

- `goals.routes.ts` 中的 `resolveStudentId()` 函数：若 `role === "guardian"` 则调用 `getPrimaryStudentId()` 获取其名下主学生 ID
- Chat 工具的 `ToolContext` 同理，监护人和学生使用同一套工具，但写入的是学生的数据行

**典型场景**：监护人告知 AI "孩子今天数学考了 85 分"→ AI 调用 `update_knowledge`，`ctx.studentId` 指向学生，数据正确写入学生知识点记录。

### Token 安全建议

- Token 应视为密码，不应出现在公开 URL 中
- 需要更换时调用 `POST /api/auth/reset-token`，旧 token 立即失效
- 学生 token 与监护人 token 完全独立，互不影响

---

*文档版本：v1.3 | 最后更新：2026-05-09*
