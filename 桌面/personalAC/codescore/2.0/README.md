# PersonalAC 2.0 — AI 学伴 + 共享白板

PersonalAC 2.0 是一个 AI 驱动的学习平台。核心交互从"聊天框"变为**共享白板**——AI 不再是老师，而是**学伴**（学习同伴）：它在白板旁边看你的操作，适时帮忙，跟学生一起写写画画。

## 产品架构

```
学生端                            家长端
┌──────────────────────┐    ┌─────────────────┐
│  Studying 白板        │    │  指令中心        │
│  ┌────────────────┐   │    │                 │
│  │ 共享白板        │   │    │ "帮小明复习导数" │
│  │ 学生写+AI写     │   │    │ → AI 自动执行   │
│  └────────────────┘   │    │                 │
│  [学伴头像] [聊天面板] │    │ 学生概览 + 报告  │
└──────────────────────┘    └─────────────────┘
```

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Node.js + Express + TypeScript |
| 数据库 | SQLite (better-sqlite3, WAL, FK ON) |
| 前端 | React 18 + MUI v5 + TypeScript |
| 构建 | Vite 5 (前端) / tsc (后端) |
| AI | OpenAI 兼容协议 (OpenAI / Anthropic / DeepSeek / MiniMax...) |

## 快速开始

### 前提条件
- Node.js 20+
- npm 9+

### 本地开发

```bash
# 后端
cd 2.0/server
cp .env.example .env
npm install
npm run dev          # → http://localhost:3000

# 前端
cd 2.0/frontend
npm install
npm run dev          # → http://localhost:5173
```

首次启动后端时，控制台会显示 Sync Token：
```
Sync Token: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

用这个 Token 在浏览器登录。

### 生产构建

```bash
# 构建后端
cd 2.0/server && npm run build   # → dist/

# 构建前端
cd 2.0/frontend && npm run build  # → dist/

# 启动
cd 2.0/server
PORT=7575 DATA_DIR=~/.personalac FRONTEND_DIST=../frontend/dist node dist/index.js
```

## 项目结构

```
2.0/
├── server/src/
│   ├── index.ts              Express 入口
│   ├── database/index.ts     SQLite 初始化 (20 张表)
│   ├── middleware/auth.ts    认证中间件
│   ├── routes/               8 个路由文件
│   ├── services/             7 个服务
│   ├── agent/
│   │   ├── index.ts          AgentEngine (ReAct 循环)
│   │   ├── system-prompt.ts  学伴 system prompt
│   │   ├── context.ts        Agent 上下文
│   │   └── scheduler.ts      Cron 调度
│   └── tools/
│       ├── index.ts          工具注册
│       └── board-tools.ts    11 个 AI 工具
├── frontend/src/
│   ├── App.tsx               SPA 路由
│   ├── api/http.ts           全部 HTTP API
│   ├── pages/
│   │   ├── study/            StudyPage (白板)
│   │   ├── auth/             Login
│   │   └── guardian/         Dashboard / Command / Settings / Students
│   ├── components/
│   │   ├── whiteboard/       白板 + Block 渲染器
│   │   ├── companion/        学伴头像
│   │   └── chat/             SSE 聊天面板
│   └── styles/global.css     设计系统
└── README.md
```

## 核心功能

### 学生端：Studying 白板
- 登录后直接进入白板
- 在板上写文本、数学公式、代码
- 右侧聊天面板与 AI 学伴对话
- AI 能看见白板内容，可以在板上添加提示、出题、画图
- 学伴状态指示器（idle / watching / thinking / writing）

### 家长端：指令中心
- 查看学生概况（学习活跃度、薄弱点、紧迫度）
- 直接给 AI 发文字指令（"帮孩子复习第三章"）
- 指令自动注入学伴 system prompt，AI 在合适时机执行
- 管理学生账户、配置 AI

### AI 工具（11 个）
`read_board` `add_block` `update_block` `delete_block` `add_question`
`get_student_summary` `update_knowledge` `record_learning`
`log_explanation` `manage_todo`

## 与 v1.5 的主要变化

| v1.5 | 2.0 |
|---|---|
| 聊天驱动 | 白板驱动 |
| AI 是老师/导师 | AI 是学伴（同伴） |
| 28 个页面 | 8 个路由 |
| 26 张表 | 20 张表 |
| 22 个 AI 工具 | 11 个 AI 工具 |
| ChatHistory 表 | ChatMessage 表 |
| FK OFF | FK ON |
| 无学伴概念 | 学伴状态机 + 白板感知 |

## API 端点

```
Auth:     POST /api/auth/login, GET /me, GET/POST /students
Board:    GET /api/board, POST /board/blocks, PATCH/DELETE /board/blocks/:id
Companion: GET /api/companion/state
Chat:     POST /api/chat/stream (SSE)
Homework: GET/POST /api/homework
Guardian: GET/POST/DELETE /api/guardian/commands, GET /overview
Settings: GET/POST /api/settings/ai
Health:   GET /api/health
```

所有 API 需要 `x-sync-token` header（除 login 外）。

## License

MIT
