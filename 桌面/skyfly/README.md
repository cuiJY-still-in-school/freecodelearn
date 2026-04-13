SkyFly - AI-Powered Automation Tool

SkyFly 是一款 AI 驱动的自动化工具，用户可以通过自然语言指令完成任何计算机任务。受 openclaw 启发，它结合了 opencode 的核心工具集和先进的 AI 自主探索、经验传递逻辑。

## 项目状态

**Phase 1: Rust 核心引擎 (已完成 ✅)**
- ✅ 工具框架和 trait 定义
- ✅ Bash / Read / Write / Edit / Glob 工具实现
- ✅ Python AI 服务集成
- ✅ 多模型适配（OpenAI / DeepSeek / Kimi / 自定义 API）

**Phase 2: 前端与全栈集成 (已完成 ✅)**
- ✅ React 现代化聊天界面（类似 ChatGPT）
- ✅ Express 后端服务器
- ✅ 全栈端到端自动化
- 🚧 Tauri 桌面应用（待开发）

## 核心特性

- **自然语言界面**：理解和执行复杂用户请求
- **核心工具集**：bash、webfetch、read、write、edit、glob
- **多模型支持**：一键切换 OpenAI、DeepSeek、Kimi、自定义 API
- **自动执行**：AI 分析后自动调用系统工具执行
- **经验传递**：层次化经验复用系统
- **双模式部署**：本地模式（macOS/Linux）+ 沙箱模式（Ubuntu 容器）

## 技术栈

- **核心引擎**：Rust（Tokio, clap, serde）
- **AI 服务**：Python（FastAPI, httpx, 多模型适配）
- **前端**：React 19 + Vite + Express 后端
- **通信**：HTTP/REST
- **数据库**：SQLite + LanceDB（向量数据库）

## 快速开始

### 环境要求

- Rust 1.70+
- Python 3.10+
- Node.js 18+

### 一键启动

```bash
# 1. 构建 Rust 核心引擎
cd rust-core && cargo build --release

# 2. 启动所有服务（AI 服务 + 后端 + 前端）
./start-services.sh

# 3. 浏览器打开
# http://localhost:5173
```

### 手动启动（开发调试）

```bash
# AI 服务
cd python-ai
source .venv/bin/activate
python -m app.multi_model_service &

# 后端服务
cd frontend/backend
npm start &

# 前端开发服务器
cd frontend
npm run dev
```

## AI 模型配置

SkyFly 支持多种 AI 模型，只需在 `python-ai/.env` 中配置对应的 API Key：

```bash
cd python-ai
cp .env.example .env
# 编辑 .env，填入你的 API 密钥
```

### 支持的模型

| 模型 | 环境变量 | 获取地址 |
|------|---------|---------|
| 本地规则引擎 | 无需配置 | 内置 |
| OpenAI GPT-4 | `OPENAI_API_KEY` | https://platform.openai.com |
| DeepSeek V3 | `DEEPSEEK_API_KEY` | https://platform.deepseek.com |
| Kimi (Moonshot) | `KIMI_API_KEY` | https://platform.moonshot.cn |
| 自定义 API | `CUSTOM_API_KEY` + `CUSTOM_BASE_URL` | 任意兼容 OpenAI 格式的服务 |

### 配置示例

```env
# OpenAI
OPENAI_API_KEY=sk-xxx
DEFAULT_MODEL=gpt-4

# DeepSeek
DEEPSEEK_API_KEY=sk-xxx

# Kimi
KIMI_API_KEY=sk-xxx

# 自定义
CUSTOM_API_KEY=sk-xxx
CUSTOM_BASE_URL=https://api.custom.com/v1
```

> **注意**：如果某个模型未配置或请求失败，系统会自动回退到本地规则引擎。

## 使用示例

### 前端界面

在浏览器中访问 http://localhost:5173，你会看到一个现代化的聊天界面：

1. 在底部输入框输入自然语言命令
2. 选择左侧的 AI 模型（默认使用本地规则引擎）
3. 开启/关闭"自动执行工具"
4. 按 Enter 发送，AI 会分析并执行

**示例命令**：
- `列出当前目录下所有的 Markdown 文件`
- `读取 README.md 的内容`
- `运行 echo Hello SkyFly`
- `创建文件 /tmp/test.txt，内容为 Hello World`

### CLI 直接调用

```bash
# AI 任务处理（自动执行）
cd rust-core
cargo run -- ai "列出所有的 md 文件" --execute

# 查看工具列表
cargo run -- list

# 查看工具详情
cargo run -- info bash

# 健康检查
cargo run -- ai-health

# 直接执行工具
cargo run -- execute bash -p command="ls -la"
cargo run -- execute read -p path=README.md
```

## 项目结构

```
skyfly/
├── rust-core/              # Rust 核心引擎
│   ├── src/
│   │   ├── main.rs         # CLI 入口
│   │   ├── ai_service.rs   # AI 服务 HTTP 客户端
│   │   └── tools/
│   │       ├── types.rs
│   │       ├── simple_impl.rs
│   │       └── registry.rs
│   └── Cargo.toml
├── python-ai/              # Python AI 服务
│   ├── app/
│   │   ├── multi_model_service.py   # 主服务入口（多模型）
│   │   ├── multi_model_client.py    # 统一多模型客户端
│   │   ├── simple_service.py        # 简化版规则引擎
│   │   ├── main.py                  # 完整版服务（LLM+规划）
│   │   ├── llm_client.py
│   │   ├── planner.py
│   │   └── experience_manager.py
│   ├── .env.example
│   └── requirements.txt
├── frontend/               # React 前端 + Express 后端
│   ├── src/
│   │   ├── App.jsx        # 主组件（聊天界面）
│   │   ├── App.css        # 样式（深色主题）
│   │   └── main.jsx
│   ├── backend/
│   │   └── server.js      # Express API 代理
│   ├── index.html
│   └── package.json
├── start-services.sh       # 一键启动脚本
├── stop-services.sh        # 一键停止脚本
├── plan1.0.md             # 详细开发计划
└── README.md
```

## 运行中的服务

| 服务 | 地址 | 说明 |
|------|------|------|
| AI Service | http://localhost:8000 | FastAPI，任务解析 |
| Backend | http://localhost:3000 | Express，工具执行代理 |
| Frontend | http://localhost:5173 | React 开发服务器 |

## 架构图

```
用户 → React 前端 (http://localhost:5173)
  ↓
Express 后端 (http://localhost:3000)
  ├→ Rust 核心 (本地工具执行) → 操作系统
  └→ Python AI 服务 (http://localhost:8000) → 任务分析 → 返回工具调用
```

## 开发计划

详见 `plan1.0.md`，主要里程碑：

- [x] Phase 0: 项目初始化
- [x] Phase 1: Rust 核心引擎（5个核心工具）
- [x] Phase 2: Python AI 服务 + 多模型适配
- [x] Phase 3: React 前端 + Express 后端
- [ ] Phase 4: Tauri 桌面应用封装
- [ ] Phase 5: 经验管理与自主学习
- [ ] Phase 6: 沙箱模式与 Docker 部署

## 许可证

MIT License - 详见 LICENSE 文件

## 贡献

这是一个面向个人使用的开源项目，欢迎贡献代码和建议。

---

**状态**：开发阶段 2 已完成，前端与多模型适配已上线

**最后更新**：2026-04-13
