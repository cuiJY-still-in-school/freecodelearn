# PersonalAC

个性化学习辅助系统。AI 驱动的学习跟踪、知识点分析和主动提醒，支持本地运行和服务器部署两种模式。

---

## 两种版本

|  | 本地版 | 服务器版 |
|---|---|---|
| 安装方式 | `npm install -g personalac` | Node 直接部署 / Docker |
| 数据存储 | `~/.personalac/` | 服务器磁盘 |
| 访问方式 | `localhost:7575` | 域名 / IP |
| 自唤醒通知 | 系统级推送（OS 通知） | 不支持 |
| 适合场景 | 个人使用 | 自托管、多人部署 |

---

## 本地版

### 安装

需要 Node.js 18+。

```bash
npm install -g personalac
```

### 启动

```bash
personalac
```

首次启动自动创建账号，终端显示 Sync Token，并在浏览器打开登录页。输入 Token 登录后浏览器会记住状态，之后直接访问即可。

### CLI 命令

```
personalac [command] [options]

命令:
  start        启动服务器（默认）
  token        显示登录 Token
  open         在浏览器中打开界面
  status       检查服务器状态和 Token
  version      显示版本号

选项:
  --port, -p <n>    端口号（默认 7575）
  --data, -d <dir>  数据目录（默认 ~/.personalac）
  --no-open         启动时不自动打开浏览器
  --help, -h        显示帮助
  --version, -v     显示版本号
```

**示例：**

```bash
# 启动（默认端口 7575，自动打开浏览器）
personalac

# 自定义端口
personalac --port 8080

# 不打开浏览器
personalac --no-open

# 查看 Token（服务器未运行时也可用）
personalac token

# 检查状态
personalac status
```

### 自唤醒通知

本地版运行时会在后台监控学习活动。如果你在 **08:00–22:00** 之间超过 **90 分钟** 没有打开对话，就会弹出系统通知提醒你学习。

- Linux：使用 `notify-send`（需安装 libnotify）
- macOS：系统通知中心
- Windows：PowerShell Toast 通知

只要你在和 AI 对话，通知就不会打扰你。

### 数据目录

默认存储在 `~/.personalac/`：

```
~/.personalac/
├── personalac.db       # SQLite 数据库（账号、知识点、学习记录）
└── workspace/          # 工作区文件
```

自定义位置：

```bash
personalac --data /path/to/data
```

---

## 使用方法

### 登录

打开浏览器访问 `http://localhost:7575`，输入终端显示的 Sync Token 登录。

**注意**：Sync Token 是你的唯一凭证，相当于密码，请妥善保存。可以随时用 `personalac token` 查看。

### 聊天

登录后直接进入聊天界面，所有功能都通过对话完成：

| 操作 | 说明 |
|---|---|
| 发送消息 | 输入后回车或点击发送 |
| 上传图片 | 点击图片按钮，或直接粘贴截图 |
| 停止生成 | 点击停止按钮或 Ctrl+Enter |
| Shift+Enter | 换行（不发送） |

**极简模式**：访问 `/quick` 路径，全屏无侧边栏的纯聊天界面。

### AI 能做什么

AI 内置工具，能主动操作你的学习数据，无需你手动填表：

- **上传试卷/成绩截图** → AI 自动识别题目和得分，更新知识点掌握度
- **问"我最近哪里薄弱"** → AI 查询数据库，结合遗忘曲线给出分析
- **说"我学了 XX"** → AI 会出题验证，答对后才记录为掌握
- **监护人发送成绩数据** → AI 以高可信度记录，来源标注为"监护人上传"

### 首次配置

登录后前往**配置**页面，填入 AI 接口信息：

**OpenAI 兼容接口**（OpenAI / DeepSeek / Moonshot / 本地 Ollama 等）：
- Base URL：如 `https://api.deepseek.com/v1`
- Model ID：如 `deepseek-chat`
- API Key：你的 Key

**Anthropic 接口**（Claude 系列）：
- Base URL：`https://api.anthropic.com/anthropic`
- Model ID：如 `claude-opus-4-7`
- API Key：sk-ant-... 开头的 Key

---

## 服务器版

### 部署

```bash
cd codescore/1.3

# 安装依赖
cd server && npm install
cd ../frontend && npm install

# 构建前端
cd frontend && npm run build

# 启动
cd server && npm start
```

终端显示 Sync Token，用于首次登录。

### 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `PORT` | 监听端口 | `3000` |
| `DATA_DIR` | 数据目录 | `./data` |
| `CORS_ORIGIN` | 允许的前端来源 | `http://localhost:5173` |
| `FRONTEND_DIST` | 前端静态文件目录 | `../frontend/dist` |

### pac CLI（本地 Workspace 代理）

服务器版支持 `pac` CLI，将工作区文件存在用户本机而不占服务器磁盘：

```bash
# 从服务器安装
curl -fsSL http://your-server/cli/install.sh | sh

# 登录
pac login http://your-server

# 启动本地代理（在 127.0.0.1:7474 运行）
pac start
```

前端自动检测本地代理，优先使用本地存储。

---

## Agent 工作原理

PersonalAC 的 AI 采用 **ReAct 框架**（Reason + Act）：

```
用户发消息
    │
    ▼
AI 思考：需要调用哪些工具？
    │
    ├─ get_student_summary  ← 查学习状态、薄弱点、本周活动
    ├─ update_knowledge     ← 更新知识点掌握度（含遗忘曲线）
    ├─ set_plan             ← 设置/更新学习计划
    └─ record_learning      ← 记录学习活动
    │
    ▼
工具执行完毕，AI 组织结果流式回复
```

**知识点置信度模型**：每个知识点有 `confidence`（掌握度）和 `stability`（记忆稳定性）。复习成功时 stability 增长，遗忘时 stability 下降。AI 计算 `estimatedRetention = e^(-days / stability×5)` 来估计当前记忆留存率。

**数据可信度来源**：
- `guardian_upload`：监护人上传的成绩数据，最可信
- `agent_observed`：AI 出题后学生当场验证
- `student_report`：学生自报（不信任，AI 会出题验证）

背景 Agent 还会定时触发：
- 每日学习回顾
- 薄弱点专项练习
- 学习报告推送

---

## 开发

```bash
# 本地版：重新构建
cd codescore/local
npm run build       # 编译服务端 + 构建前端，复制到 dist/ 和 public/
personalac          # 直接运行

# 服务器版：开发模式
cd codescore/1.3/server && npm run dev
cd codescore/1.3/frontend && npm run dev
```

---

## 版本历史

- **v1.3** — Web 服务版，Tool Use / ReAct 框架，图片上传，知识点遗忘曲线，自唤醒通知，SSE 流式对话，pac CLI
- **v1.2** — Electron 桌面版
