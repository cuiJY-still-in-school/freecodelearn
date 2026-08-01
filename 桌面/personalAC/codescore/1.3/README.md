# PersonalAC v1.3

个性化学习辅助系统。基于 AI Agent 的学习管理平台，支持多端 Web 访问、云端配置同步、邮件资源自动归档和主动学习推送。

---

## 目录

- [架构概览](#架构概览)
- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [生产部署](#生产部署)
- [环境变量](#环境变量)
- [API 参考](#api-参考)
- [开发指南](#开发指南)
- [升级说明](#升级说明)

---

## 架构概览

```
personalac/
├── server/          Node.js + Express 后端服务
│   ├── src/
│   │   ├── agent/       AI Agent 核心（Planner + Executor）
│   │   ├── database/    SQLite 数据层（含 FTS5 全文索引）
│   │   ├── services/    业务服务层（Auth / Settings / Email 等）
│   │   ├── routes/      REST API 路由
│   │   ├── middleware/  认证中间件
│   │   └── index.ts     服务入口
│   ├── .env.example
│   └── Dockerfile
├── frontend/        React + Vite 前端
│   └── src/
│       ├── api/         HTTP 请求层
│       ├── pages/       页面组件
│       └── components/  公共组件
├── docker-compose.yml
├── nginx.conf
└── deploy.sh
```

**技术栈**

| 层 | 技术 |
|---|---|
| 后端运行时 | Node.js 20 + TypeScript |
| Web 框架 | Express 4 |
| 数据库 | SQLite (better-sqlite3) + FTS5 |
| AI 调用 | 兼容 OpenAI 协议（可对接任何 OpenAI 兼容接口） |
| 邮件 | IMAP 轮询（ImapFlow + MailParser） |
| 前端 | React 18 + Vite 5 + TypeScript |
| 部署 | Docker + Nginx |

---

## 功能特性

- **AI 对话** — 直接与配置的 AI 模型对话，支持 Markdown 渲染
- **学习方向管理** — 设置当前学习目标和科目，AI Agent 据此生成个性化内容
- **Agent 主动任务** — 自动生成每日回顾、薄弱点测验、资源简报
- **邮件资源归档** — IMAP 轮询，自动解析附件并注册为学习资源
- **全文检索** — SQLite FTS5 索引资源内容，秒级搜索
- **云端配置** — 所有配置存储在数据库，多端登录即用
- **Sync Token 登录** — 无密码体系，用 Token 实现安全跨设备访问

---

## 快速开始

### 前提条件

- Node.js 20+
- npm 9+

### 本地开发

**启动后端**

```bash
cd server
cp .env.example .env
# 编辑 .env，至少修改 ENCRYPT_SECRET
npm install
npm run dev
```

首次启动后，控制台会输出：

```
====================================
  PersonalAC v1.3
  http://localhost:3000
  Sync Token: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
====================================
```

**记录 Sync Token，登录时使用。**

**启动前端**

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173，使用 `superadmin` 和控制台显示的 Sync Token 登录。

---

## 生产部署

### 方式一：Docker Compose（推荐）

```bash
# 1. 克隆或上传代码到服务器

# 2. 初始化配置
cp server/.env.example server/.env
# 必须修改以下两项：
#   ENCRYPT_SECRET=<32位以上随机字符串>
#   CORS_ORIGIN=https://你的域名

# 3. 一键部署
chmod +x deploy.sh
./deploy.sh
```

部署后通过日志查看 Sync Token：

```bash
docker compose logs server | grep "Sync Token"
```

### 方式二：手动部署

**1. 构建前端**

```bash
cd frontend
npm ci
npm run build
# 产物在 frontend/dist/
```

**2. 构建后端**

```bash
cd server
npm ci
npm run build
# 产物在 server/dist/
```

**3. 启动服务**

```bash
cd server
cp .env.example .env
# 编辑 .env

# 使用 PM2 管理进程（推荐）
npm install -g pm2
pm2 start dist/index.js --name personalac
pm2 save
pm2 startup
```

**4. 配置 Nginx**

将前端 `dist/` 作为静态目录，API 反向代理到 `:3000`：

```nginx
# 参考项目根目录的 nginx.conf
```

### HTTPS 配置（Let's Encrypt）

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d 你的域名
```

---

## 环境变量

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3000` | 服务监听端口 |
| `DATA_DIR` | `./data` | 数据目录（SQLite + Workspace） |
| `ENCRYPT_SECRET` | *(必填)* | API Key 加密密钥，生产环境务必修改 |
| `CORS_ORIGIN` | `http://localhost:5173` | 允许的前端来源 |
| `NODE_ENV` | `development` | 运行环境 |

---

## API 参考

所有 API 路径以 `/api` 开头。除登录接口外，均需在请求头中携带：

```
x-sync-token: <your-sync-token>
```

### 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/login` | 登录，body: `{ username, syncToken }` |
| GET | `/api/auth/me` | 获取当前用户信息 |
| POST | `/api/auth/reset-token` | 重置 Sync Token |

### AI 配置

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/settings/models` | 从 models.dev 获取模型列表 |
| POST | `/api/settings/ai` | 保存 AI 配置（provider/modelId/apiKey/baseUrl） |
| GET | `/api/settings/ai` | 获取当前 AI 配置 |

### 邮件

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/settings/email` | 保存邮件配置 |
| POST | `/api/settings/email/test` | 测试 IMAP 连接 |
| GET | `/api/email/status` | 获取轮询状态 |
| POST | `/api/email/start` | 启动邮件轮询 |
| POST | `/api/email/stop` | 停止邮件轮询 |

### 学习方向

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/plans` | 创建学习方向 |
| GET | `/api/plans/active` | 获取当前活跃方向 |
| GET | `/api/plans` | 获取所有方向列表 |

### Agent

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/agent/logs` | 获取 Agent 执行日志，`?limit=50` |
| GET | `/api/agent/tasks` | 获取任务列表，`?status=completed&page=1` |
| POST | `/api/agent/run` | 手动触发 Agent 周期 |
| POST | `/api/agent/report` | 触发主动报告 |
| POST | `/api/agent/dnd` | 设置勿扰时段，body: `{ start, end }` (HH:MM) |
| DELETE | `/api/agent/dnd` | 清除勿扰时段 |

### AI 对话

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/chat/send` | 发送消息，body: `{ message }` |

---

## 开发指南

### 目录结构说明

```
server/src/
├── agent/
│   ├── index.ts       AgentEngine 主类，handleEvent / runAutonomousCycle
│   ├── planner.ts     LLM 规划层，生成 PlannedTask[]
│   ├── executors.ts   执行器映射（daily_review / weakness_quiz 等）
│   ├── scheduler.ts   cron 定时任务管理
│   └── context.ts     上下文构建（聚合用户数据供 LLM 使用）
├── database/
│   └── index.ts       数据库初始化、建表、FTS5 索引
├── services/
│   ├── auth.service.ts       用户登录、Sync Token 管理
│   ├── settings.service.ts   AI/Email 配置，AES-256-CBC 加密
│   ├── email.service.ts      IMAP 轮询、附件解析
│   ├── plan.service.ts       学习方向 CRUD
│   ├── data.service.ts       学习记录、知识点更新
│   ├── resource.service.ts   资源管理
│   ├── workspace.service.ts  文件系统操作
│   └── notify.service.ts     消息记录（1.3 无 Bot，写入 MessageLog）
├── routes/            各功能路由文件（与 services 一一对应）
├── middleware/
│   └── auth.middleware.ts    Token 验证，注入 req.userId
└── index.ts           Express 应用入口
```

### 添加新路由

1. 在 `services/` 添加业务逻辑
2. 在 `routes/` 添加路由文件，使用 `requireAuth` 中间件
3. 在 `src/index.ts` 注册路由：`app.use('/api/xxx', xxxRoutes)`
4. 在前端 `src/api/http.ts` 添加对应 API 函数

### 数据库迁移

目前采用 `CREATE TABLE IF NOT EXISTS` 方式自动建表。如需修改表结构，需手动 ALTER TABLE 或删除数据库重建。生产环境建议在 `initDatabase()` 中加迁移逻辑。

---

## 升级说明

### 从 v1.2 升级

v1.2 使用 Electron 桌面应用，v1.3 完全迁移为 Web 服务。

**数据迁移**

v1.2 的 SQLite 数据库位于 Electron userData 目录（通常 `~/.config/personalac/personalac.db`），可直接复制到 v1.3 的 `DATA_DIR` 目录使用，表结构完全兼容，v1.3 启动时会自动创建新增的 `User` 和 `ResourceFTS` 表。

```bash
# Linux
cp ~/.config/personalac/personalac.db /path/to/data/personalac.db

# macOS
cp ~/Library/Application\ Support/personalac/personalac.db /path/to/data/personalac.db
```

**AI/邮件配置**

v1.2 使用 Electron `safeStorage` 加密，v1.3 使用 AES-256-CBC。若从 v1.2 迁移数据库，Settings 表中的加密字段可能无法解密，需要在系统配置页重新填写 API Key 和邮件授权码。

---

## License

MIT
