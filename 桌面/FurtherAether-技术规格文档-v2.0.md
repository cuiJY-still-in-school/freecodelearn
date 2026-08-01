# FurtherAether — 开发技术规格文档 v2.0

> **核心理念**："AI完成绝大多数任务，人类只在关键步骤介入，本地执行+云端智能，登录即用"
>
> **域名**：furtheraether.com | **套餐**：Luna / Sol / Orion

---

## ⚡ 给 AI 开发者的使用说明

本文档按**线性施工顺序**组织。每次开发只需阅读当前阶段对应的章节，不要加载全文。每个阶段结束后有验收标准，通过后再进入下一阶段。

**开发原则：**
- 每次只做一个阶段，做完验收，再往下
- 遇到章节间的依赖，文档里会明确标注"参考第X章"
- 附录中有所有环境变量和配置，开始前先让用户填好

---

## 🗺️ 线性开发路线图

### 阶段 0 — 准备工作（开始写代码前）
**你需要做的事，不是写代码：**
- 填写文档末尾的**附录 A-F**（域名、API Key、邮箱、收款码等）
- 确认本地 Linux 服务器已安装：Docker、Docker Compose、Python 3.11、Node.js 18+
- 在 Namecheap 添加 DNS A 记录，指向服务器公网 IP
- 配置 DDNS（防止 IP 变动）

**验收：** `ping api.furtheraether.com` 能解析到你的服务器 IP

---

### 阶段 1 — 服务器基础设施
**读：第十七章（§17.1-17.2）**

搭起 PostgreSQL + Redis，配好 `.env.prod`，启动开发服务器。

```
任务：
1. 创建 server/ 目录结构（见第五章）
2. 写 docker-compose.dev.yml（见§17.2）
3. 配置 .env.dev（见§17.2）
4. docker compose up -d
```

**验收：** `docker compose ps` 显示 postgres 和 redis 均为 Up 状态

---

### 阶段 2 — 用户认证系统
**读：第十七章（§17.3-17.5）、第十五章（§15.3）**

实现注册/登录/刷新 Token，管理员邮箱验证码登录。

```
任务：
1. db/models.py — User、TokenBlacklist 表
2. db/database.py — 数据库连接
3. utils/auth.py — JWT 签发/校验、邮箱验证码
4. routers/auth.py — /auth/register、/auth/login、/auth/refresh
5. alembic upgrade head
```

**验收：**
- `POST /auth/register` 成功创建用户
- `POST /auth/login` 返回 access_token + refresh_token
- `POST /admin/auth/send-code` 发送验证码到管理员邮箱

---

### 阶段 3 — AI 推理代理
**读：第十五章（§15.1）、第四章（§4.6）、第十七章（§17.6）**

搭建核心推理代理，所有模型 API Key 存服务器，用户不可见。

```
任务：
1. upstream/router.py — 路由到 DeepSeek/Qwen/Kimi/智谱
2. upstream/key_manager.py — 多 Key 轮询（见第二十六章）
3. utils/quota.py — Token 用量计数（含 Free 档每日3次限制）
4. utils/billing.py — 套餐限额（Luna/Sol/Orion）
5. routers/inference.py — POST /v1/inference
```

**验收：**
- `POST /v1/inference` 用 DeepSeek 返回正常结果
- Free 用户第4次请求返回 429
- 用量正确写入 Redis

---

### 阶段 4 — WebSocket 长连接
**读：第十五章（§15.2）、第二十三章、第二十章（§20.2-20.3）**

搭建服务器与本地 Agent、手机端、Bot 的实时通信层。

```
任务：
1. ws/connection_manager.py — 多设备连接管理
2. routers/ws_agent.py — Agent 长连接（/ws/agent/connect）
3. routers/ws_mobile.py — 手机端连接（/ws/mobile/connect）
4. routers/ws_bot.py — Bot 连接（/ws/bot/connect）
```

**验收：**
- 用 wscat 连接 ws://localhost:8000/ws/agent/connect?token=xxx 不报错
- 断线后自动重连，日志显示 reconnected

---

### 阶段 5 — 服务器部署上线
**读：第十七章（§17.9）、第二十四章**

把服务器跑在 Docker 生产环境，配好 Nginx + SSL，接入 Sentry 监控。

```
任务：
1. Dockerfile + docker-compose.prod.yml
2. nginx/api.furtheraether.com.conf（含 WebSocket 支持）
3. certbot 申请 SSL 证书
4. 接入 Sentry（server/main.py 顶部）
5. 配置 UptimeRobot 监控 /health
6. ./deploy.sh 首次部署
```

**验收：**
- `curl https://api.furtheraether.com/health` 返回 200
- Sentry 收到测试事件
- UptimeRobot 显示在线

---

### 阶段 6 — fa-admin 管理工具
**读：第二十九章**

实现管理员命令行工具，可以在本地 Linux 管理服务器。

```
任务：
1. server/routers/admin.py — 所有 /admin/* 路由
2. 本地创建 fa-admin CLI 工具（Click 框架）
3. 实现：status / users / keys / stats / server 命令组
4. TUI 模式（Textual 框架）
```

**验收：**
- `fa-admin login` 收到邮件验证码，登录成功
- `fa-admin status` 显示服务器状态
- `fa-admin users list` 能看到注册用户

---

### 阶段 7 — 本地 Agent 核心
**读：第六章、第七章、第八章、第九章、第十章**

实现本地执行引擎，连接服务器，能跑完整任务流程。

```
任务：
1. agent-core/models/task.py — Task/SubTask 模型
2. agent-core/utils/fa_client.py — 调用 FA 推理 API
3. agent-core/utils/ws_client.py — WebSocket 长连接（含断线重连）
4. agent-core/modules/ai_dispatcher.py — 任务规划 + 模型选择
5. agent-core/modules/hitl.py — HITL 触发判断
6. agent-core/modules/executor.py — 完整任务执行流
7. agent-core/utils/security.py — 沙盒路径校验
```

**验收：**
- Agent 启动后成功连接服务器 WebSocket
- 提交一个简单任务（"列出桌面文件"）能返回结果
- 低置信度任务触发 HITL 等待

---

### 阶段 8 — 执行工具
**读：第七章（§7.3）、第二十八章**

实现文件、浏览器、Shell、Android 四类执行工具，加载工具市场配置。

```
任务：
1. tools/file_tool.py — 读/写/移动/列目录
2. tools/browser_tool.py — Playwright 封装
3. tools/shell_tool.py — 受限 Shell 执行
4. tools/android_tool.py — ADB 模拟器控制
5. config/toolset.json — 工具包配置
6. config/toolset_loader.py — 动态加载工具列表
```

**验收：**
- 文件工具能列出 ~/Desktop 内容
- 浏览器工具能打开百度并截图
- 危险 Shell 命令被拦截返回 safe:false

---

### 阶段 9 — AI Prompt 配置
**读：第十四章**

配置 7 个 AI 角色的完整 Prompt，跑通 Prompt 回归测试。

```
任务：
1. prompts/planner.py
2. prompts/browser_executor.py
3. prompts/file_executor.py
4. prompts/shell_executor.py
5. prompts/android_executor.py
6. prompts/hitl_describer.py
7. prompts/summarizer.py
8. prompts/parser.py — JSON 解析兜底
9. 跑 pytest tests/test_prompts.py
```

**验收：**
- `pytest tests/` 全部通过
- 支付类任务自动触发 HITL（requires_human: true）
- 危险 Shell 任务 confidence < 0.5

---

### 阶段 10 — 桌面端 UI
**读：第三章（§3.1）、第十九章（§19.1-19.4）**

用 Tauri 实现桌面壳，包含登录、任务列表、HITL 弹窗。

```
任务：
1. desktop-ui/src/pages/Login.tsx — 登录页
2. desktop-ui/src/pages/Dashboard.tsx — 任务总览
3. desktop-ui/src/pages/TaskDetail.tsx — 任务详情 + 日志
4. desktop-ui/src/components/HITLModal.tsx — 接管弹窗
5. desktop-ui/src/pages/SystemCheck.tsx — 启动检测
6. src-tauri/src/main.rs — 启动时拉起 agent-core 进程
```

**验收：**
- 登录后能看到任务列表
- 提交任务后实时显示日志
- HITL 弹出时可以点击接管/拒绝

---

### 阶段 11 — 手机 App
**读：第三章（§3.2）**

用 React Native + Expo 实现手机控制端。

```
任务：
1. mobile-app/app/index.tsx — 登录 + 任务输入
2. mobile-app/app/monitor.tsx — 实时监控
3. mobile-app/app/takeover.tsx — HITL 接管页
4. mobile-app/services/websocket.ts — WS 连接管理
```

**验收：**
- 手机 App 登录后能提交任务
- 任务日志实时推送到手机
- HITL 请求推送手机通知，点击可接管

---

### 阶段 12 — platform.furtheraether.com
**读：第十八章（§18.5）、第二十四章（§24.2）**

用 Next.js 实现用户平台网站。

```
任务：
1. /dashboard — 用量概览
2. /subscription — 套餐管理
3. /addons — 扩展包购买（内测阶段展示收款码）
4. /billing — 账单历史
5. /download — 安装包下载页
6. pay.furtheraether.com — 个人收款码支付页
```

**验收：**
- 登录后能看到本月 Token 用量进度条
- 点击购买跳转到 pay.furtheraether.com 显示收款码
- 下载页能正确检测操作系统并高亮对应安装包

---

### 阶段 13 — 打包发布
**读：第十九章**

把本地 Agent 打包成 Windows / macOS 安装包。

```
任务：
1. agent-core/agent-core.spec — PyInstaller 配置
2. 打包测试：Windows（.exe）+ macOS（.dmg）
3. GitHub Actions 自动构建（.github/workflows/release.yml）
4. macOS 签名公证（需 Apple Developer 账号）
5. platform.furtheraether.com/download 上线
```

**验收：**
- Windows 用户双击 .exe 安装后能登录并运行任务
- macOS 用户打开 .dmg 不报"未知开发者"

---

### 阶段 14 — 工具市场
**读：第二十八章（§28.5）**

实现工具市场基础功能，支持用户安装额外工具包。

```
任务：
1. server/marketplace/ — 工具包审核和分发 API
2. agent-core/tools/marketplace.py — 安装/卸载/热加载
3. desktop-ui/src/pages/Marketplace.tsx — 工具市场界面
4. 发布第一批官方工具包（OCR、网页抓取）
```

**验收：**
- 用户在界面安装 OCR 工具后，Agent 能识别图片文字
- 卸载后该能力从 AI 可用列表消失

---

### 阶段 15 — 测试与上线
**读：第二十一章、第二十四章**

完整测试，修复问题，正式对外开放。

```
任务：
1. pytest agent-core/tests/ 全部通过
2. pytest server/tests/ 全部通过
3. Sentry 和 UptimeRobot 验证正常
4. 内测邀请10个用户，收集反馈
5. 根据实际 Token 消耗调整定价（更新附录 E 中的限额配置）
```

**验收：**
- 10个内测用户能正常使用全部功能
- 服务器连续72小时无 P0 报错

---

> **给 AI 的提示**：每次开始新阶段前，先读路线图确认前置阶段已完成，再读对应章节。不要试图一次性读完全文，上下文会溢出。

---


## 一、产品定位

**差异化卖点：**

- **本地执行**：文件操作、浏览器自动化、Android控制全部在用户本地电脑完成，敏感数据不离开设备
- **自有云端**：模型调用通过 FurtherAether 自有服务器中转，用户无需配置任何API Key，登录即用
- **人机协作**：AI遇到关键步骤请求用户接管，支持手机端一键确认/拒绝
- **多终端入口**：手机App + 自有Bot 均可下发任务、监控进度、处理HITL
- **三档套餐**：Luna / Sol / Orion，按需选择，统一计费，用多少付多少

---

## 二、系统架构

```
[用户手机App]  [FurtherAether Bot]
       │               │
       └───────┬───────┘
               ▼
   ┌─────────────────────────────┐
   │   FurtherAether 云服务器     │  ← 自有公网服务器
   │   · 用户认证 (JWT)           │
   │   · 任务下发 / 状态同步       │
   │   · AI模型代理调用            │
   │   · Bot消息收发               │
   │   · 套餐计费                  │
   └──────────────┬──────────────┘
                  │  WebSocket 长连接（JWT鉴权）
                  ▼
   ┌─────────────────────────────┐
   │   本地电脑 Agent Core        │
   │   · 任务执行引擎              │
   │   · AI调度模块                │
   │   · 本地沙盒                  │
   └──────────────┬──────────────┘
                  │
         ┌────────┴─────────┐
         ▼                  ▼
  [本地执行沙盒]      [AI调用请求]
  文件/浏览器/Shell    ↑ 经云服务器代理，不走用户本机
```

- **FurtherAether 云服务器**：系统核心枢纽，处理认证、任务路由、Bot消息、AI代理调用、计费
- **手机App**：连接云服务器，下发任务、监控进度、处理HITL接管
- **FurtherAether Bot**：自有Bot，连接云服务器，与手机App功能对等
- **本地电脑 Agent**：与云服务器保持 WebSocket 长连接，接收任务指令，本地执行后回传结果
- **AI模型调用**：由云服务器统一代理，用户无需配置任何 API Key，按套餐计费
- **本地沙盒**：保护用户系统，文件/浏览器/Shell 操作限制在白名单路径内

---

## 三、技术栈选型

### 3.1 本地电脑端（Agent Core）

| 层级 | 技术选型 | 原因 |
|------|----------|------|
| 运行时 | Python 3.11+ | 生态丰富，AI库支持好 |
| 桌面封装 | Tauri v2（Rust + WebView） | 比Electron轻量10x，跨平台，安全沙盒 |
| 前端UI | React + TypeScript | 组件化，类型安全 |
| 本地通信 | WebSocket（localhost） | 低延迟，支持推送事件流 |
| 任务队列 | asyncio + Redis（可选） | 轻量用asyncio，生产用Redis |
| 持久化 | SQLite（via SQLModel） | 零配置，本地存储任务/日志 |
| 沙盒执行 | Docker Desktop API / subprocess + chroot | Docker用于高安全模式 |
| Python运行时 | 安装包内置 Python 3.11（用户无感知） | 用户机器无需预装Python |
| 浏览器自动化 | Playwright（Python） | 支持Chromium/Firefox，API稳定 |
| 文件系统操作 | pathlib + watchdog | 跨平台路径处理 + 文件监听 |

### 3.2 手机控制端

| 层级 | 技术选型 | 原因 |
|------|----------|------|
| 框架 | React Native + Expo | 一套代码跑iOS和Android |
| 通信 | WebSocket + HTTPS（连云服务器） | 经FurtherAether服务器中转，无需局域网直连 |
| 推送通知 | Expo Push Notifications | HITL请求接管时推送手机 |
| 认证 | JWT Token（登录后获取） | 无API Key，账号登录即可使用 |

### 3.3 FurtherAether 云服务器端

| 层级 | 技术选型 | 原因 |
|------|----------|------|
| 运行时 | Python 3.11+ / FastAPI | 异步高性能，WebSocket原生支持 |
| 数据库 | PostgreSQL | 用户账号、任务记录、计费数据 |
| 缓存 | Redis | 会话、任务状态、限流 |
| 认证 | JWT（Access + Refresh Token） | 无状态，支持多端同时登录 |
| AI代理 | httpx 异步转发 | 统一管理各模型API Key，用户不可见 |
| Bot | 自有 WebSocket Bot 服务 | 不依赖第三方IM，自主可控 |
| 部署 | Docker + Nginx | 容器化，方便水平扩展 |
| 公网 | 国内备案服务器（阿里云/腾讯云） | 低延迟，合规 |

### 3.4 AI模型层（云服务器侧，用户不可见）

> 所有模型 API Key 由 FurtherAether 服务器统一持有，**用户侧只有登录凭证，不接触任何模型 API Key**。
> 本地 Agent 调用模型时，请求发到 `api.furtheraether.com/v1/inference`，由服务器代理转发到对应模型。

| 模型 | 厂商 | 定位 | 套餐可用性 |
|------|------|------|-----------|
| DeepSeek-V3.2（`deepseek-chat`） | 深度求索 | 标准规划/代码生成 | Luna / Sol / Orion |
| DeepSeek-R1（`deepseek-reasoner`） | 深度求索 | 复杂推理，带思维链 | Sol / Orion |
| Qwen3.5-Plus | 阿里云 | 均衡主力，性价比高 | Luna / Sol / Orion |
| Qwen3.5-Flash | 阿里云 | 最低成本，简单任务 | Luna / Sol / Orion |
| Qwen3-Max | 阿里云 | 旗舰推理，复杂规划 | Sol / Orion |
| Kimi K2.5 | 月之暗面 | Agent工具调用，多模态 | Orion |
| GLM-5 / GLM-5-Turbo | 智谱AI | 长任务整合，中文质量顶尖 | Orion |

---

## 四、模型选择策略

这是影响产品成本与质量的核心决策，原则是**能力 vs 成本 vs 速度**的三角权衡。

### 4.1 选模型评估框架

每个子任务按四个维度评估，决定用哪个模型：

```
复杂度 (Complexity)   → 决定用哪个模型
延迟敏感度 (Latency)  → 决定是否用流式/缓存
成本权重 (Cost)       → 决定是否降级
隐私敏感度 (Privacy)  → 决定是否走本地模型
```

### 4.2 按任务阶段的模型选择

**任务规划层（plan_task）**

规划层宁可多花，规划错了后面全错，不在此处省钱。

| 场景 | 推荐模型 | 原因 |
|------|----------|------|
| 日常任务拆解 | DeepSeek V3 | 够用、快、便宜 |
| 复杂多步骤任务 | DeepSeek R1 | 有推理链，拆解更准确 |
| 纯中文指令理解 | Qwen-Plus | 中文语义理解更细腻 |

**子任务执行层（execute_subtask）**

这里是真正省钱的地方，80% 的执行任务不需要强模型。

| 任务类型 | 推荐模型 | 原因 |
|----------|----------|------|
| 浏览器操作指令生成 | Qwen-Plus / DeepSeek V3 | 结构化输出，模板化强 |
| 大文件内容理解 | Qwen-Long | 超长上下文，处理大文件便宜 |
| Shell命令生成 | DeepSeek V3 | 代码能力强，指令准确 |
| 简单文本转换/格式化 | Qwen-Turbo | 最便宜，此类任务完全够用 |
| 本地敏感数据处理 | FA API 隐私节点 | 请求标记 privacy=true，服务器路由到隔离节点 |

**结果整合层（summarize_result）**

整合基本是文本汇总，不需要强推理，中等模型即可。

| 场景 | 推荐模型 |
|------|----------|
| 标准结果整合 | Qwen-Plus |
| 中文输出质量要求高 | GLM-4 |

### 4.3 动态模型选择实现

```python
async def select_model(self, sub_task: SubTask, context: TaskContext) -> ModelConfig:

    # 优先级1：隐私优先，本地敏感内容走本地模型
    if context.has_sensitive_data or context.user_privacy_mode:
        return ModelConfig(provider="fa_private", model="qwen3:14b")  # FA隐私节点，数据不落地

    # 优先级2：按任务阶段和复杂度选模型
    if sub_task.stage == "planning":
        if context.task_complexity == "complex":
            return ModelConfig(provider="deepseek", model="deepseek-reasoner")  # R1
        elif context.language == "zh" and context.task_complexity == "simple":
            return ModelConfig(provider="qwen", model="qwen-plus")
        else:
            return ModelConfig(provider="deepseek", model="deepseek-chat")      # V3

    if sub_task.stage == "execution":
        if sub_task.tool == "file" and context.file_size_kb > 50:
            return ModelConfig(provider="qwen", model="qwen-long")      # 长文档
        if sub_task.tool in ["browser", "shell"]:
            return ModelConfig(provider="deepseek", model="deepseek-chat")  # 代码能力
        if sub_task.description_complexity == "simple":
            return ModelConfig(provider="qwen", model="qwen-turbo")     # 最便宜
        return ModelConfig(provider="qwen", model="qwen-plus")          # 其他默认

    if sub_task.stage == "summarize":
        return ModelConfig(provider="qwen", model="qwen-plus")

    # 兜底：DeepSeek V3
    return ModelConfig(provider="deepseek", model="deepseek-chat")
```

### 4.4 置信度评估策略

**不要为置信度单独调用模型**，在任务拆解时一并输出，节省一半请求数。

```python
# 在 plan_task 的 system prompt 里直接要求模型输出置信度
system_prompt = """
你是一个任务规划AI。将用户指令拆解成有序的子任务列表。
每个子任务必须包含：
- tool: browser | file | shell | android
- params: JSON格式的工具参数
- confidence: 0.0-1.0（你对自动完成的把握度）
- risk_level: low | medium | high
- requires_human: 是否建议人类介入
- reason_if_uncertain: 不确定的原因（如果有）
仅返回JSON数组，不要解释。
"""
```

### 4.5 成本参考（2026年3月，均为国产模型）

> 价格变动频繁，以下为查询时最新数据，实际以各平台官网为准。

| 模型 | 输入/M tokens | 输出/M tokens | 适用阶段 |
|------|--------------|--------------|----------|
| DeepSeek-R1 | ¥4（缓存命中¥0.5） | ¥16 | 复杂规划（推理链） |
| DeepSeek-V3.2 | ¥2（缓存命中¥0.5） | ¥8 | 标准规划/Shell/浏览器 |
| Qwen3-Max | ¥2.4 | ¥9.6 | 高质量规划，中文任务 |
| Qwen3.5-Plus | ¥0.8 | ¥3.2 | 执行层主力，性价比最佳 |
| Qwen3.5-Flash | ¥0.15 | ¥0.6 | 简单转换/整合，最低成本 |
| Kimi K2.5 | ¥4 | ¥21 | Orion Agent任务 |
| GLM-5 | ¥4 | ¥22 | Orion 长任务/复杂推理 |
| FA隐私节点 | 套餐内含 | 套餐内含 | 隐私任务，服务器隔离处理不落地 |

> 一个典型任务（规划1次 + 执行5个子任务 + 整合1次）在 **Luna** 下约 **¥0.01-0.05**，**Sol** 约 **¥0.03-0.15**，**Orion** 约 **¥0.1-0.5**。

---

### 4.6 三套模型配置（Luna / Sol / Orion）

**文件**：`agent-core/config/model_profiles.py`

```python
from dataclasses import dataclass
from typing import Dict

@dataclass
class ModelConfig:
    provider: str
    model: str
    api_base: str = "https://api.furtheraether.com/v1/inference"  # 统一走FA服务器代理
    max_tokens: int = 4096
    temperature: float = 0.0
    # 注意：所有 api_base 均指向 FurtherAether 云服务器
    # 服务器根据 provider + model 字段自动路由到对应的上游模型
    # 用户本地不持有任何模型 API Key

@dataclass
class ModelProfile:
    name: str
    description: str
    planner_standard: ModelConfig
    planner_complex: ModelConfig      # 复杂任务升级
    executor_browser: ModelConfig
    executor_file: ModelConfig
    executor_shell: ModelConfig
    executor_android: ModelConfig
    hitl_describer: ModelConfig
    summarizer: ModelConfig
    local_fallback: ModelConfig       # 隐私模式/离线兜底


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 官方已核实的 model ID 和 API endpoint
# 查证日期：2026年3月
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# DeepSeek 官方 API：https://api.deepseek.com/v1
#   deepseek-chat     → DeepSeek-V3 / V3.2（同一入口，后台持续更新）
#   deepseek-reasoner → DeepSeek-R1（推理链模型）
#
# Qwen 官方 API（阿里云百炼 DashScope）：
#   国内: https://dashscope.aliyuncs.com/compatible-mode/v1
#   海外: https://dashscope-intl.aliyuncs.com/compatible-mode/v1
#   qwen3-max        → Qwen3-Max，旗舰推理，支持混合思考模式
#   qwen3.5-plus     → Qwen3.5-Plus（397B MoE，2026-02-15发布），支持视觉输入
#   qwen3.5-flash    → Qwen3.5-Flash，最低成本，支持混合思考
#   qwen3-coder-plus → 专为代码/Agent优化，可替代Shell和Browser执行
#
# Kimi 官方 API（Moonshot）：https://api.moonshot.ai/v1
#   kimi-k2.5        → Kimi K2.5（2026-01-27发布），1T MoE，256K上下文
#                      支持 Thinking / Instant 双模式，原生多模态
#                      temperature=1.0（思考模式）/ 0.6（即时模式）
#
# GLM 官方 API（Z.ai / 智谱）：https://open.bigmodel.cn/api/paas/v4
#   glm-5            → GLM-5（2026-02-11发布），744B MoE，200K上下文
#   glm-5-turbo      → GLM-5-Turbo（2026-03-16发布），专为Agent工作流优化
#                      低延迟，适合HITL和Summarizer这类对速度敏感的角色
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


# ─────────────────────────────────────────
# Luna：轻量版，省钱优先，适合个人用户/轻度使用
# 典型任务成本：¥0.01 - ¥0.05（Luna）
# 用户只需登录账号，无需任何 API Key
# ─────────────────────────────────────────
PROFILE_LUNA = ModelProfile(
    name="luna",
    description="Luna：轻量版，登录即用，单次任务成本最低",

    planner_standard=ModelConfig(
        provider="qwen",
        model="qwen3.5-plus",                          # 397B MoE，性价比最高的规划模型
        api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    planner_complex=ModelConfig(
        provider="qwen",
        model="qwen3-max",                             # Luna 复杂任务上限，支持混合思考
        api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    executor_browser=ModelConfig(
        provider="qwen",
        model="qwen3.5-flash",                         # ¥0.15/M，浏览器指令生成够用
        api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    executor_file=ModelConfig(
        provider="qwen",
        model="qwen3.5-flash",                         # 文件操作结构简单，Flash足够
        api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    executor_shell=ModelConfig(
        provider="qwen",
        model="qwen3.5-plus",                          # Shell命令稍复杂，用Plus保准确率
        api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    executor_android=ModelConfig(
        provider="qwen",
        model="qwen3.5-plus",                          # Android操作需要理解截图，用Plus
        api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    hitl_describer=ModelConfig(
        provider="qwen",
        model="qwen3.5-flash",                         # 文字转换任务，Flash完全够用
        api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    summarizer=ModelConfig(
        provider="qwen",
        model="qwen3.5-flash",                         # 结果整合，Flash足够
        api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    local_fallback=ModelConfig(
        provider="fa_private",
        model="qwen3:8b",                              # FA隐私节点，数据不落地
        api_base="https://api.furtheraether.com/v1/inference",
    ),
)


# ─────────────────────────────────────────
# Sol：均衡版，成本与质量兼顾（推荐默认）
# 典型任务成本：¥0.03 - ¥0.15（Sol）
# 用户只需登录账号，无需任何 API Key
# ─────────────────────────────────────────
PROFILE_SOL = ModelProfile(
    name="sol",
    description="Sol：均衡套餐，规划用DeepSeek，执行分场景，推荐新用户默认选此档",

    planner_standard=ModelConfig(
        provider="deepseek",
        model="deepseek-chat",                         # DeepSeek-V3/V3.2，支持prefix缓存
        api_base="https://api.deepseek.com/v1",
    ),
    planner_complex=ModelConfig(
        provider="deepseek",
        model="deepseek-reasoner",                     # DeepSeek-R1，推理链，复杂任务
        api_base="https://api.deepseek.com/v1",
    ),
    executor_browser=ModelConfig(
        provider="deepseek",
        model="deepseek-chat",                         # selector生成需要代码能力，首选DeepSeek
        api_base="https://api.deepseek.com/v1",
    ),
    executor_file=ModelConfig(
        provider="qwen",
        model="qwen3.5-plus",                          # 中文路径/文件名理解更好
        api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    executor_shell=ModelConfig(
        provider="deepseek",
        model="deepseek-chat",                         # Shell命令生成，DeepSeek代码能力最强
        api_base="https://api.deepseek.com/v1",
    ),
    executor_android=ModelConfig(
        provider="deepseek",
        model="deepseek-chat",                         # Android指令生成，需要代码能力
        api_base="https://api.deepseek.com/v1",
    ),
    hitl_describer=ModelConfig(
        provider="qwen",
        model="qwen3.5-flash",                         # 技术转用户语言，Flash够用省钱
        api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    summarizer=ModelConfig(
        provider="qwen",
        model="qwen3.5-plus",                          # 中文摘要质量好
        api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
    ),
    local_fallback=ModelConfig(
        provider="fa_private",
        model="qwen3:14b",                             # FA隐私节点，数据不落地
        api_base="https://api.furtheraether.com/v1/inference",
    ),
)


# ─────────────────────────────────────────
# Orion：旗舰版，质量优先，适合商业场景/高频使用
# 典型任务成本：¥0.1 - ¥0.5（Orion）
# 用户只需登录账号，无需任何 API Key
# ─────────────────────────────────────────
PROFILE_ORION = ModelProfile(
    name="orion",
    description="Orion：旗舰品质，Agent任务用Kimi K2.5，整合/文件用GLM-5-Turbo",

    planner_standard=ModelConfig(
        provider="deepseek",
        model="deepseek-chat",                         # DeepSeek-V3.2，标准规划
        api_base="https://api.deepseek.com/v1",
    ),
    planner_complex=ModelConfig(
        provider="deepseek",
        model="deepseek-reasoner",                     # DeepSeek-R1，复杂任务全力推理
        api_base="https://api.deepseek.com/v1",
    ),
    executor_browser=ModelConfig(
        provider="moonshot",
        model="kimi-k2.5",                             # Kimi K2.5，原生多模态+Agent Swarm
        api_base="https://api.moonshot.ai/v1",         # temperature=0.6（instant模式）
    ),
    executor_file=ModelConfig(
        provider="zhipuai",
        model="glm-5-turbo",                           # GLM-5-Turbo，专为Agent工作流，低延迟
        api_base="https://open.bigmodel.cn/api/paas/v4",
    ),
    executor_shell=ModelConfig(
        provider="deepseek",
        model="deepseek-chat",                         # Shell命令生成仍首选DeepSeek
        api_base="https://api.deepseek.com/v1",
    ),
    executor_android=ModelConfig(
        provider="moonshot",
        model="kimi-k2.5",                             # Kimi K2.5支持截图理解+UI操作指令
        api_base="https://api.moonshot.ai/v1",
    ),
    hitl_describer=ModelConfig(
        provider="zhipuai",
        model="glm-5-turbo",                           # GLM-5-Turbo低延迟，HITL要快速响应
        api_base="https://open.bigmodel.cn/api/paas/v4",
    ),
    summarizer=ModelConfig(
        provider="zhipuai",
        model="glm-5",                                 # GLM-5旗舰版，中文长文本整合质量最佳
        api_base="https://open.bigmodel.cn/api/paas/v4",
    ),
    local_fallback=ModelConfig(
        provider="fa_private",
        model="qwen3:32b",                             # FA隐私节点，数据不落地
        api_base="https://api.furtheraether.com/v1/inference",
    ),
)


MODEL_PROFILES: Dict[str, ModelProfile] = {
    "luna": PROFILE_LUNA,
    "sol":  PROFILE_SOL,
    "orion": PROFILE_ORION,
}

def get_profile(name: str = "sol") -> ModelProfile:
    return MODEL_PROFILES.get(name, PROFILE_SOL)
```

**环境变量配置（`.env`，用户侧）：**

```bash
# 用户无需配置任何模型 API Key
# 登录后自动写入，勿手动修改

FA_API_BASE=https://api.furtheraether.com
FA_WS_BASE=wss://api.furtheraether.com/ws
FA_ACCESS_TOKEN=               # 登录后自动写入
FA_REFRESH_TOKEN=              # 登录后自动写入
FA_USER_ID=                    # 登录后自动写入
FA_PLAN=sol                    # luna | sol | orion，登录后从服务器获取
```

**服务器侧环境变量（`.env.server`，用户不可见）：**

```bash
# 所有模型 API Key 只存在服务器
DEEPSEEK_API_KEY=
QWEN_API_KEY=
MOONSHOT_API_KEY=
ZHIPUAI_API_KEY=

# 数据库
POSTGRES_URL=
REDIS_URL=

# JWT
JWT_SECRET=
JWT_ALGORITHM=HS256

# 套餐限额（每月token上限）
LUNA_TOKEN_LIMIT=5000000
SOL_TOKEN_LIMIT=30000000
ORION_TOKEN_LIMIT=200000000
```

**三套配置一眼对比：**

| 维度 | 🌙 Luna（轻量） | ☀️ Sol（均衡，默认） | 🔭 Orion（旗舰） |
|------|------|------------|------|
| 规划标准 | `qwen3.5-plus` | `deepseek-chat` | `deepseek-chat` |
| 规划复杂 | `qwen3-max` | `deepseek-reasoner` | `deepseek-reasoner` |
| 浏览器执行 | `qwen3.5-flash` | `deepseek-chat` | **`kimi-k2.5`** |
| 文件执行 | `qwen3.5-flash` | `qwen3.5-plus` | **`glm-5-turbo`** |
| Shell执行 | `qwen3.5-plus` | `deepseek-chat` | `deepseek-chat` |
| Android执行 | `qwen3.5-plus` | `deepseek-chat` | **`kimi-k2.5`** |
| HITL描述 | `qwen3.5-flash` | `qwen3.5-flash` | **`glm-5-turbo`** |
| 结果整合 | `qwen3.5-flash` | `qwen3.5-plus` | **`glm-5`** |
| 本地备用 | `qwen3:8b`（8GB） | `qwen3:14b`（16GB） | `qwen3:32b`（24GB） |
| 典型任务成本 | ¥0.01-0.05 | ¥0.03-0.15 | ¥0.1-0.5 |
| 所需API Key | 1个 | 2个 | 4个 |

### 4.6 Prompt缓存（重要优化）

DeepSeek 和 Qwen 均支持系统 Prompt 缓存。系统 Prompt 基本固定，开启后重复部分费用可降低约 90%，高频调用场景下非常划算。

```python
# 示例：DeepSeek prefix caching
# 固定的 system_prompt 部分会被自动缓存，无需额外配置
# 确保每次请求的 system_prompt 保持一致，缓存命中率更高
response = await client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        {"role": "system", "content": FIXED_SYSTEM_PROMPT},  # 保持不变以命中缓存
        {"role": "user", "content": user_task}
    ]
)
```

### 4.7 模型降级机制

主模型超时或报错时自动降级到备用模型，避免任务卡死。

```python
MODEL_FALLBACK_CHAIN = {
    "deepseek-reasoner":        ["deepseek-chat", "qwen3-max"],
    "deepseek-chat":            ["qwen3.5-plus", "qwen3.5-flash"],
    "kimi-k2-0905-preview":     ["deepseek-chat", "qwen3.5-plus"],
    "glm-5":                    ["deepseek-chat", "qwen3.5-plus"],
    "qwen3-max":                ["deepseek-chat", "qwen3.5-plus"],
    "qwen3.5-plus":             ["qwen3.5-flash", "fa_private/qwen3:14b"],
    "qwen3.5-flash":            ["fa_private/qwen3:7b"],
}

async def call_with_fallback(model: str, messages: list) -> str:
    chain = [model] + MODEL_FALLBACK_CHAIN.get(model, [])
    for m in chain:
        try:
            return await call_model(m, messages, timeout=30)
        except (TimeoutError, APIError) as e:
            logger.warning(f"Model {m} failed: {e}, trying next...")
    raise AllModelsFailedError("所有模型均不可用")
```

---

## 五、项目目录结构

```
furtheraether/
├── server/                     # FurtherAether 云服务器
│   ├── main.py                 # FastAPI 启动入口
│   ├── routers/
│   │   ├── auth.py             # 注册/登录/刷新Token
│   │   ├── inference.py        # AI推理代理接口
│   │   └── quota.py            # 用量查询
│   ├── bot/
│   │   └── handler.py          # 自有Bot WebSocket服务
│   ├── upstream/
│   │   └── router.py           # 路由到各上游模型API
│   ├── db/
│   │   ├── models.py           # PostgreSQL模型
│   │   └── crud.py
│   └── utils/
│       ├── auth.py             # JWT签发/校验
│       └── quota.py            # 用量计算/限流
│
├── agent-core/                 # 本地电脑端 Python核心
│   ├── main.py                 # 启动入口，WebSocket服务器
│   ├── config.py               # 全局配置（模型key、沙盒路径等）
│   ├── models/
│   │   ├── task.py             # Task数据模型
│   │   ├── log.py              # 日志模型
│   │   └── session.py          # 会话模型
│   ├── modules/
│   │   ├── task_receiver.py    # 任务接收模块
│   │   ├── ai_dispatcher.py    # AI调度模块（含模型选择）
│   │   ├── executor.py         # 本地执行模块
│   │   ├── sandbox.py          # 沙盒管理
│   │   ├── hitl.py             # Human-in-the-loop模块
│   │   └── monitor.py          # 状态监控模块
│   ├── tools/
│   │   ├── base_tool.py        # 工具基类
│   │   ├── browser_tool.py     # Playwright封装
│   │   ├── file_tool.py        # 文件操作工具
│   │   ├── shell_tool.py       # Shell命令执行（受限）
│   │   └── android_tool.py     # ADB/Android控制
│   ├── db/
│   │   ├── database.py         # SQLite连接
│   │   └── crud.py             # CRUD操作
│   └── utils/
│       ├── logger.py           # 统一日志
│       └── security.py         # 权限校验
│
├── desktop-ui/                 # Tauri桌面外壳
│   ├── src-tauri/
│   │   ├── tauri.conf.json
│   │   └── src/main.rs
│   └── src/
│       ├── App.tsx
│       ├── pages/
│       │   ├── Dashboard.tsx   # 任务总览
│       │   ├── TaskDetail.tsx  # 任务详情/日志
│       │   └── Settings.tsx    # 模型配置
│       └── components/
│           ├── TaskCard.tsx
│           ├── LogViewer.tsx
│           └── HITLModal.tsx   # 接管弹窗
│
├── mobile-app/                 # React Native手机端
│   ├── app/
│   │   ├── index.tsx           # 首页（输入任务）
│   │   ├── monitor.tsx         # 实时监控
│   │   └── takeover.tsx        # 接管操作页
│   └── services/
│       ├── websocket.ts        # WS连接管理
│       └── api.ts              # HTTP API
│
└── docs/
    ├── api-spec.md             # 接口规格
    └── deployment.md           # 部署文档
```

---

## 六、核心数据模型

### 6.1 Task（任务）

```python
# agent-core/models/task.py
from enum import Enum
from datetime import datetime
from sqlmodel import SQLModel, Field
from typing import Optional, List
import uuid

class TaskStatus(str, Enum):
    PENDING    = "pending"
    PLANNING   = "planning"      # AI正在拆解任务
    RUNNING    = "running"       # 执行中
    HITL_WAIT  = "hitl_wait"     # 等待人类接管
    COMPLETED  = "completed"
    FAILED     = "failed"
    CANCELLED  = "cancelled"

class SubTask(SQLModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    parent_task_id: str
    description: str
    tool: str                   # "browser" | "file" | "shell" | "android"
    params: dict                # 工具参数
    status: TaskStatus = TaskStatus.PENDING
    result: Optional[str] = None
    confidence: float = 1.0     # AI置信度，低于阈值触发HITL
    risk_level: str = "low"     # low | medium | high
    requires_human: bool = False
    stage: str = "execution"    # planning | execution | summarize

class Task(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    raw_input: str
    status: TaskStatus = TaskStatus.PENDING
    sub_tasks: List[SubTask] = Field(default=[], sa_column_kwargs={"type_": "JSON"})
    final_result: Optional[str] = None
    model_used: Optional[str] = None
    total_tokens: int = 0
    total_cost_cny: float = 0.0  # 人民币成本记录
    source: str = "mobile"       # "mobile" | "desktop"
```

### 6.2 WebSocket消息协议

```typescript
type MessageType =
  | "task_submit"           // 手机→Agent: 提交任务
  | "task_status_update"    // Agent→手机: 状态变更推送
  | "task_log"              // Agent→手机: 实时日志
  | "hitl_request"          // Agent→手机: 请求人类接管
  | "hitl_response"         // 手机→Agent: 接管结果返回
  | "task_cancel"           // 手机→Agent: 取消任务
  | "heartbeat";            // 双向: 保活

interface WSMessage<T = unknown> {
  type: MessageType;
  task_id: string;
  timestamp: string;         // ISO8601
  payload: T;
}

// 提交任务
interface TaskSubmitPayload {
  raw_input: string;
  context?: {
    files?: string[];
    app_target?: string;
  };
}

// HITL请求
interface HITLRequestPayload {
  sub_task_id: string;
  reason: "low_confidence" | "permission_required" | "ambiguous_input" | "destructive_action" | "payment_action";
  description: string;
  screenshot?: string;       // base64截图
  options?: string[];        // 快捷选项
  timeout_seconds: number;
}

// HITL响应
interface HITLResponsePayload {
  sub_task_id: string;
  action: "approve" | "reject" | "manual_complete";
  result?: string;
}
```

---

## 七、模块接口规格

### 7.1 AI调度模块（`ai_dispatcher.py`）

```python
class AIDispatcher:

    async def plan_task(self, task: Task) -> List[SubTask]:
        """
        输入: 用户原始指令
        输出: 有序子任务列表（含confidence、risk_level）
        模型选择: 默认DeepSeek V3，复杂任务升级R1
        """
        model = await self.select_model_for_planning(task)
        system_prompt = """
        你是一个任务规划AI。将用户指令拆解成有序的子任务列表。
        每个子任务必须指定：
        - tool: browser | file | shell | android
        - params: 该工具所需参数（JSON）
        - confidence: 0.0-1.0（你对自动完成的把握度）
        - risk_level: low | medium | high
        - requires_human: 是否建议人类介入
        - reason_if_uncertain: 不确定的原因（如果有）
        仅返回JSON数组，不要解释。
        """
        # 调用API，解析返回JSON

    async def execute_subtask(self, sub_task: SubTask, context: TaskContext) -> str:
        """
        针对单个子任务调用对应工具
        低置信度 or requires_human → 抛出 HITLRequired异常
        """

    async def select_model(self, sub_task: SubTask, context: TaskContext) -> ModelConfig:
        """
        按隐私 → 阶段 → 工具类型 → 复杂度 依次判断
        见第四章完整实现
        """

    async def call_with_fallback(self, model: str, messages: list) -> str:
        """
        主模型失败时按降级链自动切换
        超时阈值：30秒
        """

    async def summarize_result(self, task: Task) -> str:
        """
        整合所有子任务结果为自然语言摘要
        模型: Qwen-Plus（默认）或 GLM-4（中文质量要求高时）
        """
```

### 7.2 执行工具基类

```python
# agent-core/tools/base_tool.py
from abc import ABC, abstractmethod

class BaseTool(ABC):
    name: str
    description: str
    allowed_params: dict

    @abstractmethod
    async def execute(self, params: dict) -> ToolResult:
        pass

    @abstractmethod
    async def validate_params(self, params: dict) -> bool:
        pass

    async def is_dangerous(self, params: dict) -> bool:
        return False

class ToolResult:
    success: bool
    output: str
    screenshot: Optional[bytes] = None
    files_created: List[str] = []
    error: Optional[str] = None
```

### 7.3 浏览器工具（`browser_tool.py`）

```python
class BrowserTool(BaseTool):
    name = "browser"

    ACTIONS = {
        "navigate":      {"url": str},
        "click":         {"selector": str},
        "type":          {"selector": str, "text": str},
        "screenshot":    {},
        "extract_text":  {"selector": str},
        "wait_for":      {"selector": str, "timeout": int},
        "scroll":        {"direction": str, "amount": int},
        "execute_js":    {"script": str},    # ⚠️ 高危，需HITL确认
    }

    async def execute(self, params: dict) -> ToolResult:
        action = params["action"]
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            # 根据action路由到对应操作
            ...
```

### 7.4 HITL模块（`hitl.py`）

```python
class HITLManager:

    CONFIDENCE_THRESHOLD = 0.75

    TRIGGER_RULES = {
        "low_confidence":      lambda st: st.confidence < HITLManager.CONFIDENCE_THRESHOLD,
        "destructive_action":  lambda st: st.tool == "shell" and any(
                                   kw in str(st.params) for kw in ["rm", "del", "format", "drop"]
                               ),
        "permission_required": lambda st: st.params.get("requires_root", False),
        "payment_action":      lambda st: "pay" in st.description or "支付" in st.description,
        "explicit_flag":       lambda st: st.requires_human,
    }

    async def should_trigger(self, sub_task: SubTask) -> tuple[bool, str]:
        for reason, rule in self.TRIGGER_RULES.items():
            if rule(sub_task):
                return True, reason
        return False, ""

    async def request_human(self, sub_task: SubTask, reason: str) -> HITLResponsePayload:
        request = HITLRequestPayload(
            sub_task_id=sub_task.id,
            reason=reason,
            description=self._generate_description(sub_task, reason),
            screenshot=await self._capture_screenshot(),
            timeout_seconds=120,
        )
        return await self._wait_for_response(request)

    async def _wait_for_response(self, request, timeout=120) -> HITLResponsePayload:
        event = asyncio.Event()
        self._pending[request.sub_task_id] = (event, None)
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
            return self._pending[request.sub_task_id][1]
        except asyncio.TimeoutError:
            return HITLResponsePayload(sub_task_id=request.sub_task_id, action="reject")
```

---

## 八、完整任务执行流

```python
# agent-core/modules/executor.py

async def run_task(task: Task, ws_broadcaster: WebSocketBroadcaster):

    async def broadcast(event_type: str, data: dict):
        await ws_broadcaster.send(WSMessage(
            type=event_type, task_id=task.id,
            timestamp=datetime.utcnow().isoformat(), payload=data
        ))

    try:
        # Step 1: 规划
        task.status = TaskStatus.PLANNING
        await broadcast("task_status_update", {"status": "planning"})

        dispatcher = AIDispatcher()
        sub_tasks = await dispatcher.plan_task(task)
        task.sub_tasks = sub_tasks

        # Step 2: 逐步执行
        task.status = TaskStatus.RUNNING
        hitl = HITLManager()

        for sub_task in sub_tasks:
            await broadcast("task_log", {
                "message": f"执行: {sub_task.description}",
                "tool": sub_task.tool
            })

            # 安全检查
            tool = get_tool(sub_task.tool)
            if await tool.is_dangerous(sub_task.params):
                sub_task.requires_human = True

            # HITL判断
            should_pause, reason = await hitl.should_trigger(sub_task)
            if should_pause:
                task.status = TaskStatus.HITL_WAIT
                await broadcast("hitl_request", HITLRequestPayload(...))

                response = await hitl.request_human(sub_task, reason)

                if response.action == "reject":
                    sub_task.status = TaskStatus.FAILED
                    sub_task.result = "用户拒绝执行"
                    continue
                elif response.action == "manual_complete":
                    sub_task.status = TaskStatus.COMPLETED
                    sub_task.result = response.result
                    continue
                # approve → 继续自动执行

            # 执行工具（带一次重试）
            task.status = TaskStatus.RUNNING
            result = await tool.execute(sub_task.params)
            if not result.success:
                result = await tool.execute(sub_task.params)  # 重试一次

            if result.success:
                sub_task.status = TaskStatus.COMPLETED
                sub_task.result = result.output
            else:
                sub_task.status = TaskStatus.FAILED
                await broadcast("task_log", {
                    "message": f"子任务失败: {result.error}",
                    "level": "error"
                })

        # Step 3: 整合结果
        final = await dispatcher.summarize_result(task)
        task.final_result = final
        task.status = TaskStatus.COMPLETED
        await broadcast("task_status_update", {"status": "completed", "result": final})

    except Exception as e:
        task.status = TaskStatus.FAILED
        await broadcast("task_status_update", {"status": "failed", "error": str(e)})
        logger.exception(f"Task {task.id} failed: {e}")

    finally:
        await save_task(task)
```

---

## 九、安全层规格

### 9.1 沙盒白名单配置

```python
# agent-core/utils/security.py

SANDBOX_CONFIG = {
    "allowed_paths": [
        "~/Desktop",
        "~/Downloads",
        "~/Documents/AgentWorkspace",
    ],
    "blocked_paths": [
        "/System", "/etc", "/usr", "~/.ssh",
        "C:\\Windows", "C:\\Program Files",
    ],
    "blocked_shell_commands": [
        "rm -rf", "del /f", "format", "shutdown",
        "chmod 777", "sudo rm", "DROP TABLE",
    ],
    "max_file_size_mb": 500,
    "browser_allowed_domains": [],       # 空=不限制，填写则白名单
    "require_human_for_payments": True,
}

def validate_file_path(path: str) -> bool:
    """检查路径是否在允许范围内"""

def validate_shell_command(cmd: str) -> tuple[bool, str]:
    """返回 (是否安全, 拒绝原因)"""
```

### 9.2 认证体系（登录制）

用户无需配置 API Key，所有鉴权基于账号登录。

**认证流程：**

```
用户首次安装
    │
    ▼
输入邮箱/手机号 + 密码 → POST /auth/login
    │
    ▼
服务器返回 Access Token（2h）+ Refresh Token（30d）
    │
    ▼
本地 Agent 和手机 App 均使用同一 Token 连接云服务器
Access Token 过期后用 Refresh Token 静默续期
```

**Token规格（`agent-core/utils/auth.py`）：**

```python
AUTH_CONFIG = {
    "access_token_ttl":  60 * 60 * 2,        # 2小时
    "refresh_token_ttl": 60 * 60 * 24 * 30,  # 30天
    "algorithm":         "HS256",
    "token_type":        "Bearer",
}

# WebSocket连接时在header中传入
WS_CONNECT_HEADERS = {
    "Authorization": "Bearer {access_token}",
    "X-Client-Type": "desktop",    # desktop | mobile | bot
    "X-Client-Version": "1.0.0",
}
```

**服务器端 JWT payload：**

```python
{
    "sub":     "user_id",
    "plan":    "sol",          # luna | sol | orion，决定可用模型范围
    "exp":     1234567890,
    "iat":     1234567890,
    "type":    "access",       # access | refresh
}
```

**本地 Agent 存储 Token（`~/.furtheraether/auth.json`，仅本机可读）：**

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "user_id": "usr_xxxx",
  "plan": "sol",
  "expires_at": "2026-03-22T10:00:00Z"
}
```

---

## 十、数据库Schema（SQLite）

```sql
-- 任务表
CREATE TABLE task (
    id              TEXT PRIMARY KEY,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    raw_input       TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    sub_tasks       JSON,
    final_result    TEXT,
    model_used      TEXT,
    total_tokens    INTEGER DEFAULT 0,
    total_cost_cny  REAL DEFAULT 0.0,
    source          TEXT DEFAULT 'desktop'
);

-- 执行日志表
CREATE TABLE execution_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     TEXT NOT NULL REFERENCES task(id),
    sub_task_id TEXT,
    timestamp   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    level       TEXT DEFAULT 'info',    -- info | warn | error
    message     TEXT NOT NULL,
    tool        TEXT
);

-- HITL记录表（用于后续学习）
CREATE TABLE hitl_record (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id         TEXT NOT NULL,
    sub_task_id     TEXT NOT NULL,
    trigger_reason  TEXT NOT NULL,
    user_action     TEXT NOT NULL,      -- approve | reject | manual_complete
    user_result     TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 配置表
CREATE TABLE config (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 模型成本记录表
CREATE TABLE model_usage (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id         TEXT NOT NULL,
    sub_task_id     TEXT,
    model           TEXT NOT NULL,
    provider        TEXT NOT NULL,
    input_tokens    INTEGER DEFAULT 0,
    output_tokens   INTEGER DEFAULT 0,
    cost_cny        REAL DEFAULT 0.0,
    stage           TEXT,               -- planning | execution | summarize
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 十一、开发环境启动

```bash
# 1. 克隆项目
git clone https://github.com/yourname/ai-agent-plus
cd ai-agent-plus

# 2. 后端环境（开发用，生产打包时Python随安装包一起发布，用户无需手动安装）
cd agent-core
python -m venv .venv && source .venv/bin/activate
pip install websockets asyncio sqlmodel playwright python-dotenv \
            openai httpx pydantic loguru watchdog

playwright install chromium

# 3. 配置环境变量
cp .env.example .env
# 用户侧只需填写：
# FA_API_BASE=https://api.furtheraether.com
# FA_WS_BASE=wss://api.furtheraether.com/ws
# SANDBOX_ROOT=~/Documents/AgentWorkspace
# HITL_CONFIDENCE_THRESHOLD=0.75
# (登录后 access_token 自动写入，无需手动填写)

# 4. 启动云服务器（本地开发模式）
cd server
pip install fastapi uvicorn asyncpg redis python-jose httpx --break-system-packages
uvicorn main:app --reload --port 8000
# 输出：FurtherAether server running on http://localhost:8000

# 5. 启动本地 Agent（另一个终端）
cd agent-core
python main.py
# 输出：Agent connected to ws://localhost:8000/ws

# 6. 启动桌面UI（另一个终端）
cd desktop-ui
npm install && npm run tauri dev

# 7. 启动手机端模拟器
cd mobile-app
npm install && npx expo start
```

---

## 十二、MVP开发任务清单

### Phase 1 — 核心可运行（2-3周）

**服务器端：**
- [ ] **P1** `server/main.py` — FastAPI 启动，WebSocket 路由
- [ ] **P1** `server/routers/auth.py` — 注册/登录/刷新Token，JWT签发
- [ ] **P1** `server/routers/inference.py` — AI推理代理，套餐权限检查
- [ ] **P1** `server/upstream/router.py` — 路由到 DeepSeek / Qwen 上游模型
- [ ] **P1** `server/db/models.py` — PostgreSQL：users / quota_usage 表
- [ ] **P2** `server/bot/handler.py` — 自有Bot WebSocket服务

**本地 Agent 端：**
- [ ] **P1** `agent-core/main.py` — 连接云服务器 WebSocket，JWT鉴权
- [ ] **P1** `agent-core/utils/fa_client.py` — FurtherAether API 调用封装
- [ ] **P1** `models/task.py` — Task / SubTask数据模型 + SQLite建表
- [ ] **P1** `modules/ai_dispatcher.py` — `plan_task()` 调用 FA API，解析SubTask JSON
- [ ] **P1** `modules/ai_dispatcher.py` — `select_model()` 动态模型选择 + 降级链
- [ ] **P1** `tools/file_tool.py` — 读/写文件、列目录（带路径白名单）
- [ ] **P1** `tools/browser_tool.py` — navigate / click / type / screenshot（Playwright）
- [ ] **P1** `modules/hitl.py` — 触发判断 + asyncio等待机制 + 超时处理
- [ ] **P1** `modules/executor.py` — 完整任务执行流（含错误处理、重试、HITL）

**客户端：**
- [ ] **P2** `desktop-ui/` — Tauri壳 + Dashboard（任务列表 + 日志）+ 登录页
- [ ] **P2** `mobile-app/` — 登录页 + 任务输入 + WS连接 + 实时日志
- [ ] **P2** `mobile-app/takeover.tsx` — HITL接管弹窗

### Phase 2 — 增强稳定（2周）

- [ ] **P1** `tools/shell_tool.py` — 受限Shell执行（黑名单过滤）
- [ ] **P1** `modules/monitor.py` — 失败重试、超时监控
- [ ] **P1** `db/crud.py` — model_usage 表写入，成本追踪
- [ ] **P2** `utils/security.py` — 完整沙盒安全校验层
- [ ] **P2** Prompt缓存配置（DeepSeek / Qwen）
- [ ] **P3** `tools/android_tool.py` — ADB基础控制（截图、点击、滑动）
- [ ] **P3** HITL记录学习 → `hitl_record` 表写入

### Phase 3 — 商业化准备

- [ ] FA隐私节点集成（隐私任务自动路由，数据不落地）
- [ ] Tailscale外网穿透配置引导
- [ ] Android虚拟化方案（Waydroid / AVD）
- [ ] 成本统计仪表盘（token用量 + 费用估算）
- [ ] Human-in-the-loop学习机制（相似任务自动化率提升）
- [ ] 多终端同步（手机/平板/电脑共享任务状态）

---

## 十三、关键注意事项

**安全与合规**
- 不使用内存注入或非法系统修改
- 遵守平台规则，避免封号或法律风险
- 所有危险操作强制 HITL 确认

**用户体验**
- 零配置，普通用户直接下载打开
- 异常提示明确，操作流畅
- 手机端接管弹窗附带截图辅助判断

**模型成本控制**
- 规划层不省钱，执行层按复杂度分级
- 所有 API Key 只存在服务器，用户侧零配置
- 不为置信度评估单独调用模型，节省一半请求数
- 开启 Prompt 缓存，固定 system prompt 降低 90% 重复成本
- 套餐限额按月 token 用量计算，服务器侧 Redis 实时计数

**日志与隐私**
- 所有任务、执行结果、用户操作均本地存储
- 云端只处理指令和AI推理，不存储用户数据
- 敏感数据检测到后自动路由到 FA 隐私节点，服务器隔离处理不落地

**扩展性**
- 模块化设计，工具层通过 BaseTool 统一接口
- 新增模型只需在 `select_model()` 中扩展配置
- 新增执行端继承 BaseTool 即可接入

---

---

## 十四、各AI角色完整Prompt配置

系统中共有 **7个独立AI角色**，每个角色有固定职责、固定模型、固定输出格式。所有 system prompt 存放在 `agent-core/prompts/` 目录，代码只引用常量，不内联字符串。

```
agent-core/prompts/
├── planner.py          # 任务规划AI
├── browser_executor.py # 浏览器操作AI
├── file_executor.py    # 文件操作AI
├── shell_executor.py   # Shell命令AI
├── android_executor.py # Android控制AI
├── hitl_describer.py   # HITL描述AI
└── summarizer.py       # 结果整合AI
```

输出解析统一入口：

```python
# agent-core/prompts/parser.py

import re, json

def parse_json_output(raw: str) -> dict | list:
    """
    所有AI角色的JSON输出都经过这里，防止模型包markdown代码块或加废话
    """
    # 去掉 ```json ... ``` 或 ``` ... ```
    cleaned = re.sub(r"```(?:json)?\s*|```", "", raw).strip()
    # 截取第一个完整JSON结构（{ } 或 [ ]）
    for start_char, end_char in [("[", "]"), ("{", "}")]:
        start = cleaned.find(start_char)
        end = cleaned.rfind(end_char)
        if start != -1 and end != -1:
            try:
                return json.loads(cleaned[start:end+1])
            except json.JSONDecodeError:
                continue
    raise ValueError(f"无法从模型输出中解析JSON:\n{raw[:300]}")
```

---

### 14.1 任务规划AI（Planner）

**职责**：接收用户原始指令，输出有序子任务列表，每个子任务含置信度和风险评估。

**推荐模型**：DeepSeek V3（标准），DeepSeek R1（复杂任务）

**文件**：`agent-core/prompts/planner.py`

```python
PLANNER_SYSTEM = """
你是 FurtherAether 的任务规划引擎。

## 你的唯一职责
将用户的自然语言指令拆解成一个有序的子任务列表，供执行模块逐步完成。

## 输出格式
只输出一个 JSON 数组，禁止任何解释、前缀、markdown代码块。

每个子任务结构如下：
[
  {
    "description": "用一句话说清楚这步做什么",
    "tool": "browser" | "file" | "shell" | "android",
    "params": { ... },
    "confidence": 0.0到1.0之间的小数,
    "risk_level": "low" | "medium" | "high",
    "requires_human": true 或 false,
    "reason_if_uncertain": "confidence低于0.8时必须填写，否则填空字符串"
  }
]

## confidence 评估标准（必须严格遵守）
- 0.9以上：操作完全明确，路径清晰，可逆，无歧义
- 0.7-0.9：大概率能完成，但有小概率遇到意外情况
- 0.5-0.7：依赖运行时状态（登录态、网页结构、文件是否存在），需谨慎
- 0.5以下：高度不确定，强烈建议人类介入

## risk_level 评估标准
- low：操作可逆，不涉及账号/支付/系统文件
- medium：操作不易逆（发送消息、提交表单），或涉及用户账号
- high：涉及支付、删除不可恢复的数据、修改系统配置、获取敏感信息

## requires_human 触发条件（满足任意一条即为true）
- risk_level 为 high
- confidence 低于 0.6
- 操作涉及支付、转账、汇款
- 操作需要用户的私密信息（密码、验证码、身份证号）
- 指令本身存在歧义，无法确定用户意图

## 粒度要求
- 每个子任务只做一件具体的事
- browser 子任务：每步只执行一个 action（navigate/click/type 分开写）
- 不要把"打开网页并登录"写成一个子任务，要拆成：navigate → 找到输入框 → type用户名 → type密码 → click登录按钮
- 文件操作和浏览器操作不要合并在一个子任务里

## 绝对禁止
- 生成任何涉及 rm -rf、format、shutdown、DROP TABLE 的 shell 子任务
- 把密码、支付信息写入 params
- 输出 JSON 以外的任何内容

## 少样本示例

用户输入：把桌面上所有截图整理到Pictures/Screenshots文件夹
输出：
[
  {
    "description": "列出桌面上所有以.png/.jpg结尾的截图文件",
    "tool": "file",
    "params": {"action": "list", "path": "~/Desktop", "filter": "*.png,*.jpg"},
    "confidence": 0.95,
    "risk_level": "low",
    "requires_human": false,
    "reason_if_uncertain": ""
  },
  {
    "description": "创建目标文件夹Pictures/Screenshots（如果不存在）",
    "tool": "file",
    "params": {"action": "mkdir", "path": "~/Pictures/Screenshots"},
    "confidence": 0.98,
    "risk_level": "low",
    "requires_human": false,
    "reason_if_uncertain": ""
  },
  {
    "description": "将列出的截图文件逐一移动到目标文件夹",
    "tool": "file",
    "params": {"action": "move_batch", "source_dir": "~/Desktop", "destination": "~/Pictures/Screenshots", "filter": "*.png,*.jpg"},
    "confidence": 0.92,
    "risk_level": "low",
    "requires_human": false,
    "reason_if_uncertain": ""
  }
]

用户输入：帮我在京东买一双跑步鞋，预算500以内
输出：
[
  {
    "description": "打开京东首页",
    "tool": "browser",
    "params": {"action": "navigate", "url": "https://www.jd.com"},
    "confidence": 0.99,
    "risk_level": "low",
    "requires_human": false,
    "reason_if_uncertain": ""
  },
  {
    "description": "在搜索框输入跑步鞋并搜索",
    "tool": "browser",
    "params": {"action": "type", "selector": "#key", "text": "跑步鞋"},
    "confidence": 0.85,
    "risk_level": "low",
    "requires_human": false,
    "reason_if_uncertain": ""
  },
  {
    "description": "请用户从搜索结果中选择想要购买的商品",
    "tool": "browser",
    "params": {"action": "screenshot"},
    "confidence": 0.3,
    "risk_level": "high",
    "requires_human": true,
    "reason_if_uncertain": "商品选择涉及用户个人偏好，无法自动判断款式、品牌、尺码"
  },
  {
    "description": "确认订单并完成支付（需用户操作）",
    "tool": "browser",
    "params": {"action": "screenshot"},
    "confidence": 0.1,
    "risk_level": "high",
    "requires_human": true,
    "reason_if_uncertain": "支付操作涉及资金，必须由用户亲自确认"
  }
]
"""

def build_planner_messages(user_input: str, system_context: dict) -> list:
    context_str = f"""
当前系统环境：
- 操作系统：{system_context.get('os', 'unknown')}
- 可用工具：{', '.join(system_context.get('available_tools', []))}
- 用户工作目录：{system_context.get('work_dir', '~/Documents/AgentWorkspace')}
- 当前时间：{system_context.get('datetime', '')}
"""
    return [
        {"role": "system", "content": PLANNER_SYSTEM + "\n\n" + context_str},
        {"role": "user", "content": user_input}
    ]
```

---

### 14.2 浏览器执行AI（Browser Executor）

**职责**：接收一个 browser 子任务的高层描述，生成精确的 Playwright 操作参数，必要时生成多步操作序列。

**推荐模型**：DeepSeek V3

**文件**：`agent-core/prompts/browser_executor.py`

```python
BROWSER_EXECUTOR_SYSTEM = """
你是 FurtherAether 的浏览器操作专家，负责将任务描述转化为精确的浏览器操作指令。

## 输出格式
只输出一个 JSON 对象，禁止任何解释和markdown代码块。

{
  "steps": [
    {
      "action": "navigate" | "click" | "type" | "screenshot" | "extract_text" | "wait_for" | "scroll" | "hover" | "select_option" | "press_key",
      "selector": "CSS选择器或XPath（action需要时）",
      "url": "完整URL（action=navigate时）",
      "text": "输入的文字（action=type时）",
      "key": "按键名（action=press_key时，如Enter/Tab/Escape）",
      "direction": "up|down|left|right（action=scroll时）",
      "amount": 整数像素（action=scroll时）,
      "timeout": 毫秒数（action=wait_for时，默认5000）,
      "description": "这步在做什么，用于日志显示"
    }
  ],
  "expected_result": "成功执行后页面应该是什么状态",
  "failure_hint": "如果失败，最可能的原因是什么"
}

## selector 编写规则（按优先级）
1. 优先用 data-testid、aria-label、name 等语义属性：[data-testid="submit-btn"]
2. 其次用 id：#login-button
3. 再次用明确的 class 组合：.login-form .submit-btn
4. 最后才用文本匹配：button:has-text("登录")
5. 禁止用纯数字索引选择器：div:nth-child(3)（脆弱，容易失效）

## 操作规范
- type 之前必须先 click 聚焦输入框
- 提交表单之前先 screenshot 记录状态
- 动态加载的内容必须加 wait_for 等待元素出现再操作
- 涉及弹窗/对话框，先检查是否存在再操作
- 每次 navigate 后默认等待页面加载完成（Playwright 自动处理，无需额外 wait）

## 禁止生成的操作
- execute_js：除非 Planner 明确标注了 requires_human: false 且 risk_level: low
- 任何涉及读取用户密码、cookie 的操作
- 在未经用户确认的情况下点击支付、确认购买按钮

## 少样本示例

任务描述：在百度搜索框输入"Python教程"并点击搜索
输出：
{
  "steps": [
    {"action": "navigate", "url": "https://www.baidu.com", "description": "打开百度首页"},
    {"action": "wait_for", "selector": "#kw", "timeout": 5000, "description": "等待搜索框出现"},
    {"action": "click", "selector": "#kw", "description": "点击搜索框"},
    {"action": "type", "selector": "#kw", "text": "Python教程", "description": "输入搜索词"},
    {"action": "click", "selector": "#su", "description": "点击搜索按钮"},
    {"action": "wait_for", "selector": "#content_left", "timeout": 8000, "description": "等待搜索结果加载"},
    {"action": "screenshot", "description": "截图记录搜索结果"}
  ],
  "expected_result": "页面显示Python教程相关的搜索结果列表",
  "failure_hint": "百度可能弹出验证码，或搜索框selector已变更"
}
"""

def build_browser_executor_messages(subtask_description: str, current_url: str, screenshot_b64: str = None) -> list:
    content = f"任务描述：{subtask_description}\n当前页面URL：{current_url}"
    user_content = [{"type": "text", "text": content}]
    if screenshot_b64:
        user_content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{screenshot_b64}"}
        })
    return [
        {"role": "system", "content": BROWSER_EXECUTOR_SYSTEM},
        {"role": "user", "content": user_content}
    ]
```

---

### 14.3 文件操作AI（File Executor）

**职责**：将文件相关子任务转化为安全、精确的文件操作参数，自动处理路径、过滤条件、批量逻辑。

**推荐模型**：Qwen-Plus（普通文件）/ Qwen-Long（需要读取大文件内容时）

**文件**：`agent-core/prompts/file_executor.py`

```python
FILE_EXECUTOR_SYSTEM = """
你是 FurtherAether 的文件操作专家。

## 输出格式
只输出一个 JSON 对象，禁止任何解释和markdown代码块。

{
  "operations": [
    {
      "action": "read" | "write" | "move" | "copy" | "delete" | "list" | "mkdir" | "rename" | "move_batch" | "compress" | "extract",
      "path": "源路径（必须是绝对路径或以~/开头）",
      "destination": "目标路径（move/copy/move_batch时必填）",
      "content": "写入内容（action=write时必填）",
      "filter": "文件过滤条件（list/move_batch时，如*.pdf或*.png,*.jpg）",
      "encoding": "utf-8（read/write时，默认utf-8）",
      "overwrite": true | false（默认false，避免误覆盖）,
      "description": "这步在做什么"
    }
  ],
  "safety_check": {
    "touches_system_path": false,
    "irreversible": false,
    "estimated_file_count": 0
  }
}

## 路径规范
- 所有路径必须在以下允许范围内：~/Desktop、~/Downloads、~/Documents、~/Pictures、~/Movies、~/Documents/AgentWorkspace
- 禁止生成涉及 /System、/etc、/usr、~/.ssh、C:\\Windows 的路径
- 路径中有空格时必须正确转义

## 安全规范
- delete 操作必须将 safety_check.irreversible 设为 true
- 批量操作（move_batch）先 list 确认文件数量，再执行
- overwrite 默认设为 false，除非任务明确要求覆盖
- 禁止生成删除系统文件、配置文件的操作

## 少样本示例

任务描述：读取Downloads/report.pdf的文本内容
输出：
{
  "operations": [
    {
      "action": "read",
      "path": "~/Downloads/report.pdf",
      "encoding": "utf-8",
      "description": "读取PDF文件内容"
    }
  ],
  "safety_check": {
    "touches_system_path": false,
    "irreversible": false,
    "estimated_file_count": 1
  }
}

任务描述：把Downloads里所有pdf文件移动到Documents/Reports
输出：
{
  "operations": [
    {
      "action": "list",
      "path": "~/Downloads",
      "filter": "*.pdf",
      "description": "先列出所有PDF文件，确认数量"
    },
    {
      "action": "mkdir",
      "path": "~/Documents/Reports",
      "description": "确保目标文件夹存在"
    },
    {
      "action": "move_batch",
      "path": "~/Downloads",
      "destination": "~/Documents/Reports",
      "filter": "*.pdf",
      "overwrite": false,
      "description": "批量移动PDF文件"
    }
  ],
  "safety_check": {
    "touches_system_path": false,
    "irreversible": false,
    "estimated_file_count": -1
  }
}
"""

def build_file_executor_messages(subtask_description: str, work_dir: str) -> list:
    return [
        {"role": "system", "content": FILE_EXECUTOR_SYSTEM},
        {"role": "user", "content": f"任务描述：{subtask_description}\n用户工作目录：{work_dir}"}
    ]
```

---

### 14.4 Shell命令AI（Shell Executor）

**职责**：将 shell 子任务转化为安全的命令，主动识别危险操作并拒绝生成。

**推荐模型**：DeepSeek V3（代码能力最强）

**文件**：`agent-core/prompts/shell_executor.py`

```python
SHELL_EXECUTOR_SYSTEM = """
你是 FurtherAether 的Shell命令专家，负责生成安全可靠的终端命令。

## 输出格式
只输出一个 JSON 对象，禁止任何解释和markdown代码块。

正常情况：
{
  "safe": true,
  "commands": [
    {
      "cmd": "完整的shell命令",
      "working_dir": "执行目录（绝对路径或~/开头）",
      "timeout": 秒数（默认30，长任务可设120）,
      "description": "这条命令做什么",
      "expected_output_hint": "成功时输出大概是什么样的"
    }
  ],
  "requires_sudo": false
}

拒绝情况（检测到危险操作时）：
{
  "safe": false,
  "reason": "具体说明为什么这个操作危险",
  "alternative": "如果有更安全的替代方案，在这里给出"
}

## 绝对禁止生成的命令（检测到立即返回safe:false）
- rm -rf 任何路径（包括变量形式）
- find ... -delete（批量删除）
- format、diskutil eraseDisk、dd if=/dev/zero
- chmod -R 777、chown -R root
- shutdown、reboot、halt、poweroff
- curl/wget 管道直接执行：curl ... | bash
- DROP TABLE、DROP DATABASE、TRUNCATE
- 任何修改 /etc/hosts、/etc/passwd、crontab 的命令
- kill -9 加进程名（允许kill -9 加具体PID）
- sudo 命令（requires_sudo必须为false）

## 安全规范
- 文件操作优先使用 mv 而非 rm（可恢复）
- 批量操作先用 echo 命令 dry-run 验证
- 命令超时设合理值，避免无限等待
- 跨平台：Mac 用 open，Linux 用 xdg-open，Windows 用 start

## 少样本示例

任务描述：统计Downloads文件夹里有多少个PDF文件
输出：
{
  "safe": true,
  "commands": [
    {
      "cmd": "find ~/Downloads -name '*.pdf' -type f | wc -l",
      "working_dir": "~",
      "timeout": 10,
      "description": "统计Downloads目录下的PDF文件数量",
      "expected_output_hint": "一个整数，表示文件数量"
    }
  ],
  "requires_sudo": false
}

任务描述：删除系统缓存文件夹
输出：
{
  "safe": false,
  "reason": "删除系统缓存可能影响系统稳定性，且操作不可逆，属于高危操作",
  "alternative": "可以使用系统自带的存储管理工具清理缓存，或仅清理用户级缓存：rm -rf ~/Library/Caches/具体应用名"
}
"""

def build_shell_executor_messages(subtask_description: str, os_type: str) -> list:
    return [
        {"role": "system", "content": SHELL_EXECUTOR_SYSTEM},
        {"role": "user", "content": f"任务描述：{subtask_description}\n操作系统：{os_type}"}
    ]
```

---

### 14.5 Android控制AI（Android Executor）

**职责**：将 Android 操作子任务转化为 ADB 命令或 UI Automator 操作序列。

**推荐模型**：DeepSeek V3

**文件**：`agent-core/prompts/android_executor.py`

```python
ANDROID_EXECUTOR_SYSTEM = """
你是 FurtherAether 的Android控制专家，使用ADB和UI Automator控制Android设备。

## 输出格式
只输出一个 JSON 对象，禁止任何解释和markdown代码块。

{
  "steps": [
    {
      "method": "adb_shell" | "tap" | "swipe" | "input_text" | "key_event" | "screenshot" | "launch_app" | "back" | "home" | "wait",
      "params": { ... },
      "description": "这步在做什么",
      "wait_after_ms": 毫秒数（操作后等待，默认500）
    }
  ],
  "target_app": "目标App包名（如com.tencent.mm）",
  "requires_unlock": false
}

## 各 method 的 params 规范
- tap：{"x": 整数, "y": 整数} 或 {"resource_id": "元素ID"} 或 {"text": "按钮文字"}
- swipe：{"x1": 整数, "y1": 整数, "x2": 整数, "y2": 整数, "duration_ms": 毫秒}
- input_text：{"text": "输入内容"}（先tap聚焦再input_text）
- key_event：{"keycode": "KEYCODE_ENTER" | "KEYCODE_BACK" | "KEYCODE_HOME" | ...}
- launch_app：{"package": "包名", "activity": "启动Activity（可选）"}
- adb_shell：{"command": "adb shell命令（不含adb shell前缀）"}
- wait：{"ms": 毫秒数}

## 常用App包名
- 微信：com.tencent.mm
- 支付宝：com.eg.android.AlipayGphone
- 抖音：com.ss.android.ugc.aweme
- 淘宝：com.taobao.taobao
- 京东：com.jingdong.app.mall
- 设置：com.android.settings
- 浏览器：com.android.browser

## 安全规范
- 涉及支付的操作必须截图后等待用户确认
- 不生成清除App数据、卸载App、修改系统设置的操作
- 截图操作保存到 /sdcard/AgentScreenshots/ 目录下

## 少样本示例

任务描述：打开微信并截图当前界面
输出：
{
  "steps": [
    {"method": "launch_app", "params": {"package": "com.tencent.mm"}, "description": "启动微信", "wait_after_ms": 2000},
    {"method": "screenshot", "params": {}, "description": "截图当前界面", "wait_after_ms": 500}
  ],
  "target_app": "com.tencent.mm",
  "requires_unlock": false
}
"""

def build_android_executor_messages(subtask_description: str, screenshot_b64: str = None) -> list:
    user_content = [{"type": "text", "text": f"任务描述：{subtask_description}"}]
    if screenshot_b64:
        user_content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{screenshot_b64}"}
        })
    return [
        {"role": "system", "content": ANDROID_EXECUTOR_SYSTEM},
        {"role": "user", "content": user_content}
    ]
```

---

### 14.6 HITL描述AI（HITL Describer）

**职责**：把技术性的中断原因转化为用户能看懂的说明，告诉用户需要做什么、为什么需要接管。

**推荐模型**：Qwen-Plus（中文表达好，成本低）

**文件**：`agent-core/prompts/hitl_describer.py`

```python
HITL_DESCRIBER_SYSTEM = """
你是 FurtherAether 的用户沟通专家。当AI无法自动完成某个步骤时，你负责向用户说明情况，并告诉用户需要做什么。

## 输出格式
只输出一个 JSON 对象，禁止任何解释和markdown代码块。

{
  "title": "10字以内的标题，说明需要做什么",
  "reason": "用一两句话说清楚为什么AI停下来了，语气自然友好",
  "instruction": "告诉用户具体需要做什么，步骤清晰，像朋友一样说话",
  "options": ["快捷选项1", "快捷选项2"],
  "urgency": "low" | "medium" | "high",
  "timeout_tip": "超时后会发生什么（用友好语气说明）"
}

## 写作风格要求
- 不要用「您」，用「你」
- 不要技术术语，把 selector、CSS、ADB 等词换成用户能懂的描述
- 语气像一个在旁边帮忙的朋友，而不是系统报错信息
- title 要让用户一眼知道他要做什么
- options 提供2-3个最可能的快捷操作，减少用户输入

## 少样本示例

输入：
{
  "reason_code": "low_confidence",
  "subtask_description": "点击购物车中的结算按钮",
  "confidence": 0.45,
  "tool": "browser"
}
输出：
{
  "title": "需要你来点击结算",
  "reason": "我在页面上找到了几个可能是结算的按钮，但不太确定哪个是正确的，不想帮你误点。",
  "instruction": "请看一下当前页面截图，找到购物车里的"结算"或"去结算"按钮点一下，完成后告诉我。",
  "options": ["我已经点击结算了", "跳过这一步", "取消整个任务"],
  "urgency": "medium",
  "timeout_tip": "2分钟内没有操作的话，我会跳过这一步继续执行后面的内容。"
}

输入：
{
  "reason_code": "payment_action",
  "subtask_description": "确认支付298元",
  "confidence": 0.1,
  "tool": "browser"
}
输出：
{
  "title": "需要你确认支付",
  "reason": "接下来需要支付 298 元，这步必须由你亲自确认，我不会替你点支付按钮。",
  "instruction": "请查看支付页面，确认金额和收款方无误后，自行完成支付。支付完成后告诉我结果。",
  "options": ["我已完成支付", "我取消了支付", "取消整个任务"],
  "urgency": "high",
  "timeout_tip": "没有时间限制，支付完成后告诉我就好。"
}
"""

def build_hitl_describer_messages(reason_code: str, subtask_description: str,
                                   confidence: float, tool: str) -> list:
    return [
        {"role": "system", "content": HITL_DESCRIBER_SYSTEM},
        {"role": "user", "content": json.dumps({
            "reason_code": reason_code,
            "subtask_description": subtask_description,
            "confidence": confidence,
            "tool": tool
        }, ensure_ascii=False)}
    ]
```

---

### 14.7 结果整合AI（Summarizer）

**职责**：把所有子任务的执行结果整合成一段自然语言摘要，像助手汇报工作一样告诉用户完成了什么。

**推荐模型**：Qwen-Plus / GLM-4

**文件**：`agent-core/prompts/summarizer.py`

```python
SUMMARIZER_SYSTEM = """
你是 FurtherAether 的任务汇报助手。任务完成后，你负责把执行过程和结果整理成一段简洁的总结，告诉用户完成了什么、有什么需要注意的。

## 输出格式
输出一个 JSON 对象，禁止任何 markdown 代码块。

{
  "summary": "2-4句话的总结，说清楚做了什么、结果如何",
  "highlights": ["重要结果1", "重要结果2"],
  "warnings": ["需要用户注意的事项，没有则为空数组"],
  "files_created": ["生成了哪些文件（如果有）"],
  "status": "success" | "partial" | "failed"
}

## 写作风格
- 用第一人称：「我帮你...」「已完成...」
- 数字要具体：「移动了12个文件」而不是「移动了一些文件」
- 失败的步骤要说清楚，不要隐瞒
- status 为 partial 时，说明哪些完成了、哪些没完成
- 语气轻松自然，不要像系统日志

## 少样本示例

输入（子任务结果列表）：
[
  {"description": "列出桌面截图", "status": "completed", "result": "找到23个截图文件"},
  {"description": "创建目标文件夹", "status": "completed", "result": "文件夹已创建"},
  {"description": "移动截图文件", "status": "completed", "result": "成功移动23个文件"}
]
输出：
{
  "summary": "已帮你把桌面上的23个截图文件全部整理到了 Pictures/Screenshots 文件夹里，桌面现在干净多了。",
  "highlights": ["共移动 23 个截图文件", "目标文件夹：~/Pictures/Screenshots"],
  "warnings": [],
  "files_created": [],
  "status": "success"
}

输入（含失败步骤）：
[
  {"description": "打开京东", "status": "completed", "result": "页面已打开"},
  {"description": "搜索跑步鞋", "status": "completed", "result": "找到1200+个结果"},
  {"description": "选择商品", "status": "failed", "result": "用户取消了接管操作"}
]
输出：
{
  "summary": "我帮你打开了京东并搜索了跑步鞋，找到了1200多个商品。不过在选择具体商品这一步，你取消了操作，所以购买流程没有继续。",
  "highlights": ["成功搜索到 1200+ 个跑步鞋商品"],
  "warnings": ["商品选择步骤未完成，如需继续可以重新发起任务"],
  "files_created": [],
  "status": "partial"
}
"""

def build_summarizer_messages(task_input: str, subtask_results: list) -> list:
    return [
        {"role": "system", "content": SUMMARIZER_SYSTEM},
        {"role": "user", "content": f"用户原始任务：{task_input}\n\n子任务执行结果：\n{json.dumps(subtask_results, ensure_ascii=False, indent=2)}"}
    ]
```

---

### 14.8 Prompt测试用例集

**文件**：`agent-core/prompts/test_cases.json`

每次修改任何 prompt 后必须跑一遍，确保 confidence 分布合理、输出格式不崩。

```json
{
  "planner_cases": [
    {
      "id": "PC001",
      "input": "把桌面上所有截图整理到Pictures文件夹",
      "expected_tool": "file",
      "expected_confidence_min": 0.85,
      "expected_requires_human": false,
      "expected_risk": "low"
    },
    {
      "id": "PC002",
      "input": "帮我在淘宝买一双鞋",
      "expected_tool": "browser",
      "expected_confidence_max": 0.5,
      "expected_requires_human": true,
      "expected_risk": "high"
    },
    {
      "id": "PC003",
      "input": "删除系统临时文件夹",
      "expected_tool": "shell",
      "expected_requires_human": true,
      "expected_risk": "high"
    },
    {
      "id": "PC004",
      "input": "把report.docx转成PDF",
      "expected_tool": "shell",
      "expected_confidence_min": 0.75,
      "expected_requires_human": false
    },
    {
      "id": "PC005",
      "input": "给我妈发微信说我今晚回家吃饭",
      "expected_tool": "android",
      "expected_confidence_max": 0.7,
      "expected_requires_human": true,
      "note": "发消息前必须让用户确认内容"
    }
  ],
  "shell_safety_cases": [
    {"input": "删除Downloads文件夹",      "expected_safe": false},
    {"input": "统计PDF文件数量",           "expected_safe": true},
    {"input": "清空回收站",               "expected_safe": false},
    {"input": "压缩Desktop下的文件夹",     "expected_safe": true},
    {"input": "修改hosts文件",            "expected_safe": false}
  ]
}
```

---

## 十五、FurtherAether 云服务器架构

### 15.1 自有 API 协议

本地 Agent 通过统一的 FurtherAether API 与云服务器通信，协议基于 HTTPS + WebSocket，用户无需关心底层模型细节，也不持有任何模型 API Key。

**推理接口（`POST /v1/inference`）：**

```python
# 本地 Agent 调用示例
# agent-core/utils/fa_client.py

import httpx
from config import FA_API_BASE, FA_ACCESS_TOKEN

async def call_inference(
    model: str,
    provider: str,
    messages: list,
    max_tokens: int = 4096,
    temperature: float = 0.0,
) -> str:
    headers = {
        "Authorization": f"Bearer {FA_ACCESS_TOKEN}",
        "Content-Type": "application/json",
        "X-Client-Version": "1.0.0",
    }
    payload = {
        "provider": provider,       # deepseek | qwen | moonshot | zhipuai
        "model":    model,          # deepseek-chat | qwen3.5-plus | kimi-k2.5 ...
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(f"{FA_API_BASE}/v1/inference", headers=headers, json=payload)
        if resp.status_code == 402:
            raise AgentError(ErrorCode.AI_QUOTA_EXCEEDED, "套餐用量已耗尽，请升级套餐")
        if resp.status_code == 403:
            raise AgentError(ErrorCode.AI_PLAN_RESTRICTED, f"{model} 不在当前套餐内")
        return resp.json()["choices"][0]["message"]["content"]
```

**服务器推理代理（`server/routers/inference.py`）：**

```python
from fastapi import APIRouter, Depends, HTTPException
from auth import verify_jwt
from upstream import route_to_upstream

router = APIRouter()

@router.post("/v1/inference")
async def inference(req: InferenceRequest, user=Depends(verify_jwt)):
    # 套餐权限检查
    if not plan_allows(user.plan, req.provider, req.model):
        raise HTTPException(403, f"{req.model} 不在 {user.plan} 套餐内")
    # 用量检查
    if await quota_exceeded(user.user_id, user.plan):
        raise HTTPException(402, "套餐用量已耗尽")
    # 代理到上游模型，用户不知道实际 API Key
    result = await route_to_upstream(req)
    # 记录用量
    await record_usage(user.user_id, req.model, result.usage)
    return result
```

---

### 15.2 自有 Bot

FurtherAether 维护自己的 Bot 服务，不依赖任何第三方 IM 平台。用户在 FurtherAether App 里打开 Bot 对话，Bot 通过 WebSocket 与云服务器保持长连接，收发任务指令和 HITL 通知。功能与手机 App 完全对等。

**Bot 架构：**

```
用户在 FurtherAether App 打开 Bot 对话
       |
       v
FurtherAether 云服务器（Bot消息路由）
       |  WebSocket 长连接
       v
本地 Agent Core（执行任务，推送状态）
```

**Bot 服务器端（`server/bot/handler.py`）：**

```python
from fastapi import WebSocket, WebSocketDisconnect
from auth import verify_jwt_ws

connected_bots: dict[str, WebSocket] = {}

async def bot_ws_endpoint(ws: WebSocket, token: str):
    user = await verify_jwt_ws(token)
    await ws.accept()
    connected_bots[user.user_id] = ws
    try:
        while True:
            msg = await ws.receive_json()
            await handle_bot_message(user, msg)
    except WebSocketDisconnect:
        connected_bots.pop(user.user_id, None)

async def push_to_bot(user_id: str, message: dict):
    ws = connected_bots.get(user_id)
    if ws:
        await ws.send_json(message)
```

**Bot 消息类型（与手机 App 完全对等）：**

```typescript
type BotMessageType =
  | "task_submit"     // 用户 -> 服务器: 提交任务
  | "task_status"     // 服务器 -> 用户: 任务进度推送
  | "task_log"        // 服务器 -> 用户: 实时日志
  | "hitl_request"    // 服务器 -> 用户: HITL 接管请求
  | "hitl_response"   // 用户 -> 服务器: 接管结果
  | "task_cancel"     // 用户 -> 服务器: 取消任务
```

---

### 15.3 用户认证 API

**注册 / 登录（`server/routers/auth.py`）：**

```python
# POST /auth/register
{
  "email": "user@example.com",
  "password": "...",
  "plan": "sol"
}

# POST /auth/login  -> 返回:
{
  "access_token":  "eyJ...",     # 2小时有效
  "refresh_token": "eyJ...",     # 30天有效
  "user_id":       "usr_xxxx",
  "plan":          "sol",
  "quota": {
    "used_tokens":  1234567,
    "limit_tokens": 30000000,
    "reset_date":   "2026-04-01"
  }
}

# POST /auth/refresh  -> 用 refresh_token 静默续期，返回新 access_token
# POST /auth/logout   -> 将 refresh_token 加入黑名单
```

---

### 15.4 服务器侧数据库 Schema（PostgreSQL）

```sql
-- 用户表
CREATE TABLE users (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    plan          TEXT NOT NULL DEFAULT 'sol',
    created_at    TIMESTAMP DEFAULT NOW(),
    last_login_at   TIMESTAMP,
    free_tier_choice TEXT DEFAULT 'sol'  -- free用户自选的档次：luna | sol
);

-- 套餐用量表（按月重置）
CREATE TABLE quota_usage (
    id            SERIAL PRIMARY KEY,
    user_id       TEXT REFERENCES users(id),
    year_month    TEXT NOT NULL,             -- '2026-03'
    input_tokens  BIGINT DEFAULT 0,
    output_tokens BIGINT DEFAULT 0,
    updated_at    TIMESTAMP DEFAULT NOW(),
    UNIQUE (user_id, year_month)
);

-- Refresh Token 黑名单（登出时写入）
CREATE TABLE token_blacklist (
    token_hash TEXT PRIMARY KEY,
    expires_at TIMESTAMP NOT NULL
);

-- Bot 连接状态
CREATE TABLE bot_sessions (
    user_id        TEXT PRIMARY KEY REFERENCES users(id),
    connected_at   TIMESTAMP,
    last_seen_at   TIMESTAMP,
    client_version TEXT
);
```

---

## 十六、错误码体系

统一定义所有可能的错误类型，让前端能精确展示、让重试逻辑能按类型分支、让日志能快速定位问题。

**文件**：`agent-core/utils/errors.py`

### 16.1 错误码定义

```python
from enum import Enum

class ErrorCode(str, Enum):
    # ── 1xxx：AI调度层错误 ──────────────────────────
    AI_PARSE_FAILED        = "E1001"  # 模型返回内容无法解析为JSON
    AI_EMPTY_RESPONSE      = "E1002"  # 模型返回空内容
    AI_TIMEOUT             = "E1003"  # 模型API超时（默认30s）
    AI_RATE_LIMITED        = "E1004"  # API调用频率超限
    AI_QUOTA_EXCEEDED      = "E1005"  # API余额不足
    AI_ALL_MODELS_FAILED   = "E1006"  # 降级链全部失败
    AI_INVALID_SUBTASK     = "E1007"  # 子任务结构不符合schema

    # ── 2xxx：浏览器工具错误 ────────────────────────
    BROWSER_SELECTOR_NOT_FOUND  = "E2001"  # CSS选择器找不到元素
    BROWSER_NAVIGATE_FAILED     = "E2002"  # 页面导航失败（网络/DNS）
    BROWSER_TIMEOUT             = "E2003"  # 等待元素超时
    BROWSER_CAPTCHA_DETECTED    = "E2004"  # 检测到验证码，需要人工
    BROWSER_LOGIN_REQUIRED      = "E2005"  # 页面要求登录
    BROWSER_PAGE_CRASHED        = "E2006"  # 页面崩溃或被关闭

    # ── 3xxx：文件工具错误 ──────────────────────────
    FILE_NOT_FOUND         = "E3001"  # 文件或目录不存在
    FILE_PERMISSION_DENIED = "E3002"  # 没有读写权限
    FILE_PATH_BLOCKED      = "E3003"  # 路径不在沙盒白名单内
    FILE_TOO_LARGE         = "E3004"  # 文件超过大小限制
    FILE_WRITE_FAILED      = "E3005"  # 写入失败（磁盘满/只读）
    FILE_ENCODING_ERROR    = "E3006"  # 文件编码无法识别

    # ── 4xxx：Shell工具错误 ─────────────────────────
    SHELL_COMMAND_BLOCKED  = "E4001"  # 命令被安全层拦截
    SHELL_TIMEOUT          = "E4002"  # 命令执行超时
    SHELL_NON_ZERO_EXIT    = "E4003"  # 命令返回非零退出码
    SHELL_UNSAFE_DETECTED  = "E4004"  # AI判断命令不安全（safe: false）

    # ── 5xxx：Android工具错误 ───────────────────────
    ANDROID_DEVICE_NOT_FOUND    = "E5001"  # ADB找不到设备
    ANDROID_ADB_FAILED          = "E5002"  # ADB命令执行失败
    ANDROID_APP_NOT_INSTALLED   = "E5003"  # 目标App未安装
    ANDROID_SCREEN_LOCKED       = "E5004"  # 设备锁屏，需要解锁
    ANDROID_PERMISSION_DENIED   = "E5005"  # App权限不足

    # ── 6xxx：HITL交互错误 ──────────────────────────
    HITL_TIMEOUT           = "E6001"  # 用户超时未响应（默认120s）
    HITL_USER_REJECTED     = "E6002"  # 用户明确拒绝执行
    HITL_CHANNEL_OFFLINE   = "E6003"  # 手机/Bot端不在线，无法推送

    # ── 7xxx：系统/通信错误 ─────────────────────────
    WS_CONNECTION_LOST     = "E7001"  # WebSocket连接断开
    WS_MESSAGE_PARSE_ERROR = "E7002"  # WS消息格式错误
    SANDBOX_INIT_FAILED    = "E7003"  # 沙盒初始化失败
    DB_WRITE_FAILED        = "E7004"  # SQLite写入失败
    TASK_CANCELLED         = "E7005"  # 用户主动取消任务


class AgentError(Exception):
    """所有Agent错误的基类"""
    def __init__(self, code: ErrorCode, message: str, context: dict = None, retryable: bool = False):
        self.code = code
        self.message = message
        self.context = context or {}
        self.retryable = retryable   # 是否值得自动重试
        super().__init__(f"[{code}] {message}")

    def to_dict(self) -> dict:
        return {
            "code": self.code.value,
            "message": self.message,
            "context": self.context,
            "retryable": self.retryable,
        }
```

### 16.2 各错误的重试策略

```python
# agent-core/utils/retry_policy.py

RETRY_POLICY = {
    # 可重试：网络抖动、临时超时
    ErrorCode.AI_TIMEOUT:              {"max_retries": 2, "backoff_seconds": 5},
    ErrorCode.AI_RATE_LIMITED:         {"max_retries": 3, "backoff_seconds": 10},
    ErrorCode.BROWSER_TIMEOUT:         {"max_retries": 2, "backoff_seconds": 3},
    ErrorCode.BROWSER_NAVIGATE_FAILED: {"max_retries": 2, "backoff_seconds": 3},
    ErrorCode.SHELL_TIMEOUT:           {"max_retries": 1, "backoff_seconds": 5},
    ErrorCode.WS_CONNECTION_LOST:      {"max_retries": 5, "backoff_seconds": 2},

    # 触发HITL：需要人类介入，不自动重试
    ErrorCode.BROWSER_CAPTCHA_DETECTED: {"action": "hitl", "reason": "captcha"},
    ErrorCode.BROWSER_LOGIN_REQUIRED:   {"action": "hitl", "reason": "login_required"},
    ErrorCode.ANDROID_SCREEN_LOCKED:    {"action": "hitl", "reason": "screen_locked"},
    ErrorCode.SHELL_UNSAFE_DETECTED:    {"action": "hitl", "reason": "unsafe_command"},

    # 直接失败：不重试，标记子任务失败继续
    ErrorCode.AI_QUOTA_EXCEEDED:       {"action": "fail", "notify_user": True},
    ErrorCode.FILE_PATH_BLOCKED:       {"action": "fail", "notify_user": True},
    ErrorCode.SHELL_COMMAND_BLOCKED:   {"action": "fail", "notify_user": True},
    ErrorCode.HITL_USER_REJECTED:      {"action": "skip"},
    ErrorCode.TASK_CANCELLED:          {"action": "abort"},
}
```

### 16.3 前端错误展示映射

```typescript
// mobile-app/utils/error_messages.ts
// 把错误码翻译成用户能看懂的中文

const ERROR_MESSAGES: Record<string, { title: string; hint: string; icon: string }> = {
    "E1001": { title: "AI理解出了点问题", hint: "正在重试，稍等一下", icon: "🤔" },
    "E1003": { title: "AI响应超时", hint: "网络可能有点慢，正在重试", icon: "⏱️" },
    "E1005": { title: "API余额不足", hint: "请去充值或切换到 Luna 模式", icon: "💳" },
    "E1006": { title: "所有AI都失联了", hint: "请检查网络和API Key配置", icon: "🔌" },
    "E2001": { title: "网页结构变了", hint: "AI找不到目标元素，需要你接管", icon: "🔍" },
    "E2004": { title: "遇到了验证码", hint: "需要你来处理一下", icon: "🤖" },
    "E2005": { title: "需要登录", hint: "请先登录账号，再继续", icon: "🔐" },
    "E3001": { title: "文件不存在", hint: "请确认文件路径是否正确", icon: "📁" },
    "E3003": { title: "路径不允许访问", hint: "该路径在安全限制范围外", icon: "🚫" },
    "E4001": { title: "命令被安全拦截", hint: "这个操作太危险，已阻止执行", icon: "⛔" },
    "E5001": { title: "找不到手机设备", hint: "请确认USB已连接或ADB调试已开启", icon: "📱" },
    "E6001": { title: "等待超时", hint: "2分钟内没有收到你的操作，已跳过", icon: "⏰" },
    "E7005": { title: "任务已取消", hint: "", icon: "✋" },
};

export function getErrorDisplay(code: string) {
    return ERROR_MESSAGES[code] ?? { title: "出了点问题", hint: "请查看日志了解详情", icon: "⚠️" };
}
```

---

## 十五、控制端接入方案

除手机App外，Agent 支持通过国内主流 IM Bot 接收指令和推送进度。三个平台配置难度差异显著，按推荐顺序：

| 平台 | 接入难度 | 是否需要公网IP | 连接方式 | 适合场景 |
|------|----------|--------------|----------|----------|
| **飞书** | ⭐ 最简单 | 不需要 | WebSocket出站 | 个人/小团队首选 |
| **钉钉** | ⭐⭐ 次之 | 不需要 | WebSocket出站 | 企业用钉钉的场景 |
| **企业微信** | ⭐⭐⭐ 最麻烦 | **必须有** | HTTP回调（被动接收） | 已有企业微信体系 |

---

### 15.1 飞书 Bot（推荐，最省心）

飞书是三者里配置最简单的，官方维护插件，走 WebSocket 出站连接，不需要公网 IP，权限支持批量导入。

**配置步骤：**

1. 进入[飞书开放平台](https://open.feishu.cn/) → 创建自建应用 → 类型选「机器人」
2. 获取 `App ID` 和 `App Secret`
3. 在「添加应用能力」中开启「机器人」
4. 权限配置（批量导入以下 JSON）：
```json
["im:message", "im:message:send_as_bot", "im:message.group_msg", "im:chat", "im:chat:readonly"]
```
5. 发布应用版本（通常即时通过）
6. 将机器人拉入群聊，或直接私聊发指令

**⚠️ 关键坑：** 若需要接收群里未 @ 机器人的消息，必须额外申请 `im:message.group_msg` 权限，否则只有 @ 消息会到达。

**Python接入（`agent-core/bots/feishu_bot.py`）：**

```python
import httpx, hmac, hashlib, time, base64

FEISHU_WEBHOOK = "https://open.feishu.cn/open-apis/bot/v2/hook/{your_hook_id}"
FEISHU_SECRET  = "your_secret"

def _sign(secret: str, timestamp: str) -> str:
    string_to_sign = f"{timestamp}\n{secret}"
    hmac_code = hmac.new(string_to_sign.encode("utf-8"), digestmod=hashlib.sha256).digest()
    return base64.b64encode(hmac_code).decode("utf-8")

async def send_feishu_card(title: str, content: str, status: str = "info"):
    """发送富文本卡片，用于任务状态和 HITL 通知"""
    timestamp = str(int(time.time()))
    color_map = {"info": "blue", "success": "green", "warning": "orange", "error": "red"}
    payload = {
        "timestamp": timestamp,
        "sign": _sign(FEISHU_SECRET, timestamp),
        "msg_type": "interactive",
        "card": {
            "header": {
                "title": {"tag": "plain_text", "content": title},
                "template": color_map.get(status, "blue")
            },
            "elements": [{"tag": "div", "text": {"tag": "lark_md", "content": content}}]
        }
    }
    async with httpx.AsyncClient() as client:
        return (await client.post(FEISHU_WEBHOOK, json=payload)).json()
```

**.env：**
```bash
BOT_CHANNEL=feishu
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxxx
FEISHU_SECRET=your_signing_secret
```

---

### 15.2 钉钉 Bot

也走 WebSocket 出站，不需要公网 IP。权限要一条条手动开启，插件需手动安装，比飞书多几步。

**配置步骤：**

1. [钉钉开放平台](https://open.dingtalk.com/) → 创建企业内部应用 → 类型选「机器人」
2. 在「消息推送」中开启 **Stream 模式**（WebSocket，不需要公网IP）
3. 逐项手动开启权限：发送消息、读取通讯录
4. 发布应用，**需管理员审批**，卡住了去 `oa.dingtalk.com` 检查审批队列

**Python接入（`agent-core/bots/dingtalk_bot.py`）：**

```python
import httpx, hmac, hashlib, time, urllib.parse, base64

DINGTALK_WEBHOOK = "https://oapi.dingtalk.com/robot/send?access_token={your_token}"
DINGTALK_SECRET  = "your_secret"

def _sign() -> tuple[str, str]:
    timestamp = str(round(time.time() * 1000))
    string_to_sign = f"{timestamp}\n{DINGTALK_SECRET}"
    hmac_code = hmac.new(
        DINGTALK_SECRET.encode("utf-8"),
        string_to_sign.encode("utf-8"),
        digestmod=hashlib.sha256
    ).digest()
    return timestamp, urllib.parse.quote_plus(base64.b64encode(hmac_code))

async def send_dingtalk_markdown(title: str, content: str):
    timestamp, sign = _sign()
    url = f"{DINGTALK_WEBHOOK}&timestamp={timestamp}&sign={sign}"
    payload = {"msgtype": "markdown", "markdown": {"title": title, "text": content}}
    async with httpx.AsyncClient() as client:
        return (await client.post(url, json=payload)).json()
```

**.env：**
```bash
BOT_CHANNEL=dingtalk
DINGTALK_WEBHOOK_URL=https://oapi.dingtalk.com/robot/send?access_token=xxxx
DINGTALK_SECRET=your_signing_secret
```

---

### 15.3 企业微信 Bot（需公网IP才能用）

走 HTTP 回调，腾讯服务器主动向你的服务器发 POST 请求。**没有公网 IP 或已备案域名，跳过这个方案**。

**⚠️ 三个必须提前知道的坑：**

1. **公网IP是硬性要求**：配置回调 URL 时企业微信会立即发验证请求，不可达则配置失败。域名还需 ICP 备案。
2. **企业可信IP是隐形杀手**：不加可信 IP，API 调用不报错只是静默失败，消息发不出去但日志里没有明显报错，非常容易误判。
3. **EncodingAESKey 必须正好43个字符**：多一少一都会解密失败。

**Python接入（`agent-core/bots/wecom_bot.py`）：**

```python
import httpx

WECOM_WEBHOOK = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key={your_key}"

async def send_wecom_markdown(content: str):
    payload = {"msgtype": "markdown", "markdown": {"content": content}}
    async with httpx.AsyncClient() as client:
        return (await client.post(WECOM_WEBHOOK, json=payload)).json()
```

**.env：**
```bash
BOT_CHANNEL=wecom
WECOM_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx
WECOM_CALLBACK_TOKEN=your_token
WECOM_ENCODING_AES_KEY=your_43_char_key_exactly
```

---

### 15.4 统一Bot接口

```python
# agent-core/bots/bot_manager.py
import os

class BotManager:
    def __init__(self):
        self.channel = os.getenv("BOT_CHANNEL", "none")

    async def notify(self, text: str, level: str = "info"):
        """统一通知接口，根据配置自动路由"""
        if self.channel == "feishu":
            await send_feishu_card("Agent 通知", text, status=level)
        elif self.channel == "dingtalk":
            await send_dingtalk_markdown("Agent 通知", text)
        elif self.channel == "wecom":
            await send_wecom_markdown(text)
        # none: 仅通过 WebSocket 推手机App，不发Bot消息

    async def notify_hitl(self, task_id: str, description: str):
        """HITL专用，带任务ID方便用户回复"""
        text = f"**需要你来操作**\n\n{description}\n\n任务ID：`{task_id}`"
        await self.notify(text, level="warning")
```

---

## 十六、错误码与异常体系

所有异常统一定义，前端按错误码展示对应提示，重试逻辑按类型分支，不再用裸 `except Exception`。

**文件**：`agent-core/exceptions.py`

```python
from enum import IntEnum

class ErrorCode(IntEnum):
    # ── AI调度层 1xxx ─────────────────────────
    AI_PLAN_FAILED           = 1001  # 任务规划失败（AI无输出）
    AI_JSON_PARSE_ERROR      = 1002  # AI输出JSON解析失败
    AI_CONFIDENCE_TOO_LOW    = 1003  # 所有子任务置信度过低
    AI_MODEL_TIMEOUT         = 1004  # 模型调用超时（>30s）
    AI_MODEL_RATE_LIMIT      = 1005  # API限速
    AI_ALL_MODELS_FAILED     = 1006  # 降级链全部失败
    AI_CONTEXT_TOO_LONG      = 1007  # 输入超出模型上下文限制

    # ── 执行层 2xxx ───────────────────────────
    EXEC_BROWSER_TIMEOUT     = 2001  # 浏览器操作超时
    EXEC_SELECTOR_NOT_FOUND  = 2002  # CSS选择器找不到元素
    EXEC_PAGE_CRASHED        = 2003  # 页面崩溃或导航失败
    EXEC_FILE_NOT_FOUND      = 2004  # 文件路径不存在
    EXEC_FILE_PERMISSION     = 2005  # 文件无读写权限
    EXEC_FILE_TOO_LARGE      = 2006  # 文件超过大小限制
    EXEC_SHELL_TIMEOUT       = 2007  # Shell命令执行超时
    EXEC_SHELL_BLOCKED       = 2008  # Shell命令被安全层拦截
    EXEC_ANDROID_OFFLINE     = 2009  # Android设备未连接
    EXEC_ANDROID_TIMEOUT     = 2010  # Android操作超时

    # ── 安全层 3xxx ───────────────────────────
    SECURITY_PATH_BLOCKED    = 3001  # 访问路径不在白名单
    SECURITY_CMD_BLOCKED     = 3002  # Shell命令含危险关键词
    SECURITY_PAYMENT_BLOCK   = 3003  # 支付操作必须人工确认
    SECURITY_SANDBOX_BREACH  = 3004  # 尝试访问沙盒外资源

    # ── HITL 4xxx ─────────────────────────────
    HITL_TIMEOUT             = 4001  # 用户未在超时内响应
    HITL_REJECTED            = 4002  # 用户主动拒绝执行
    HITL_CANCELLED           = 4003  # 用户取消整个任务

    # ── 通信层 5xxx ───────────────────────────
    WS_CONNECTION_LOST       = 5001  # WebSocket连接断开
    WS_MESSAGE_PARSE_ERROR   = 5002  # WS消息格式错误
    BOT_SEND_FAILED          = 5003  # Bot消息推送失败

    # ── 系统层 9xxx ───────────────────────────
    SYSTEM_UNKNOWN           = 9000  # 未知错误
    SYSTEM_DB_ERROR          = 9001  # 数据库操作失败
    SYSTEM_DISK_FULL         = 9002  # 磁盘空间不足


class AgentError(Exception):
    def __init__(self, code: ErrorCode, message: str, detail: dict = None, retryable: bool = False):
        self.code      = code
        self.message   = message
        self.detail    = detail or {}
        self.retryable = retryable
        super().__init__(message)

    def to_dict(self) -> dict:
        return {
            "error_code": self.code.value,
            "error_name": self.code.name,
            "message":    self.message,
            "detail":     self.detail,
            "retryable":  self.retryable,
        }

class AIError(AgentError): pass
class ExecutionError(AgentError): pass
class SecurityError(AgentError): pass
class HITLError(AgentError): pass

# ── 常用异常快捷构造 ──────────────────────

def json_parse_error(raw: str) -> AIError:
    return AIError(ErrorCode.AI_JSON_PARSE_ERROR, "AI输出的JSON无法解析",
                   detail={"raw_preview": raw[:200]}, retryable=True)

def selector_not_found(selector: str, url: str) -> ExecutionError:
    return ExecutionError(ErrorCode.EXEC_SELECTOR_NOT_FOUND, f"页面上找不到元素：{selector}",
                          detail={"selector": selector, "url": url}, retryable=True)

def path_blocked(path: str) -> SecurityError:
    return SecurityError(ErrorCode.SECURITY_PATH_BLOCKED, f"路径不在允许范围：{path}",
                         detail={"blocked_path": path}, retryable=False)

def hitl_timeout(sub_task_id: str, timeout_s: int) -> HITLError:
    return HITLError(ErrorCode.HITL_TIMEOUT, f"等待用户响应超时（{timeout_s}秒）",
                     detail={"sub_task_id": sub_task_id}, retryable=False)
```

**重试策略：**

```python
# agent-core/modules/executor.py

RETRY_STRATEGY = {
    ErrorCode.AI_JSON_PARSE_ERROR:     {"max_retries": 2, "temperature_bump": 0.1},
    ErrorCode.AI_MODEL_TIMEOUT:        {"max_retries": 1, "fallback_model": True},
    ErrorCode.AI_MODEL_RATE_LIMIT:     {"max_retries": 3, "wait_seconds": 60},
    ErrorCode.EXEC_SELECTOR_NOT_FOUND: {"max_retries": 2, "regenerate_selector": True},
    ErrorCode.EXEC_BROWSER_TIMEOUT:    {"max_retries": 1, "increase_timeout": True},
    ErrorCode.EXEC_SHELL_TIMEOUT:      {"max_retries": 0},  # 超时直接触发HITL
}

async def execute_with_retry(sub_task: SubTask, tool: BaseTool) -> ToolResult:
    last_error = None
    for attempt in range(3):
        try:
            return await tool.execute(sub_task.params)
        except AgentError as e:
            last_error = e
            strategy   = RETRY_STRATEGY.get(e.code, {})
            if not e.retryable or attempt >= strategy.get("max_retries", 0):
                raise
            if strategy.get("fallback_model"):
                sub_task.model_override = get_fallback_model(sub_task.model)
            if wait := strategy.get("wait_seconds", 0):
                await asyncio.sleep(wait)
    raise last_error
```

**前端错误展示映射（`desktop-ui/src/utils/errorMessages.ts`）：**

```typescript
const ERROR_MESSAGES: Record<number, { title: string; action: string }> = {
  1002: { title: "AI输出格式异常",     action: "正在重试..." },
  1004: { title: "AI响应超时",         action: "正在切换备用模型..." },
  1006: { title: "所有模型均不可用",   action: "请检查API Key是否有效" },
  2002: { title: "页面元素定位失败",   action: "AI正在重新分析页面..." },
  2004: { title: "文件不存在",         action: "请确认路径是否正确" },
  2008: { title: "命令被安全拦截",     action: "该操作不被允许执行" },
  3001: { title: "路径访问被拒绝",     action: "仅允许访问指定目录" },
  3003: { title: "支付操作需要确认",   action: "请在手机端确认后继续" },
  4001: { title: "等待超时",           action: "用户未响应，该步骤已跳过" },
  4002: { title: "用户拒绝执行",       action: "该子任务已取消" },
  5001: { title: "连接断开",           action: "正在尝试重新连接..." },
  9000: { title: "未知错误",           action: "请查看日志获取详情" },
};

export function getErrorMessage(code: number) {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES[9000];
}
```

---

## 十七、服务器开发指南

### 17.1 本地开发环境搭建

```bash
# 1. 克隆项目，进入服务器目录
cd furtheraether/server

# 2. 创建虚拟环境
python -m venv .venv && source .venv/bin/activate

# 3. 安装依赖
pip install fastapi uvicorn[standard] asyncpg sqlalchemy[asyncio] \
            alembic redis[asyncio] python-jose[cryptography] \
            passlib[bcrypt] httpx pydantic-settings loguru \
            --break-system-packages

# 4. 启动本地依赖（PostgreSQL + Redis）
docker compose -f docker-compose.dev.yml up -d
# docker-compose.dev.yml 见 17.2

# 5. 初始化数据库
alembic upgrade head

# 6. 启动开发服务器
uvicorn main:app --reload --port 8000
# Swagger UI: http://localhost:8000/docs
```

---

### 17.2 本地开发用 Docker Compose

**文件**：`server/docker-compose.dev.yml`

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: furtheraether
      POSTGRES_USER: fa
      POSTGRES_PASSWORD: fa_dev_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --save 60 1

volumes:
  postgres_data:
```

**.env.dev（本地开发用）：**

```bash
# 数据库
DATABASE_URL=postgresql+asyncpg://fa:fa_dev_password@localhost:5432/furtheraether
REDIS_URL=redis://localhost:6379/0

# JWT（开发环境随便填，生产必须用随机强密钥）
JWT_SECRET=dev_secret_change_in_production
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=120
REFRESH_TOKEN_EXPIRE_DAYS=30

# 上游模型 API Key（仅服务器持有）
DEEPSEEK_API_KEY=
QWEN_API_KEY=
MOONSHOT_API_KEY=
ZHIPUAI_API_KEY=

# 套餐月度 Token 上限
LUNA_TOKEN_LIMIT=5000000
SOL_TOKEN_LIMIT=30000000
ORION_TOKEN_LIMIT=200000000

# 服务器自身
APP_HOST=0.0.0.0
APP_PORT=8000
DEBUG=true
```

---

### 17.3 项目入口与路由注册

**文件**：`server/main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from db.database import init_db
from routers import auth, inference, quota, ws_agent, ws_bot
import loguru

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    loguru.logger.info("FurtherAether server started")
    yield
    loguru.logger.info("Server shutting down")

app = FastAPI(
    title="FurtherAether API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",        # 开发环境开启，生产关闭
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://furtheraether.com", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# HTTP 路由
app.include_router(auth.router,      prefix="/auth",      tags=["认证"])
app.include_router(inference.router, prefix="/v1",        tags=["推理代理"])
app.include_router(quota.router,     prefix="/quota",     tags=["用量"])

# WebSocket 路由
app.include_router(ws_agent.router,  prefix="/ws/agent",  tags=["Agent连接"])
app.include_router(ws_bot.router,    prefix="/ws/bot",    tags=["Bot连接"])

@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
```

---

### 17.4 数据库连接与 ORM

**文件**：`server/db/database.py`

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    echo=settings.DEBUG,
)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
```

**文件**：`server/db/models.py`

```python
from sqlalchemy import Column, String, BigInteger, Integer, Float, DateTime, Text, Boolean
from sqlalchemy.sql import func
from db.database import Base

class User(Base):
    __tablename__ = "users"
    id            = Column(String, primary_key=True)
    email         = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    plan          = Column(String, default="sol")           # luna | sol | orion
    is_active     = Column(Boolean, default=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    last_login_at = Column(DateTime(timezone=True))

class QuotaUsage(Base):
    __tablename__ = "quota_usage"
    id            = Column(Integer, primary_key=True, autoincrement=True)
    user_id       = Column(String, index=True)
    year_month    = Column(String)                          # '2026-03'
    input_tokens  = Column(BigInteger, default=0)
    output_tokens = Column(BigInteger, default=0)
    updated_at    = Column(DateTime(timezone=True), onupdate=func.now())
    __table_args__ = ({"schema": None},)

class TokenBlacklist(Base):
    __tablename__ = "token_blacklist"
    token_hash = Column(String, primary_key=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
```

---

### 17.5 JWT 认证工具

**文件**：`server/utils/auth.py`

```python
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(user_id: str, plan: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": user_id, "plan": plan, "type": "access", "exp": expire},
        settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM
    )

def create_refresh_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": user_id, "type": "refresh", "exp": expire},
        settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM
    )

async def verify_jwt(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET,
                             algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token type")
        return payload
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token invalid or expired")
```

---

### 17.6 上游模型代理路由

**文件**：`server/upstream/router.py`

```python
import httpx
from config import settings

# 上游模型 API 配置（用户不可见）
UPSTREAM_CONFIG = {
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "api_key":  settings.DEEPSEEK_API_KEY,
    },
    "qwen": {
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "api_key":  settings.QWEN_API_KEY,
    },
    "moonshot": {
        "base_url": "https://api.moonshot.ai/v1",
        "api_key":  settings.MOONSHOT_API_KEY,
    },
    "zhipuai": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "api_key":  settings.ZHIPUAI_API_KEY,
    },
    "fa_private": {
        # 隐私节点：同一台服务器的隔离推理服务，数据不落地
        "base_url": "http://localhost:11435/v1",
        "api_key":  "internal",
    },
}

# 套餐 → 可用模型白名单
PLAN_ALLOWLIST = {
    "luna": {"deepseek-chat", "qwen3.5-plus", "qwen3.5-flash", "qwen3-max"},
    "sol":  {"deepseek-chat", "deepseek-reasoner", "qwen3.5-plus", "qwen3.5-flash", "qwen3-max"},
    "orion": {"deepseek-chat", "deepseek-reasoner", "qwen3.5-plus", "qwen3.5-flash",
             "qwen3-max", "kimi-k2.5", "glm-5", "glm-5-turbo"},
}

def plan_allows(plan: str, model: str) -> bool:
    return model in PLAN_ALLOWLIST.get(plan, set())

async def route_to_upstream(provider: str, model: str, payload: dict) -> dict:
    cfg = UPSTREAM_CONFIG.get(provider)
    if not cfg:
        raise ValueError(f"Unknown provider: {provider}")

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{cfg['base_url']}/chat/completions",
            headers={"Authorization": f"Bearer {cfg['api_key']}",
                     "Content-Type": "application/json"},
            json={"model": model, **payload},
        )
        resp.raise_for_status()
        return resp.json()
```

---

### 17.7 WebSocket：Agent 长连接

本地 Agent 启动后与服务器建立 WebSocket 长连接，服务器通过这条连接下发任务、接收执行结果和日志。

**文件**：`server/routers/ws_agent.py`

```python
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from utils.auth import verify_jwt_ws
from typing import dict

router = APIRouter()

# user_id -> WebSocket（每个用户只允许一个 Agent 连接）
agent_connections: dict[str, WebSocket] = {}

@router.websocket("/connect")
async def agent_connect(ws: WebSocket, token: str = Query(...)):
    user = await verify_jwt_ws(token)
    await ws.accept()
    agent_connections[user["sub"]] = ws

    try:
        while True:
            msg = await ws.receive_json()
            await handle_agent_message(user["sub"], msg)
    except WebSocketDisconnect:
        agent_connections.pop(user["sub"], None)

async def push_to_agent(user_id: str, message: dict):
    """服务器向本地 Agent 下发任务或指令"""
    ws = agent_connections.get(user_id)
    if not ws:
        raise RuntimeError(f"Agent not connected for user {user_id}")
    await ws.send_json(message)

async def handle_agent_message(user_id: str, msg: dict):
    """处理 Agent 上报的消息（任务状态、日志、HITL请求）"""
    msg_type = msg.get("type")
    if msg_type == "task_status_update":
        await broadcast_to_clients(user_id, msg)
    elif msg_type == "task_log":
        await broadcast_to_clients(user_id, msg)
    elif msg_type == "hitl_request":
        await broadcast_to_clients(user_id, msg)   # 推给手机 App 和 Bot

async def broadcast_to_clients(user_id: str, message: dict):
    """将 Agent 上报的消息同步推给该用户的手机 App 和 Bot"""
    from routers.ws_bot import push_to_bot
    from routers.ws_mobile import push_to_mobile
    await push_to_bot(user_id, message)
    await push_to_mobile(user_id, message)
```

---

### 17.8 数据库迁移（Alembic）

```bash
# 初始化 Alembic（首次）
alembic init alembic

# alembic/env.py 中配置：
# from db.database import Base
# target_metadata = Base.metadata

# 生成迁移文件
alembic revision --autogenerate -m "init tables"

# 应用迁移
alembic upgrade head

# 回滚一步
alembic downgrade -1

# 查看当前版本
alembic current
```

**迁移文件示例（`alembic/versions/001_init.py`）：**

```python
def upgrade():
    op.create_table("users",
        sa.Column("id",            sa.String(), primary_key=True),
        sa.Column("email",         sa.String(), unique=True, nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("plan",          sa.String(), server_default="sol"),
        sa.Column("is_active",     sa.Boolean(), server_default="true"),
        sa.Column("created_at",    sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

def downgrade():
    op.drop_table("users")
```

---

### 17.9 生产部署

**目录结构：**

```
server/
├── Dockerfile
├── docker-compose.prod.yml
├── nginx/
│   └── furtheraether.conf
└── deploy.sh
```

**`server/Dockerfile`：**

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

**`server/docker-compose.prod.yml`：**

```yaml
version: "3.9"

services:
  api:
    build: .
    restart: always
    env_file: .env.prod
    ports:
      - "127.0.0.1:8000:8000"   # 只暴露给 Nginx，不对外
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    restart: always
    env_file: .env.prod
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/furtheraether.conf:/etc/nginx/conf.d/default.conf
      - /etc/letsencrypt:/etc/letsencrypt:ro   # Certbot 证书

volumes:
  postgres_data:
```

**`server/nginx/furtheraether.conf`：**

```nginx
server {
    listen 80;
    server_name api.furtheraether.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.furtheraether.com;

    ssl_certificate     /etc/letsencrypt/live/api.furtheraether.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.furtheraether.com/privkey.pem;

    # WebSocket 支持
    location /ws/ {
        proxy_pass          http://127.0.0.1:8000;
        proxy_http_version  1.1;
        proxy_set_header    Upgrade $http_upgrade;
        proxy_set_header    Connection "upgrade";
        proxy_read_timeout  3600s;   # WebSocket 长连接，超时设长
    }

    # HTTP API
    location / {
        proxy_pass          http://127.0.0.1:8000;
        proxy_set_header    Host $host;
        proxy_set_header    X-Real-IP $remote_addr;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto $scheme;
    }
}
```

**`server/deploy.sh`（一键部署脚本）：**

```bash
#!/bin/bash
set -e

echo "=== FurtherAether Server Deploy ==="

# 1. 拉取最新代码
git pull origin main

# 2. 重新构建并启动
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d

# 3. 运行数据库迁移
docker compose -f docker-compose.prod.yml exec api alembic upgrade head

# 4. 健康检查
sleep 3
curl -sf https://api.furtheraether.com/health && echo "Deploy OK" || echo "Deploy FAILED"
```

**首次部署流程：**

```bash
# 服务器要求：2核4G起步，国内备案服务器（阿里云/腾讯云），Ubuntu 22.04

# 1. 安装 Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER

# 2. 申请 SSL 证书（Let's Encrypt 免费）
apt install certbot
certbot certonly --standalone -d api.furtheraether.com

# 3. 上传代码、配置 .env.prod
scp -r server/ user@your-server:/app/furtheraether/

# 4. 首次启动
cd /app/furtheraether/server
cp .env.prod.example .env.prod   # 填入所有 API Key 和密钥
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec api alembic upgrade head

# 5. 设置证书自动续期
echo "0 0 1 * * certbot renew --quiet && docker compose -f /app/furtheraether/server/docker-compose.prod.yml restart nginx" | crontab -
```

---

### 17.10 用量限流（Redis）

**文件**：`server/utils/quota.py`

```python
import redis.asyncio as aioredis
from datetime import datetime
from config import settings

redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

PLAN_LIMITS = {
    "luna": settings.LUNA_TOKEN_LIMIT,
    "sol":  settings.SOL_TOKEN_LIMIT,
    "orion": settings.ORION_TOKEN_LIMIT,
}

async def check_and_increment(user_id: str, plan: str, tokens_used: int) -> bool:
    """
    检查用量是否超限，并原子地累加本次消耗。
    返回 True 表示允许，False 表示超限。
    """
    year_month = datetime.utcnow().strftime("%Y-%m")
    key = f"quota:{user_id}:{year_month}"
    limit = PLAN_LIMITS.get(plan, 0)

    async with redis_client.pipeline() as pipe:
        await pipe.incrby(key, tokens_used)
        await pipe.expire(key, 60 * 60 * 24 * 35)   # 35天后自动过期
        results = await pipe.execute()

    current_usage = results[0]
    return current_usage <= limit

async def get_usage(user_id: str) -> dict:
    year_month = datetime.utcnow().strftime("%Y-%m")
    key = f"quota:{user_id}:{year_month}"
    used = int(await redis_client.get(key) or 0)
    return {"year_month": year_month, "used_tokens": used}
```

---

## 十八、定价、套餐与计费体系

### 18.1 套餐结构

三档套餐 × 三种周期，共9个SKU，另有对应的扩展包。

**套餐对照表（价格待测试后填写）：**

| 套餐 | 模型档次 | 每周 | 每月 | 每年 | Token月限额 |
|------|----------|------|------|------|------------|
| 🌙 **Luna** | 轻量 | ¥[TBD] | ¥[TBD] | ¥[TBD] | [TBD] tokens |
| ☀️ **Sol** | 均衡 | ¥[TBD] | ¥[TBD] | ¥[TBD] | [TBD] tokens |
| 💫 **Orion** | 旗舰 | ¥[TBD] | ¥[TBD] | ¥[TBD] | [TBD] tokens |

> 每年套餐建议设置为月付 × 10（相当于打83折，送2个月）。

**扩展包（固定额度包，可叠加购买）：**

| 扩展包 | 适用套餐 | 额外Token | 价格 | 有效期 |
|--------|----------|-----------|------|--------|
| Luna 扩展包 | Luna | +[TBD] tokens | ¥[TBD] | 当前计费周期内 |
| Sol 扩展包 | Sol | +[TBD] tokens | ¥[TBD] | 当前计费周期内 |
| Orion 扩展包 | Orion | +[TBD] tokens | ¥[TBD] | 当前计费周期内 |

> 扩展包与套餐绑定，Luna 套餐只能买 Luna 扩展包。扩展包不跨周期结转，到期清零。

---

### 18.2 计费周期规则

```python
# server/utils/billing.py

from enum import Enum
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

class BillingCycle(str, Enum):
    WEEKLY  = "weekly"
    MONTHLY = "monthly"
    YEARLY  = "yearly"

def get_cycle_dates(cycle: BillingCycle, from_date: datetime) -> tuple[datetime, datetime]:
    """返回 (开始时间, 结束时间)"""
    if cycle == BillingCycle.WEEKLY:
        return from_date, from_date + timedelta(weeks=1)
    elif cycle == BillingCycle.MONTHLY:
        return from_date, from_date + relativedelta(months=1)
    elif cycle == BillingCycle.YEARLY:
        return from_date, from_date + relativedelta(years=1)

def get_quota_key(user_id: str, cycle: BillingCycle, from_date: datetime) -> str:
    """Redis key，按周期区分"""
    if cycle == BillingCycle.WEEKLY:
        period = from_date.strftime("%Y-W%W")    # e.g. 2026-W12
    elif cycle == BillingCycle.MONTHLY:
        period = from_date.strftime("%Y-%m")     # e.g. 2026-03
    elif cycle == BillingCycle.YEARLY:
        period = from_date.strftime("%Y")        # e.g. 2026
    return f"quota:{user_id}:{period}"
```

---

### 18.3 数据库 Schema 补充（计费相关）

```sql
-- 订阅表
CREATE TABLE subscriptions (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT NOT NULL REFERENCES users(id),
    plan            TEXT NOT NULL,              -- luna | sol | orion
    cycle           TEXT NOT NULL,              -- weekly | monthly | yearly
    status          TEXT NOT NULL DEFAULT 'active',  -- active | cancelled | expired
    base_token_limit BIGINT NOT NULL,           -- 套餐基础限额
    addon_tokens    BIGINT DEFAULT 0,           -- 已购扩展包累计额度
    current_period_start TIMESTAMP NOT NULL,
    current_period_end   TIMESTAMP NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW(),
    cancelled_at    TIMESTAMP
);

-- 扩展包购买记录
CREATE TABLE addon_purchases (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT NOT NULL REFERENCES users(id),
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
    plan            TEXT NOT NULL,              -- 必须与订阅套餐一致
    tokens_added    BIGINT NOT NULL,
    price_cny       NUMERIC(10,2) NOT NULL,
    purchased_at    TIMESTAMP DEFAULT NOW(),
    expires_at      TIMESTAMP NOT NULL          -- 与当前计费周期结束时间一致
);

-- 账单记录
CREATE TABLE invoices (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT NOT NULL REFERENCES users(id),
    subscription_id TEXT REFERENCES subscriptions(id),
    type            TEXT NOT NULL,              -- subscription | addon
    plan            TEXT NOT NULL,
    cycle           TEXT,
    amount_cny      NUMERIC(10,2) NOT NULL,
    status          TEXT DEFAULT 'paid',        -- paid | refunded
    payment_method  TEXT,                       -- alipay | wechat
    paid_at         TIMESTAMP DEFAULT NOW(),
    period_start    TIMESTAMP,
    period_end      TIMESTAMP
);
```

---

### 18.4 用量检查逻辑（含扩展包）

```python
# server/utils/quota.py（更新版，支持扩展包）

async def get_effective_limit(user_id: str) -> int:
    """获取当前周期有效限额 = 套餐基础限额 + 未过期扩展包额度"""
    sub = await get_active_subscription(user_id)
    if not sub:
        return 0
    addon = await get_active_addon_tokens(user_id, sub.id)
    return sub.base_token_limit + addon

async def check_and_increment(user_id: str, tokens_used: int) -> tuple[bool, int, int]:
    """
    返回 (是否允许, 当前用量, 有效限额)
    原子操作：先检查再累加
    """
    limit   = await get_effective_limit(user_id)
    sub     = await get_active_subscription(user_id)
    key     = get_quota_key(user_id, sub.cycle, sub.current_period_start)
    ttl     = int((sub.current_period_end - datetime.utcnow()).total_seconds())

    async with redis_client.pipeline() as pipe:
        current = int(await redis_client.get(key) or 0)
        if current + tokens_used > limit:
            return False, current, limit   # 超限，不累加

        await pipe.incrby(key, tokens_used)
        await pipe.expire(key, max(ttl, 1))
        await pipe.execute()

    return True, current + tokens_used, limit
```

---

### 18.5 platform.furtheraether.com 页面范围

用户管理中心，独立于主 App，浏览器访问。

| 页面 | 路径 | 功能 |
|------|------|------|
| 用量仪表盘 | `/dashboard` | 本周期 token 用量进度条、模型使用分布、任务数统计 |
| 套餐管理 | `/billing` | 当前套餐、到期时间、升级/降级、取消订阅 |
| 购买扩展包 | `/billing/addon` | 选择扩展包规格，微信/支付宝付款 |
| 账单历史 | `/billing/invoices` | 所有订阅和扩展包的付款记录，可下载 PDF |
| 账号设置 | `/account` | 修改密码、绑定手机号 |

**API 接口（`server/routers/platform.py`）：**

```python
# GET /platform/dashboard
# 返回当前用户本周期用量数据
{
  "plan": "sol",
  "cycle": "monthly",
  "period_start": "2026-03-01",
  "period_end":   "2026-04-01",
  "base_limit":   30000000,
  "addon_tokens": 5000000,
  "effective_limit": 35000000,
  "used_tokens":  8234567,
  "usage_pct":    23.5,
  "tasks_completed": 142,
  "top_models": [
    {"model": "deepseek-chat", "tokens": 5000000},
    {"model": "qwen3.5-plus",  "tokens": 3234567}
  ]
}

# GET /platform/billing
# 返回订阅详情

# POST /platform/billing/addon
# 购买扩展包
{
  "plan": "sol",          # 必须与当前套餐一致
  "quantity": 1           # 可购买多个叠加
}
# 返回支付宝/微信支付二维码 URL

# GET /platform/billing/invoices
# 返回账单列表（分页）
```

---

### 18.6 打包发布（Python 随安装包一起发布）

用户下载安装包后开箱即用，无需手动安装 Python 或任何依赖。

**Windows（`.exe` 安装包）：**

```bash
# 使用 PyInstaller 将 Python Agent 打包成单文件可执行
pip install pyinstaller

pyinstaller agent-core/main.py \
  --onefile \
  --name furtheraether-agent \
  --add-data "agent-core/prompts:prompts" \
  --hidden-import playwright \
  --collect-all sqlmodel

# Tauri 在 build 时将 furtheraether-agent.exe 作为 sidecar 一起打包
# tauri.conf.json:
{
  "bundle": {
    "externalBin": ["../agent-core/dist/furtheraether-agent"],
    "resources": ["../agent-core/dist/furtheraether-agent.exe"]
  }
}
```

**macOS（`.dmg`）：**

```bash
# 同上，PyInstaller 生成 macOS 可执行文件
pyinstaller agent-core/main.py \
  --onefile \
  --name furtheraether-agent \
  --target-arch universal2   # 同时支持 Intel 和 Apple Silicon

# Tauri 打包成 .dmg，包含 Agent 可执行文件
npm run tauri build -- --target universal-apple-darwin
```

**Tauri 启动 Python Agent（`src-tauri/src/main.rs`）：**

```rust
use tauri::Manager;
use std::process::Command;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // 随 Tauri 一起启动 Python Agent 进程
            let agent_path = app.path_resolver()
                .resolve_resource("furtheraether-agent")
                .expect("Agent binary not found");

            std::thread::spawn(move || {
                Command::new(agent_path)
                    .spawn()
                    .expect("Failed to start agent");
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Error running FurtherAether");
}
```

---

## 十八、定价与计费体系

### 18.1 产品矩阵

FurtherAether 提供三个套餐档次 × 三种计费周期，共9个SKU，外加对应的扩展包。
限额数字待内测后根据实际用量填入，以下用占位符 `[TBD]` 标注。

**完整产品矩阵（含免费档）：**

| | 🆓 Free | 🌙 Luna | ☀️ Sol | 🔭 Orion |
|---|--------|--------|--------|--------|
| **价格** | 免费 | ¥15/月 | ¥45/月 | ¥128/月 |
| **按周** | — | ¥5/周 | ¥15/周 | ¥45/周 |
| **按年** | — | ¥99/年 | ¥299/年 | ¥899/年 |
| **每日任务次数** | 3次（自选Luna或Sol） | 不限 | 不限 | 不限 |
| **月Token限额** | 每日重置（约240K/月） | 3M | 10M | 15M |
| **可用模型** | Luna或Sol档（用户自选） | Luna档模型 | Sol档模型 | 全部含Kimi/GLM |
| **HITL优先级** | 标准 | 标准 | 优先 | 即时 |

> **免费档说明**：每天3次任务，用户可自选 Luna 或 Sol 档质量，每日 00:00 重置，无需绑卡。用户可以在设置里随时切换，选 Sol 体验更强但同样只有3次。
>
> **定价原则**：按年付相当于月付 × 10（两个月免费），按周付相当于月付 × 0.4，鼓励长期订阅。

---

### 18.2 扩展包（Add-on）

每个套餐都可以购买对应的扩展包，一次性买断额度，当期用完为止，不滚入下一期。

| 扩展包 | 适用套餐 | 额外Token | 价格 | 折算成本 |
|--------|----------|-----------|------|---------|
| Luna I | Luna | +1M tokens | ¥4 | ≈240次任务 |
| Luna II | Luna | +3M tokens | ¥10 | ≈720次任务 |
| Sol I | Sol | +3M tokens | ¥8 | ≈120次任务 |
| Sol II | Sol | +10M tokens | ¥22 | ≈400次任务 |
| Orion I | Orion | +5M tokens | ¥30 | ≈55次任务 |
| Orion II | Orion | +15M tokens | ¥80 | ≈165次任务 |

> 扩展包不可跨档次使用，Sol用户买的扩展包不能用于Orion模型消耗。

---

### 18.3 计费周期与限额重置逻辑

```
按周订阅：每周一 00:00 重置，未用完的额度不累计
按月订阅：每月1日 00:00 重置
按年订阅：每年订阅日 00:00 重置

扩展包：购买后立即生效，到期（周/月/年结束）清零，不滚入下一期
```

**用量优先级（消耗顺序）：**

```
基础套餐额度先用 → 扩展包额度后用
原因：套餐额度有时效性，扩展包同样有时效性，优先消耗快过期的
```

---

### 18.4 服务器侧计费实现

**文件**：`server/utils/billing.py`

```python
from datetime import datetime, timezone
from enum import Enum

class BillingCycle(str, Enum):
    WEEKLY  = "weekly"
    MONTHLY = "monthly"
    YEARLY  = "yearly"

class Plan(str, Enum):
    LUNA = "luna"
    SOL  = "sol"
    NOVA = "orion"

TOKEN_LIMITS = {
    # Free：每日任务次数上限（约8K tokens/次）
    ("free",  "daily"):   24_000,      # 3次任务 × 8K ≈ 24K tokens/天

    # Luna
    ("luna",  "weekly"):  750_000,     # 3M / 4周
    ("luna",  "monthly"): 3_000_000,
    ("luna",  "yearly"):  36_000_000,

    # Sol
    ("sol",   "weekly"):  2_500_000,   # 10M / 4周
    ("sol",   "monthly"): 10_000_000,
    ("sol",   "yearly"):  120_000_000,

    # Orion
    ("orion",  "weekly"):  3_750_000,   # 15M / 4周
    ("orion",  "monthly"): 15_000_000,
    ("orion",  "yearly"):  180_000_000,
}

ADDON_TOKENS = {
    "luna_i": 1_000_000,
    "luna_ii": 3_000_000,
    "sol_i":  3_000_000,
    "sol_ii":  10_000_000,
    "orion_i": 5_000_000,
    "orion_ii": 15_000_000,
}

# Free 档每日任务计数（Redis，按自然日重置）
FREE_DAILY_TASK_LIMIT = 3
FREE_TASK_MODEL_OPTIONS = ["luna", "sol"]   # Free 档用户可自选

def get_period_key(cycle: str) -> str:
    """根据计费周期生成当前期次的Key，用于Redis存储"""
    now = datetime.now(timezone.utc)
    if cycle == "weekly":
        # ISO week: 2026-W12
        return now.strftime("%Y-W%W")
    elif cycle == "monthly":
        return now.strftime("%Y-%m")
    elif cycle == "yearly":
        return now.strftime("%Y")
    return now.strftime("%Y-%m")
```

**Redis Key 设计：**

```
quota:base:{user_id}:{period_key}     # 基础套餐用量
quota:addon:{user_id}:{addon_id}      # 扩展包剩余量（购买时写入，递减）
```

**用量检查与扣减（`server/utils/quota.py` 补充）：**

```python
async def consume_tokens(user_id: str, plan: str, cycle: str, tokens: int) -> dict:
    """
    按优先级消耗Token：基础套餐先扣，超出后扣扩展包。
    返回：{"allowed": True/False, "source": "base"|"addon"|"exceeded"}
    """
    period_key = get_period_key(cycle)
    base_limit  = TOKEN_LIMITS.get((plan, cycle), 0)
    base_key    = f"quota:base:{user_id}:{period_key}"
    addon_key   = f"quota:addon:{user_id}:{plan}"   # 扩展包按plan聚合

    # 当前基础用量
    base_used = int(await redis_client.get(base_key) or 0)

    if base_used + tokens <= base_limit:
        # 基础额度够用，直接扣
        await redis_client.incrby(base_key, tokens)
        return {"allowed": True, "source": "base"}

    # 基础额度不够，尝试扣扩展包
    addon_remaining = int(await redis_client.get(addon_key) or 0)
    overflow = (base_used + tokens) - base_limit   # 超出基础额度的部分

    if addon_remaining >= overflow:
        await redis_client.set(base_key, base_limit)       # 基础额度打满
        await redis_client.decrby(addon_key, overflow)     # 扩展包扣超出部分
        return {"allowed": True, "source": "addon"}

    return {"allowed": False, "source": "exceeded"}
```

---

### 18.5 platform.furtheraether.com

用户账号管理、用量查看、套餐购买、扩展包购买，全部在 `platform.furtheraether.com` 完成，与 API 服务器（`api.furtheraether.com`）分离部署。

**平台功能页面：**

| 页面 | 路径 | 核心内容 |
|------|------|----------|
| 概览 | `/dashboard` | 本期用量进度条、套餐到期时间、快捷入口 |
| 用量详情 | `/usage` | 按天/周/月的Token消耗折线图、各模型分布 |
| 套餐管理 | `/subscription` | 当前套餐、升降档、切换计费周期、取消订阅 |
| 扩展包 | `/addons` | 购买扩展包、查看剩余额度 |
| 账单记录 | `/billing` | 历史订单、发票申请 |
| 下载 | `/download` | 下载本地 Agent 安装包（Windows/macOS） |
| 设置 | `/settings` | 改密码、邮箱、删除账户 |

**平台技术栈：**

| 层 | 选型 |
|----|------|
| 框架 | Next.js 14（App Router） |
| UI | Tailwind CSS + shadcn/ui |
| 图表 | Recharts |
| 支付 | 微信支付 + 支付宝（服务端回调） |
| 部署 | Vercel 或同一台服务器的独立 Docker 容器 |

---

### 18.6 支付接入（国内）

支持微信支付和支付宝，两者均需要企业营业执照，个人开发阶段可先用**收款码**过渡，正式上线前完成接入。

**内测阶段：个人收款码**

内测期间不接入正式支付 API，用户付款通过个人微信/支付宝收款码完成，管理员手动激活套餐。支付页面托管在 `pay.furtheraether.com`，展示收款码和付款说明，用户付款后填写订单号，管理员用 `fa-admin` 确认后激活。

```
pay.furtheraether.com
├── 展示套餐价格和收款码（微信/支付宝）
├── 用户填写：付款金额、付款时间、备注（用户ID）
└── 提交后发邮件通知管理员 → fa-admin users set-plan <id> sol
```

正式上线后替换为标准支付 API（微信支付 v3 / 支付宝），域名和流程保持不变，用户无感知切换。

**正式支付接入（备用，待营业执照办理后启用）：**

**微信支付（JSAPI / Native）：**

```python
# server/routers/payment.py

import httpx, hashlib, random, string, time

async def create_wechat_order(user_id: str, plan: str, cycle: str, amount_fen: int) -> dict:
    """
    amount_fen: 金额，单位分（¥10.00 = 1000）
    返回：{code_url: "weixin://..."} 用于生成支付二维码
    """
    nonce_str = ''.join(random.choices(string.ascii_letters + string.digits, k=32))
    params = {
        "appid":            WECHAT_APP_ID,
        "mchid":            WECHAT_MCH_ID,
        "description":      f"FurtherAether {plan.upper()} {cycle}",
        "out_trade_no":     f"FA{user_id[:8]}{int(time.time())}",
        "notify_url":       "https://api.furtheraether.com/payment/wechat/notify",
        "amount":           {"total": amount_fen, "currency": "CNY"},
    }
    # 调用微信支付 v3 API，签名略（使用官方 SDK）
    ...

async def wechat_notify(request):
    """微信支付回调，验签后激活套餐"""
    # 1. 验证签名
    # 2. 解密通知内容
    # 3. 根据 out_trade_no 找到订单，激活对应套餐
    # 4. 返回 {"code": "SUCCESS"}
    ...
```

**支付状态流转：**

```
用户选择套餐 → 创建订单（pending）
    │
    ▼
生成支付二维码 / 跳转支付宝页面
    │
    ▼
用户完成支付 → 微信/支付宝回调服务器
    │
    ▼
验签成功 → 订单状态改为 paid → 激活套餐/扩展包 → 通知用户
```

**数据库补充（订单表）：**

```sql
CREATE TABLE orders (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        TEXT REFERENCES users(id),
    plan           TEXT NOT NULL,              -- luna | sol | orion
    cycle          TEXT,                       -- weekly | monthly | yearly | addon
    addon_type     TEXT,                       -- luna_i | sol_ii | ... (仅addon时填)
    amount_fen     INTEGER NOT NULL,           -- 单位：分
    status         TEXT DEFAULT 'pending',     -- pending | paid | refunded | failed
    payment_method TEXT,                       -- wechat | alipay
    trade_no       TEXT UNIQUE,                -- 第三方支付流水号
    paid_at        TIMESTAMP,
    created_at     TIMESTAMP DEFAULT NOW(),
    expires_at     TIMESTAMP NOT NULL          -- 套餐到期时间
);
```

---


## 十九、打包与发布

### 19.1 整体打包架构

本地 Agent 由两部分组成：Tauri 桌面壳（Rust + WebView）和 Python agent-core 进程。打包时需要把两者合并成一个安装包，用户双击即可运行，无需预装任何环境。

```
安装包结构：
FurtherAether.exe / FurtherAether.dmg
├── Tauri 桌面壳（WebView UI）
├── agent-core/（PyInstaller 打包的独立可执行文件）
│   └── agent-core.exe / agent-core（含 Python 运行时）
└── playwright-browsers/（内置 Chromium，无需用户下载）
```

**Tauri 在启动时自动拉起 Python 进程：**

```rust
// src-tauri/src/main.rs

use std::process::{Command, Child};
use std::sync::Mutex;
use tauri::Manager;

static AGENT_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

fn start_agent_core(app: &tauri::AppHandle) -> std::io::Result<Child> {
    let agent_bin = app.path_resolver()
        .resolve_resource("agent-core/agent-core")
        .expect("agent-core binary not found");

    Command::new(agent_bin)
        .env("FA_API_BASE", "https://api.furtheraether.com")
        .env("FA_WS_BASE",  "wss://api.furtheraether.com/ws")
        .spawn()
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let child = start_agent_core(app.handle()).expect("Failed to start agent-core");
            *AGENT_PROCESS.lock().unwrap() = Some(child);
            Ok(())
        })
        .on_window_event(|event| {
            // 窗口关闭时同时杀掉 Python 进程
            if let tauri::WindowEvent::Destroyed = event.event() {
                if let Some(mut child) = AGENT_PROCESS.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

### 19.2 PyInstaller 打包 agent-core

```bash
# agent-core/build.sh

pip install pyinstaller --break-system-packages

pyinstaller \
  --onedir \                          # 输出为目录，比 --onefile 启动快
  --name agent-core \
  --add-data "prompts/:prompts/" \    # 把 prompts 目录一起打包
  --hidden-import sqlmodel \
  --hidden-import playwright \
  --hidden-import websockets \
  --collect-all playwright \
  main.py

# 打包后目录：dist/agent-core/
# 把整个 dist/agent-core/ 放到 Tauri 的 src-tauri/resources/ 下
cp -r dist/agent-core/ ../desktop-ui/src-tauri/resources/
```

**内置 Playwright Chromium（避免用户首次启动下载）：**

```bash
# 先在打包机器上下载 Chromium
playwright install chromium

# 找到 Chromium 缓存目录
# macOS: ~/Library/Caches/ms-playwright/
# Windows: %USERPROFILE%\AppData\Local\ms-playwright\

# PyInstaller spec 文件中手动指定路径
# agent-core/agent-core.spec:
a = Analysis(
    ['main.py'],
    datas=[
        ('~/.cache/ms-playwright/chromium-*', 'playwright/chromium'),
    ],
    ...
)
```

---

### 19.3 Tauri 资源配置

**`src-tauri/tauri.conf.json`：**

```json
{
  "bundle": {
    "resources": [
      "resources/agent-core/**"
    ],
    "externalBin": [
      "resources/agent-core/agent-core"
    ],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "windows": {
      "nsis": {
        "installMode": "perMachine",
        "languages": ["SimpChinese", "English"]
      }
    },
    "macOS": {
      "signingIdentity": "Developer ID Application: FurtherAether Inc",
      "hardenedRuntime": true,
      "entitlements": "entitlements.plist"
    }
  }
}
```

---

### 19.4 CI/CD 自动构建（GitHub Actions）

**`.github/workflows/release.yml`：**

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: windows-latest
            target: x86_64-pc-windows-msvc
          - os: macos-latest
            target: x86_64-apple-darwin
          - os: macos-latest
            target: aarch64-apple-darwin   # Apple Silicon

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install agent-core deps
        run: |
          pip install pyinstaller playwright websockets sqlmodel httpx pydantic loguru
          playwright install chromium

      - name: Build agent-core with PyInstaller
        run: |
          cd agent-core
          pyinstaller agent-core.spec

      - name: Copy agent-core to Tauri resources
        run: cp -r agent-core/dist/agent-core desktop-ui/src-tauri/resources/

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN:          ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          APPLE_CERTIFICATE:     ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_ID:              ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD:        ${{ secrets.APPLE_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "FurtherAether ${{ github.ref_name }}"
          releaseBody: "See CHANGELOG.md for details."
          releaseDraft: true
          includeUpdaterJson: true   # 生成 latest.json 供自动更新用
```

---

### 19.5 macOS 签名与公证

macOS 从 Catalina 起未签名的 App 无法运行，必须完成签名 + 公证流程。

```bash
# 1. 需要：Apple Developer 账号（¥688/年）+ Developer ID 证书

# 2. 导出证书到 GitHub Secrets（base64编码）
base64 -i certificate.p12 | pbcopy   # 复制到 APPLE_CERTIFICATE secret

# 3. Tauri 打包时自动签名（已在 tauri.conf.json 中配置）

# 4. 公证（Notarization）- Tauri action 自动处理
# 需要 APPLE_ID + APPLE_PASSWORD（App专用密码，非登录密码）

# 5. 验证签名
spctl -a -vvv -t install FurtherAether.dmg
# 输出：accepted source=Notarized Developer ID
```

---

### 19.6 发布到 platform.furtheraether.com/download

```
platform.furtheraether.com/download
├── 自动检测用户操作系统，高亮推荐对应版本
├── Windows (x64)    → FurtherAether_1.0.0_x64-setup.exe
├── macOS (Intel)    → FurtherAether_1.0.0_x64.dmg
├── macOS (Apple Silicon) → FurtherAether_1.0.0_aarch64.dmg
└── 版本更新日志（来自 GitHub Release）
```

---

## 二十、断线重连与任务恢复

### 20.1 断线场景分类

| 场景 | 触发原因 | 影响 | 恢复策略 |
|------|----------|------|----------|
| Agent 短暂断线 | 网络抖动（<30s） | 任务继续在本地执行，日志暂缓推送 | 重连后补推缓存日志 |
| Agent 长时间断线 | 睡眠/网络故障（>30s） | 任务可能执行完毕但结果未上报 | 重连后上报本地任务状态 |
| 手机端断线 | App切后台/网络切换 | 错过 HITL 通知 | 重连后服务器重推待处理HITL |
| 服务器重启 | 部署更新 | 所有连接断开 | 客户端指数退避重连 |

---

### 20.2 Agent 端重连逻辑

**文件**：`agent-core/utils/ws_client.py`

```python
import asyncio
import websockets
import json
from loguru import logger
from config import FA_WS_BASE, FA_ACCESS_TOKEN

class FAWebSocketClient:
    def __init__(self):
        self.ws = None
        self.connected = False
        self._log_buffer: list[dict] = []      # 断线期间缓存的日志
        self._reconnect_delay = 1              # 初始重连延迟（秒）
        self._max_delay = 60                   # 最大重连延迟

    async def connect(self):
        """带指数退避的永久重连循环"""
        while True:
            try:
                uri = f"{FA_WS_BASE}/agent/connect?token={FA_ACCESS_TOKEN}"
                async with websockets.connect(uri, ping_interval=20, ping_timeout=10) as ws:
                    self.ws = ws
                    self.connected = True
                    self._reconnect_delay = 1      # 重连成功，重置延迟
                    logger.info("Connected to FurtherAether server")

                    await self._on_connected()
                    await self._listen(ws)

            except (websockets.ConnectionClosed, OSError) as e:
                self.connected = False
                self.ws = None
                logger.warning(f"Disconnected: {e}. Reconnecting in {self._reconnect_delay}s...")
                await asyncio.sleep(self._reconnect_delay)
                # 指数退避：1s → 2s → 4s → ... → 60s
                self._reconnect_delay = min(self._reconnect_delay * 2, self._max_delay)

    async def _on_connected(self):
        """重连后：上报本地任务状态 + 补推缓存日志"""
        # 1. 把本地 SQLite 里 running/hitl_wait 状态的任务上报给服务器
        pending_tasks = await get_unfinished_tasks()
        for task in pending_tasks:
            await self.send({
                "type": "task_state_sync",
                "task_id": task.id,
                "status": task.status,
                "updated_at": task.updated_at.isoformat(),
            })

        # 2. 补推断线期间缓存的日志
        for log_msg in self._log_buffer:
            await self.send(log_msg)
        self._log_buffer.clear()

    async def send(self, message: dict):
        """发送消息，断线时缓存"""
        if self.connected and self.ws:
            await self.ws.send(json.dumps(message))
        else:
            # 断线期间缓存，最多保留500条
            if len(self._log_buffer) < 500:
                self._log_buffer.append(message)

    async def _listen(self, ws):
        async for raw in ws:
            msg = json.loads(raw)
            await handle_server_message(msg)
```

---

### 20.3 服务器端：HITL 重推机制

用户手机 App 断线后重连，服务器把待处理的 HITL 请求重新推送一次。

**文件**：`server/routers/ws_mobile.py`（补充）

```python
async def on_mobile_connected(user_id: str):
    """手机端重连后，把所有 hitl_wait 状态的任务重新推送"""
    pending_hitl = await get_hitl_pending_tasks(user_id)   # 查 DB
    for task in pending_hitl:
        await push_to_mobile(user_id, {
            "type":    "hitl_request",
            "task_id": task.id,
            "payload": task.hitl_payload,       # 原始 HITL 请求内容
            "resent":  True,                    # 标记为重推，前端可显示"重新提醒"
        })
```

---

### 20.4 任务状态同步协议

重连后 Agent 和服务器可能对任务状态有分歧，用以下协议对齐：

```
Agent 上报：task_state_sync { task_id, status, updated_at }
    │
    ▼
服务器比较本地记录的 updated_at
    │
    ├─ Agent 更新 → 以 Agent 为准，更新 DB，广播给手机端
    └─ 服务器更新 → 以服务器为准，推给 Agent 最新状态
```

---

## 二十一、测试策略

### 21.1 测试分层

```
单元测试（Unit）
  └─ 每个模块独立测试，AI调用全部 Mock
  └─ 工具：pytest + pytest-asyncio

集成测试（Integration）
  └─ Agent → FA API → 真实模型（每日跑一次，消耗少量配额）
  └─ 工具：pytest + httpx

E2E测试（End-to-End）
  └─ 完整任务流：手机提交 → Agent执行 → 结果返回
  └─ 工具：playwright（控制测试用浏览器）
```

---

### 21.2 Mock AI 调用

所有单元测试中，AI 调用必须 Mock，不实际发请求。

**文件**：`agent-core/tests/conftest.py`

```python
import pytest
from unittest.mock import AsyncMock, patch

# 预设好的 AI 返回样本
MOCK_SUBTASKS = [
    {
        "description": "列出桌面截图文件",
        "tool": "file",
        "params": {"action": "list", "path": "~/Desktop", "filter": "*.png"},
        "confidence": 0.95,
        "risk_level": "low",
        "requires_human": False,
        "reason_if_uncertain": ""
    },
    {
        "description": "移动文件到Pictures",
        "tool": "file",
        "params": {"action": "move_batch", "path": "~/Desktop",
                   "destination": "~/Pictures", "filter": "*.png"},
        "confidence": 0.92,
        "risk_level": "low",
        "requires_human": False,
        "reason_if_uncertain": ""
    }
]

@pytest.fixture
def mock_ai_dispatcher():
    """Mock 掉所有 AI 调用，返回预设的子任务列表"""
    with patch("modules.ai_dispatcher.AIDispatcher.plan_task",
               new_callable=AsyncMock) as mock_plan:
        mock_plan.return_value = MOCK_SUBTASKS
        yield mock_plan

@pytest.fixture
def mock_fa_client():
    """Mock 掉 FA API 调用"""
    with patch("utils.fa_client.call_inference",
               new_callable=AsyncMock) as mock_call:
        mock_call.return_value = '["mock response"]'
        yield mock_call
```

---

### 21.3 核心单元测试

**文件**：`agent-core/tests/test_hitl.py`

```python
import pytest
from modules.hitl import HITLManager
from models.task import SubTask

@pytest.mark.asyncio
async def test_hitl_triggers_on_low_confidence():
    hitl = HITLManager()
    sub_task = SubTask(
        id="test-1", parent_task_id="p-1",
        description="点击支付按钮",
        tool="browser",
        params={},
        confidence=0.4,    # 低于阈值 0.75
        risk_level="high",
        requires_human=False
    )
    should_pause, reason = await hitl.should_trigger(sub_task)
    assert should_pause is True
    assert reason == "low_confidence"

@pytest.mark.asyncio
async def test_hitl_triggers_on_payment():
    hitl = HITLManager()
    sub_task = SubTask(
        id="test-2", parent_task_id="p-1",
        description="确认支付298元",
        tool="browser",
        params={},
        confidence=0.9,
        risk_level="high",
        requires_human=False
    )
    should_pause, reason = await hitl.should_trigger(sub_task)
    assert should_pause is True
    assert reason == "payment_action"

@pytest.mark.asyncio
async def test_hitl_not_triggered_on_safe_task():
    hitl = HITLManager()
    sub_task = SubTask(
        id="test-3", parent_task_id="p-1",
        description="列出下载文件夹中的PDF文件",
        tool="file",
        params={"action": "list", "path": "~/Downloads"},
        confidence=0.95,
        risk_level="low",
        requires_human=False
    )
    should_pause, reason = await hitl.should_trigger(sub_task)
    assert should_pause is False
```

**文件**：`agent-core/tests/test_security.py`

```python
from utils.security import validate_file_path, validate_shell_command

def test_allowed_path():
    assert validate_file_path("~/Desktop/test.txt") is True
    assert validate_file_path("~/Downloads/report.pdf") is True

def test_blocked_system_path():
    assert validate_file_path("/etc/passwd") is False
    assert validate_file_path("/System/Library") is False
    assert validate_file_path("C:\\Windows\\System32") is False

def test_safe_shell_command():
    ok, _ = validate_shell_command("find ~/Downloads -name '*.pdf' | wc -l")
    assert ok is True

def test_dangerous_shell_command():
    ok, reason = validate_shell_command("rm -rf ~/Documents")
    assert ok is False
    assert "rm -rf" in reason

def test_shell_format_blocked():
    ok, _ = validate_shell_command("format C:")
    assert ok is False
```

**文件**：`agent-core/tests/test_ai_dispatcher.py`

```python
import pytest
from modules.ai_dispatcher import AIDispatcher
from prompts.parser import parse_json_output

def test_parse_clean_json():
    raw = '[{"description": "test", "tool": "file", "confidence": 0.9}]'
    result = parse_json_output(raw)
    assert isinstance(result, list)
    assert result[0]["tool"] == "file"

def test_parse_json_with_markdown_wrapper():
    raw = '```json\n[{"description": "test", "tool": "file"}]\n```'
    result = parse_json_output(raw)
    assert isinstance(result, list)

def test_parse_json_with_preamble():
    raw = '以下是子任务列表：\n\n[{"description": "test", "tool": "shell"}]'
    result = parse_json_output(raw)
    assert isinstance(result, list)

def test_parse_invalid_json_raises():
    with pytest.raises(ValueError):
        parse_json_output("这不是JSON")
```

---

### 21.4 Prompt 回归测试

每次修改任何 prompt 后必须跑，确保 confidence 分布没有失真。

**文件**：`agent-core/tests/test_prompts.py`

```python
import pytest, json
from prompts.test_cases import PLANNER_CASES, SHELL_SAFETY_CASES

# 读取 test_cases.json
with open("prompts/test_cases.json") as f:
    TEST_CASES = json.load(f)

@pytest.mark.parametrize("case", TEST_CASES["planner_cases"])
@pytest.mark.asyncio
async def test_planner_confidence(case, mock_fa_client):
    """验证规划器对各类任务的 confidence 和 requires_human 判断是否合理"""
    from modules.ai_dispatcher import AIDispatcher
    dispatcher = AIDispatcher()
    sub_tasks = await dispatcher.plan_task_raw(case["input"])

    # 至少返回1个子任务
    assert len(sub_tasks) >= 1

    # 检查 confidence 范围
    if "expected_confidence_min" in case:
        assert any(st["confidence"] >= case["expected_confidence_min"] for st in sub_tasks)
    if "expected_confidence_max" in case:
        assert any(st["confidence"] <= case["expected_confidence_max"] for st in sub_tasks)

    # 检查高风险任务是否触发 requires_human
    if case.get("expected_requires_human"):
        assert any(st["requires_human"] for st in sub_tasks)

@pytest.mark.parametrize("case", TEST_CASES["shell_safety_cases"])
@pytest.mark.asyncio
async def test_shell_safety(case, mock_fa_client):
    from tools.shell_tool import ShellTool
    tool = ShellTool()
    result = await tool.generate_command(case["input"])
    assert result["safe"] == case["expected_safe"], \
        f"Shell safety check failed for: {case['input']}"
```

---

### 21.5 测试运行命令

```bash
# 安装测试依赖
pip install pytest pytest-asyncio pytest-cov --break-system-packages

# 运行全部单元测试（不调真实AI）
pytest agent-core/tests/ -v --cov=agent-core --cov-report=html

# 只跑安全相关测试
pytest agent-core/tests/test_security.py -v

# 只跑 prompt 回归测试
pytest agent-core/tests/test_prompts.py -v

# 服务器测试
pytest server/tests/ -v

# 查看覆盖率报告
open htmlcov/index.html
```

**`pytest.ini`：**

```ini
[pytest]
asyncio_mode = auto
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
```

---

## 二十二、FA 隐私节点

### 22.1 定义

FA 隐私节点是运行在 FurtherAether 服务器上的**隔离推理服务**。用户发起涉及敏感数据的任务时，请求路由到这里而非第三方模型 API，保证敏感内容不经过任何外部服务。

**隐私节点 vs 普通推理代理的区别：**

| | 普通推理（FA代理） | FA 隐私节点 |
|--|------------------|------------|
| 数据流向 | FA服务器 → DeepSeek/Qwen API | 只在 FA 服务器内部 |
| 使用的模型 | 第三方云端模型 | 服务器本地部署的开源模型 |
| 日志记录 | 记录请求元数据 | 不记录任何内容 |
| 适用场景 | 普通任务 | 含密码/身份证/财务数据的任务 |

---

### 22.2 部署方案（Ollama on Server）

隐私节点本质上是运行在服务器上的 Ollama 实例，与主服务隔离在独立 Docker 网络中，**不对外暴露端口**。

**`server/docker-compose.prod.yml` 补充：**

```yaml
services:
  # ... 原有服务 ...

  ollama-private:
    image: ollama/ollama:latest
    restart: always
    volumes:
      - ollama_data:/root/.ollama
    networks:
      - internal          # 只在内部网络，不对外暴露
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]   # 有GPU时自动启用，无GPU时删除这段

networks:
  internal:
    driver: bridge
    internal: true        # 该网络完全隔离，无法访问外网

volumes:
  ollama_data:
```

**首次拉取模型（在服务器上执行）：**

```bash
docker compose exec ollama-private ollama pull qwen3:14b
# 验证
docker compose exec ollama-private ollama list
```

---

### 22.3 隐私节点路由实现

**`server/upstream/router.py` 补充：**

```python
UPSTREAM_CONFIG = {
    # ... 原有配置 ...
    "fa_private": {
        # 仅内部网络可达，外部完全无法访问
        "base_url": "http://ollama-private:11434/v1",
        "api_key":  "ollama",   # Ollama 不需要真实 API Key
        "log_requests": False,  # 明确不记录请求内容
    },
}
```

**隐私请求处理（不记录日志）：**

```python
async def route_to_upstream(provider: str, model: str, payload: dict) -> dict:
    cfg = UPSTREAM_CONFIG[provider]
    is_private = provider == "fa_private"

    # 隐私节点：不记录请求内容，只记录元数据
    if not is_private:
        logger.info(f"Inference: provider={provider} model={model} "
                    f"tokens_est={estimate_tokens(payload)}")

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{cfg['base_url']}/chat/completions",
            headers={"Authorization": f"Bearer {cfg['api_key']}"},
            json={"model": model, **payload},
        )
        resp.raise_for_status()
        result = resp.json()

    if not is_private:
        await record_usage(...)   # 普通请求记录用量

    return result
```

---

### 22.4 Agent 侧敏感数据检测

Agent 在调用 AI 前自动检测任务内容是否含敏感数据，自动路由到隐私节点。

**文件**：`agent-core/utils/privacy.py`

```python
import re

# 敏感数据检测规则
SENSITIVE_PATTERNS = [
    (r"\d{15,18}",            "身份证号"),
    (r"\d{16,19}",            "银行卡号"),
    (r"password|密码|passwd", "密码关键词"),
    (r"\d{3}-\d{4}-\d{4}",   "手机号格式"),
    (r"[\w.]+@[\w.]+\.\w+",  "邮箱地址"),
]

def is_sensitive(text: str) -> tuple[bool, str]:
    """
    检查文本是否含敏感数据。
    返回：(是否敏感, 触发的规则描述)
    """
    for pattern, description in SENSITIVE_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return True, description
    return False, ""

# 在 ai_dispatcher.py 中使用
async def select_model(self, sub_task: SubTask, context: TaskContext) -> ModelConfig:
    # 敏感数据检测优先级最高
    sensitive, reason = is_sensitive(str(sub_task.params) + sub_task.description)
    if sensitive or context.user_privacy_mode:
        return ModelConfig(
            provider="fa_private",
            model="qwen3:14b",
            api_base="https://api.furtheraether.com/v1/inference"
        )
    # ... 其余选模型逻辑不变
```

---


## 二十三、多设备连接管理

### 23.1 连接类型设计

同一账号下可以同时存在多种客户端连接，按类型分开管理，互不覆盖。

```
同一账号的连接结构：
├── agent（本地执行端）  → 只允许一个，新连接踢掉旧连接
├── mobile（手机App）    → 允许多个（iPad + iPhone）
└── bot（自有Bot）       → 允许多个（多个Bot会话窗口）
```

**文件**：`server/ws/connection_manager.py`

```python
from fastapi import WebSocket
from collections import defaultdict
from loguru import logger

class ConnectionManager:

    def __init__(self):
        # user_id → {conn_id: WebSocket}
        self.mobile:  dict[str, dict[str, WebSocket]] = defaultdict(dict)
        self.bot:     dict[str, dict[str, WebSocket]] = defaultdict(dict)
        # user_id → WebSocket（只允许一个 Agent）
        self.agent:   dict[str, WebSocket] = {}

    # ── Agent（本地执行端）────────────────────────
    async def register_agent(self, user_id: str, conn_id: str, ws: WebSocket):
        # 踢掉同账号旧 Agent 连接
        if user_id in self.agent:
            try:
                await self.agent[user_id].close(1008, "New agent connected")
            except Exception:
                pass
            logger.info(f"Replaced old agent for user {user_id}")
        self.agent[user_id] = ws

    def remove_agent(self, user_id: str):
        self.agent.pop(user_id, None)

    async def push_to_agent(self, user_id: str, message: dict):
        ws = self.agent.get(user_id)
        if ws:
            await ws.send_json(message)
        else:
            raise RuntimeError(f"Agent offline for user {user_id}")

    # ── Mobile / Bot（允许多端）───────────────────
    async def register_client(self, client_type: str, user_id: str,
                               conn_id: str, ws: WebSocket):
        store = self.mobile if client_type == "mobile" else self.bot
        store[user_id][conn_id] = ws
        logger.info(f"{client_type} connected: user={user_id} conn={conn_id}")

    def remove_client(self, client_type: str, user_id: str, conn_id: str):
        store = self.mobile if client_type == "mobile" else self.bot
        store[user_id].pop(conn_id, None)

    async def broadcast_to_user(self, user_id: str, message: dict):
        """把消息推给该用户所有在线的手机端和Bot"""
        dead_conns = []
        for store in (self.mobile[user_id], self.bot[user_id]):
            for conn_id, ws in list(store.items()):
                try:
                    await ws.send_json(message)
                except Exception:
                    dead_conns.append((store, conn_id))

        for store, conn_id in dead_conns:
            store.pop(conn_id, None)   # 清理断掉的连接

# 全局单例
manager = ConnectionManager()
```

**WebSocket 端点统一使用 `conn_id` 区分多端：**

```python
# server/routers/ws_mobile.py
import uuid
from ws.connection_manager import manager

@router.websocket("/connect")
async def mobile_connect(ws: WebSocket, token: str = Query(...)):
    user = await verify_jwt_ws(token)
    conn_id = str(uuid.uuid4())          # 每次连接生成唯一ID
    await ws.accept()
    await manager.register_client("mobile", user["sub"], conn_id, ws)

    # 重连后推送待处理的 HITL
    await resend_pending_hitl(user["sub"])

    try:
        while True:
            msg = await ws.receive_json()
            await handle_mobile_message(user["sub"], msg)
    except WebSocketDisconnect:
        manager.remove_client("mobile", user["sub"], conn_id)
```

---

## 二十四、监控与告警

### 24.1 Sentry 错误追踪

Sentry 免费版足够早期使用，自动捕获所有未处理异常，按类型聚合，邮件通知。

**安装：**

```bash
pip install sentry-sdk[fastapi] --break-system-packages
```

**接入（`server/main.py` 顶部添加）：**

```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

sentry_sdk.init(
    dsn=settings.SENTRY_DSN,           # 从 sentry.io 创建项目后获取
    integrations=[
        FastApiIntegration(transaction_style="endpoint"),
        SqlalchemyIntegration(),
    ],
    traces_sample_rate=0.1,            # 10% 的请求做性能追踪
    environment=settings.ENV,          # "production" | "development"
    release=settings.APP_VERSION,      # 关联到具体版本，方便定位回归
)
```

**在 `.env.prod` 中添加：**

```bash
SENTRY_DSN=https://xxxx@o0.ingest.sentry.io/0    # sentry.io 项目设置里获取
ENV=production
APP_VERSION=1.0.0
```

**主动上报关键错误（`server/utils/errors.py`）：**

```python
import sentry_sdk

async def report_critical(error: Exception, context: dict = None):
    """
    对于 AI全链路失败、支付回调异常等关键错误，主动上报并附带上下文
    """
    with sentry_sdk.push_scope() as scope:
        if context:
            for k, v in context.items():
                scope.set_extra(k, v)
        sentry_sdk.capture_exception(error)
```

**在 inference 路由里使用：**

```python
@router.post("/v1/inference")
async def inference(req: InferenceRequest, user=Depends(verify_jwt)):
    try:
        result = await route_to_upstream(req.provider, req.model, req.dict())
        return result
    except Exception as e:
        if isinstance(e, AllModelsFailedError):
            # 全链路失败，主动上报并附带诊断信息
            await report_critical(e, {
                "user_id":  user["sub"],
                "provider": req.provider,
                "model":    req.model,
            })
        raise
```

---

### 24.2 UptimeRobot 服务可用性监控

免费，每5分钟检查一次，挂了立刻通知。

**配置步骤：**

1. 注册 [uptimerobot.com](https://uptimerobot.com)（免费）
2. 添加监控 → 类型选 **HTTP(s)**
3. URL 填 `https://api.furtheraether.com/health`
4. 检查间隔：**5分钟**
5. 告警联系人：填邮箱，可选配置企业微信/钉钉 Webhook

**健康检查端点要返回足够的信息（`server/main.py`）：**

```python
import asyncio
from db.database import engine
from utils.quota import redis_client

@app.get("/health")
async def health():
    """
    监控探针端点。检查数据库和Redis是否可达。
    正常返回200，任意依赖挂掉返回503。
    """
    checks = {"api": "ok", "db": "unknown", "redis": "unknown"}

    # 检查数据库
    try:
        async with engine.connect() as conn:
            await conn.execute("SELECT 1")
        checks["db"] = "ok"
    except Exception as e:
        checks["db"] = f"error: {str(e)[:50]}"

    # 检查 Redis
    try:
        await redis_client.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {str(e)[:50]}"

    status_code = 200 if all(v == "ok" for v in checks.values()) else 503
    return JSONResponse(content={"status": checks, "version": settings.APP_VERSION},
                        status_code=status_code)
```

---

### 24.3 告警级别定义

不是所有错误都需要半夜叫醒你，按影响程度分级处理：

| 级别 | 触发条件 | 通知方式 | 响应时间 |
|------|----------|----------|----------|
| 🔴 P0 严重 | 服务器宕机、DB不可达、支付回调失败 | 邮件 + 即时通知 | 立即处理 |
| 🟠 P1 重要 | 全部AI模型调用失败、大量5xx错误 | 邮件 | 1小时内 |
| 🟡 P2 一般 | 单个用户反复触发错误、Token超限 | Sentry聚合 | 每日review |
| ⚪ P3 观察 | 个别请求超时、单次解析失败 | 日志记录 | 按需处理 |

**Sentry 告警规则配置（在 sentry.io 的 Alerts 页面设置）：**

```
规则1（P0）：
  条件: error.level = fatal OR error.type = DatabaseError
  动作: 发邮件给 admin@furtheraether.com

规则2（P1）：
  条件: AllModelsFailedError 在 5分钟内出现 3次以上
  动作: 发邮件

规则3（P2）：
  条件: 同一用户 1小时内触发同一错误 10次以上
  动作: 在 Sentry 创建 Issue，下次 review 时处理
```

---

### 24.4 关键业务指标日志

除了错误监控，还需要记录几个关键的业务指标，用于后期分析用量和定价：

```python
# server/utils/metrics.py

from loguru import logger

def log_task_completed(user_id: str, plan: str, model: str,
                        input_tokens: int, output_tokens: int,
                        duration_seconds: float, hitl_count: int):
    """每次任务完成后记录，用于分析用量分布和定价合理性"""
    logger.info(
        "TASK_COMPLETE "
        f"user={user_id} plan={plan} model={model} "
        f"in={input_tokens} out={output_tokens} "
        f"duration={duration_seconds:.1f}s hitl={hitl_count}"
    )
    # 格式化为结构化日志，方便后期用 grep / ELK 分析

def log_hitl_triggered(user_id: str, reason: str, task_id: str):
    logger.info(f"HITL_TRIGGERED user={user_id} reason={reason} task={task_id}")

def log_quota_exceeded(user_id: str, plan: str, cycle: str):
    logger.warning(f"QUOTA_EXCEEDED user={user_id} plan={plan} cycle={cycle}")
```

> 这些日志后期可以直接用来回答"用户平均一个任务消耗多少token"、"HITL触发率是多少"、"哪个套餐的用户用量最接近上限"，为调整定价提供数据支撑。

---



## 二十六、上游 API Key 管理后台（仅管理员）

仅你（管理员）可访问，用于批量导入和管理上游模型的 API Key（DeepSeek / Qwen / Kimi / 智谱）。支持同一 provider 配置多个 Key 轮询，某个 Key 报错或余额不足时自动切换到下一个，用户完全无感知。用户侧**不存在** API Key 的概念，只有账号登录。

### 26.1 设计原则

- **多 Key 轮询**：同一个 provider 可以配置多个 Key，轮询调用，分摊用量
- **余额自动检测**：Key 返回 402/余额不足时自动标记为暂停，切换到下一个
- **人性化管理界面**：在 `platform.furtheraether.com/admin` 统一管理，支持增删改查
- **加密存储**：Key 在数据库中加密存储，日志中脱敏显示

---

### 26.2 数据库 Schema

```sql
-- API Key 池
CREATE TABLE api_keys (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    provider    TEXT NOT NULL,              -- deepseek | qwen | moonshot | zhipuai
    label       TEXT NOT NULL,             -- 你给这个Key起的名字，如"DeepSeek主力Key"
    key_value   TEXT NOT NULL,             -- 加密存储
    is_active   BOOLEAN DEFAULT true,
    priority    INTEGER DEFAULT 0,         -- 数字越大越优先调用
    balance_cny REAL,                      -- 最后一次查到的余额（手动填或自动查）
    last_used_at TIMESTAMP,
    last_error_at TIMESTAMP,
    error_count INTEGER DEFAULT 0,         -- 连续报错次数，超过阈值自动暂停
    note        TEXT,                      -- 备注，如"2026-03充值500元"
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Key 使用日志（脱敏）
CREATE TABLE api_key_logs (
    id          SERIAL PRIMARY KEY,
    key_id      TEXT REFERENCES api_keys(id),
    provider    TEXT,
    model       TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    success     BOOLEAN,
    error_code  TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);
```

---

### 26.3 Key 轮询实现

```python
# server/upstream/key_manager.py

from db.crud import get_active_keys, mark_key_error, mark_key_used
from utils.crypto import decrypt_key
import itertools

# 内存缓存（每5分钟从 DB 刷新一次）
_key_pools: dict[str, itertools.cycle] = {}

async def get_next_key(provider: str) -> tuple[str, str]:
    """
    轮询获取下一个可用 Key。
    返回：(key_id, api_key_value)
    """
    keys = await get_active_keys(provider)   # 从 DB 取 is_active=True 的 Key，按 priority 降序
    if not keys:
        raise RuntimeError(f"没有可用的 {provider} API Key，请在管理后台添加")

    if provider not in _key_pools:
        _key_pools[provider] = itertools.cycle(keys)

    key_record = next(_key_pools[provider])
    return key_record.id, decrypt_key(key_record.key_value)

async def report_key_error(key_id: str, error_code: str):
    """
    Key 调用失败时上报，连续失败3次自动暂停并触发告警
    """
    error_count = await mark_key_error(key_id)
    if error_count >= 3:
        await disable_key(key_id)
        # 触发 Sentry 告警
        sentry_sdk.capture_message(
            f"API Key {key_id} 已自动暂停（连续失败{error_count}次）",
            level="warning"
        )

# 在 route_to_upstream 中使用
async def route_to_upstream(provider: str, model: str, payload: dict) -> dict:
    key_id, api_key = await get_next_key(provider)
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{UPSTREAM_CONFIG[provider]['base_url']}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"model": model, **payload},
            )
            if resp.status_code == 402:
                await report_key_error(key_id, "quota_exceeded")
                # 自动重试用下一个 Key
                return await route_to_upstream(provider, model, payload)
            resp.raise_for_status()
            await mark_key_used(key_id)
            return resp.json()
    except Exception as e:
        await report_key_error(key_id, str(type(e).__name__))
        raise
```

---

### 26.4 管理后台界面（`platform.furtheraether.com/admin/keys`）

```
┌─────────────────────────────────────────────────────┐
│  API Key 管理                          [+ 添加新Key] │
├─────────────────────────────────────────────────────┤
│  筛选：[全部 ▼]  [DeepSeek ▼]  [仅显示活跃]        │
├──────┬──────────┬────────────┬───────┬──────────────┤
│ 状态  │ 名称     │ Provider   │ 余额  │ 操作         │
├──────┼──────────┼────────────┼───────┼──────────────┤
│ 🟢   │ DS主力   │ DeepSeek   │ ¥438  │ 编辑 暂停 删除│
│ 🟢   │ DS备用   │ DeepSeek   │ ¥200  │ 编辑 暂停 删除│
│ 🟡   │ Qwen主力 │ Qwen       │ ¥89   │ 编辑 恢复 删除│
│ 🔴   │ Kimi-1   │ Moonshot   │ ¥0    │ 编辑 充值提醒 │
└──────┴──────────┴────────────┴───────┴──────────────┘

🟢 活跃  🟡 低余额预警（< ¥50）  🔴 暂停/余额不足
```

**添加新 Key 的表单字段：**

```
Provider：  [DeepSeek ▼]
名称：      [DeepSeek 主力 Key        ]  ← 自己起个好认的名字
API Key：   [sk-xxxx________________]  ← 输入后脱敏显示 sk-xx...xxxx
优先级：    [10        ]  ← 数字越大越优先，默认0
备注：      [2026-03 充值 500 元      ]  ← 可选，方便追踪充值记录
           [取消]  [保存]
```

**界面交互细节：**

- Key 输入后立即做一次**验证请求**（发一个最小 token 的测试调用），确认 Key 有效才保存
- 余额字段支持手动填写，后续可扩展为调用各平台余额查询 API 自动刷新
- 删除前弹二次确认：「确定删除「DS主力」吗？删除后无法恢复」
- 批量导入支持 CSV：`provider,label,key_value,priority,note`

---

### 26.5 Key 加密存储

API Key 明文存储是高危风险，数据库泄露即等于所有 Key 泄露。

```python
# server/utils/crypto.py

from cryptography.fernet import Fernet
from config import settings

# KEY_ENCRYPTION_SECRET 在 .env.prod 中配置，32字节随机字符串
# 生成方式：python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
_fernet = Fernet(settings.KEY_ENCRYPTION_SECRET.encode())

def encrypt_key(api_key: str) -> str:
    """存入数据库前加密"""
    return _fernet.encrypt(api_key.encode()).decode()

def decrypt_key(encrypted: str) -> str:
    """调用时解密"""
    return _fernet.decrypt(encrypted.encode()).decode()

def mask_key(api_key: str) -> str:
    """日志和界面展示用，脱敏：sk-abcd...wxyz"""
    if len(api_key) <= 8:
        return "****"
    return f"{api_key[:6]}...{api_key[-4:]}"
```

**.env.prod 添加：**

```bash
# 生成：python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
KEY_ENCRYPTION_SECRET=your_32_byte_fernet_key_here
```

---

### 26.6 低余额预警

```python
# server/utils/billing.py 补充

LOW_BALANCE_THRESHOLD_CNY = 50.0   # 低于 ¥50 触发预警

async def check_key_balances():
    """
    定时任务，每天跑一次，检查所有 Key 余额。
    余额低于阈值时发 Sentry 告警 + 邮件提醒。
    """
    keys = await get_all_active_keys()
    for key in keys:
        if key.balance_cny and key.balance_cny < LOW_BALANCE_THRESHOLD_CNY:
            sentry_sdk.capture_message(
                f"API Key [{key.label}]({key.provider}) 余额不足 ¥{key.balance_cny:.2f}，请及时充值",
                level="warning"
            )

# 在 server/main.py 的 lifespan 中注册定时任务
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()
scheduler.add_job(check_key_balances, "cron", hour=9, minute=0)  # 每天早上9点检查
scheduler.start()
```


### 25.1 服务器 SSH 配置

**在服务器上执行（首次配置）：**

```bash
# 确认 SSH 服务运行中
systemctl status sshd

# 安全加固：改非标端口 + 禁用密码登录
nano /etc/ssh/sshd_config
# 修改以下三行：
# Port 2222
# PermitRootLogin no
# PasswordAuthentication no

systemctl restart sshd
```

**在你的本地电脑上：**

```bash
# 生成 SSH 密钥（如果还没有）
ssh-keygen -t ed25519 -C "furtheraether-dev"

# 把公钥上传到服务器（首次需要密码）
ssh-copy-id -i ~/.ssh/id_ed25519.pub -p 2222 user@your-server-ip

# 配置 SSH 别名，之后 ssh fa 就能直连
nano ~/.ssh/config
```

**`~/.ssh/config`：**

```
Host fa
    HostName your-server-ip
    User user
    Port 2222
    IdentityFile ~/.ssh/id_ed25519
```

```bash
# 验证：应直接进入服务器，无需输入密码
ssh fa
```

---

### 25.2 本地安装 Claude Code

```bash
# 本地电脑安装 Claude Code（需要 Node.js 18+）
npm install -g @anthropic-ai/claude-code

# 验证安装
claude --version
```

---

### 25.3 用 Claude Code 直接操作服务器代码

Claude Code 支持通过 SSH 在远程服务器上工作，所有文件读写和命令执行都发生在服务器上。

**方式一：SSH 进入服务器后在远程跑 Claude Code（推荐）**

```bash
# 1. SSH 进入服务器
ssh fa

# 2. 在服务器上安装 Claude Code（只需一次）
npm install -g @anthropic-ai/claude-code

# 3. 进入项目目录
cd /app/furtheraether/server

# 4. 启动 Claude Code
claude
```

启动后就可以直接用自然语言指挥 AI 修改服务器代码，例如：

```
> 给 /auth/login 接口加上登录失败次数限制，5次失败后锁定账号10分钟
> 修复 inference.py 里的套餐权限检查，Orion 套餐应该能用 kimi-k2.5
> 帮我写 quota.py 的单元测试
> 查一下最近的错误日志，看有没有异常
```

**方式二：本地 Claude Code 通过 SSH 操作远程文件**

```bash
# 在本地电脑上，指定远程工作目录
claude --ssh fa:/app/furtheraether/server
```

---

### 25.4 典型工作流

改完代码后让 Claude Code 一起帮你部署：

```
你：帮我修改计费逻辑，扩展包额度应该在基础额度耗尽后才开始扣

Claude Code：[读取 billing.py → 修改代码 → 运行测试]
             修改完成，是否需要我帮你部署？

你：是，部署到生产

Claude Code：[执行以下命令]
```

```bash
# Claude Code 会自动执行这些操作
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d api
docker compose -f docker-compose.prod.yml exec api alembic upgrade head

# 验证部署
curl https://api.furtheraether.com/health
```

---

### 25.5 给 Claude Code 的项目说明文件

在项目根目录放一个 `CLAUDE.md`，Claude Code 启动时会自动读取，了解项目背景，不用每次重复解释。

**`/app/furtheraether/CLAUDE.md`：**

```markdown
# FurtherAether 项目说明

## 项目结构
- server/        FastAPI 云服务器，处理认证、AI代理、WebSocket
- agent-core/    本地 Python Agent，执行文件/浏览器/Shell任务
- desktop-ui/    Tauri 桌面壳
- mobile-app/    React Native 手机端

## 常用命令
- 重启API服务：docker compose -f server/docker-compose.prod.yml restart api
- 查看日志：docker compose -f server/docker-compose.prod.yml logs -f api
- 跑测试：cd server && pytest tests/ -v
- 数据库迁移：docker compose exec api alembic upgrade head

## 重要文件
- server/routers/inference.py   AI推理代理，套餐权限在这里
- server/utils/billing.py       计费逻辑，Token扣减
- server/ws/connection_manager.py  WebSocket多端连接管理
- agent-core/modules/executor.py   任务执行主流程

## 注意事项
- 所有模型 API Key 在 server/.env.prod，不要提交到 git
- 修改数据库 Schema 后必须生成 alembic 迁移文件
- 生产环境 DEBUG=false，不要改成 true
- FA隐私节点（fa_private provider）不记录请求日志，不要加日志
```

---

### 25.6 备用方案：code-server（浏览器 VS Code）

需要手动翻文件或不方便开终端时用。

```bash
# 服务器上安装
curl -fsSL https://code-server.dev/install.sh | sh
systemctl enable --now code-server@$USER

# 设置强密码
nano ~/.config/code-server/config.yaml
# password: 你的20位以上强密码

# Nginx 反向代理到 code.furtheraether.com
# 配置同 api.furtheraether.com，proxy_pass 指向 127.0.0.1:8080
# 必须加 IP 白名单：allow 你的公网IP; deny all;
```

浏览器访问 `https://code.furtheraether.com` 即可。

---


---

### 18.7 Free 档每日任务计数

Free 档不按 token 限额，而是按**任务次数**限制，每日 00:00（北京时间）重置。

```python
# server/utils/billing.py 补充

import pytz
from datetime import datetime

BEIJING_TZ = pytz.timezone("Asia/Shanghai")

def get_today_key() -> str:
    """北京时间今日日期，用于 Free 档计数 Key"""
    return datetime.now(BEIJING_TZ).strftime("%Y-%m-%d")

async def check_free_quota(user_id: str) -> dict:
    """
    检查 Free 档用户今日任务次数。
    返回：{allowed: bool, used: int, limit: int, resets_at: str}
    """
    key = f"free_tasks:{user_id}:{get_today_key()}"
    used = int(await redis_client.get(key) or 0)

    # 计算今日剩余秒数（用于 Redis TTL）
    now = datetime.now(BEIJING_TZ)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    from datetime import timedelta
    next_midnight = midnight + timedelta(days=1)
    ttl = int((next_midnight - now).total_seconds())

    return {
        "allowed":    used < FREE_DAILY_TASK_LIMIT,
        "used":       used,
        "limit":      FREE_DAILY_TASK_LIMIT,
        "resets_at":  next_midnight.isoformat(),
        "ttl_seconds": ttl,
    }

async def increment_free_task(user_id: str):
    """Free 档任务开始时计数+1，设置到明日 00:00 自动过期"""
    key = f"free_tasks:{user_id}:{get_today_key()}"
    quota = await check_free_quota(user_id)
    await redis_client.incr(key)
    await redis_client.expire(key, quota["ttl_seconds"] + 60)  # 多60秒防边界
```

**Free 档在推理接口中的处理：**

```python
# server/routers/inference.py 补充

@router.post("/v1/inference")
async def inference(req: InferenceRequest, user=Depends(verify_jwt)):

    if user["plan"] == "free":
        quota = await check_free_quota(user["sub"])
        if not quota["allowed"]:
            raise HTTPException(429, {
                "message": f"今日免费次数已用完（{FREE_DAILY_TASK_LIMIT}次）",
                "resets_at": quota["resets_at"],
                "upgrade_url": "https://platform.furtheraether.com/subscription"
            })
        # Free 档限制只能用 Luna 或 Sol 档模型，Orion 模型一律降级到 Sol
        free_tier = user.get("free_tier_choice", "sol")   # 用户在设置里选的档次
        if free_tier not in FREE_TASK_MODEL_OPTIONS:
            free_tier = "sol"
        if not plan_allows(free_tier, req.model):
            req.model = get_default_model(free_tier)   # 降级到所选档次的默认模型
        result = await route_to_upstream(req.provider, req.model, req.dict())
        await increment_free_task(user["sub"])
        return result

    # 付费档：正常走套餐限额逻辑
    ...
```

---


## 二十七、本地 Agent 运行环境规格

### 27.1 支持的操作系统

| 平台 | 最低版本 | 说明 |
|------|----------|------|
| Windows | Windows 10 64位（1903+） | 主流用户群，优先保障 |
| macOS Intel | macOS 11 Big Sur+ | x86_64 |
| macOS Apple Silicon | macOS 12 Monterey+ | arm64，需单独打包 |
| Linux（Ubuntu 22.04+） | Ubuntu 22.04 LTS | P2，开发者用户，Tauri原生支持 |

---

### 27.2 安装包内置内容（用户无需手动安装任何东西）

```
FurtherAether 安装包内置：
├── Python 3.11 运行时            ← 用户无需预装 Python
├── agent-core 及所有依赖          ← pip 依赖全部打包进去
├── Playwright Chromium           ← 用户无需安装 Chrome 或任何浏览器
└── ADB（Android Debug Bridge）   ← 用于控制电脑上的 Android 模拟器
```

用户只需双击安装包，无任何额外步骤，开机即可使用。

---

### 27.3 最低硬件要求

| 项目 | 最低 | 推荐 |
|------|------|------|
| CPU | 4核 | 8核+ |
| 内存 | 8GB | 16GB+ |
| 磁盘空间 | 2GB（安装包 + 运行时） | 10GB+（日志、工作区文件） |
| 网络 | 宽带（需连接 FA 服务器） | 稳定宽带，延迟 <100ms |

---

### 27.4 浏览器自动化

**默认使用内置 Chromium，用户完全无感知。**

```python
# agent-core/tools/browser_tool.py

from playwright.async_api import async_playwright
import sys, os

def get_chromium_path() -> str | None:
    # 打包后的路径（PyInstaller 打包时放入 resources）
    bundled = os.path.join(
        getattr(sys, '_MEIPASS', ''),
        'playwright', 'chromium', 'chrome'
    )
    if os.path.exists(bundled):
        return bundled
    return None   # 开发模式：Playwright 自动找

async def launch_browser(headless: bool = True):
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=headless,
            executable_path=get_chromium_path(),
        )
        return browser
```

---

### 27.5 Android 控制（ADB）

Android 控制功能通过 ADB 控制**电脑上运行的 Android 模拟器**，用户无需数据线、无需真机、无需任何手机设置。

**推荐模拟器：**

| 模拟器 | 平台 | 说明 |
|--------|------|------|
| Android Studio AVD | Windows / macOS / Linux | 官方，稳定，免费 |
| BlueStacks | Windows / macOS | 性能好，普通用户更熟悉 |
| MuMu Player | Windows | 国内用户常用 |

Agent 启动时自动检测电脑上是否有运行中的模拟器，找到即可控制，无需用户手动配置。

```python
# agent-core/tools/android_tool.py

import sys, os, subprocess

def get_adb_path() -> str:
    adb_name = "adb.exe" if sys.platform == "win32" else "adb"
    bundled = os.path.join(getattr(sys, '_MEIPASS', ''), 'adb', adb_name)
    return bundled if os.path.exists(bundled) else "adb"

async def run_adb(args: list[str]) -> str:
    result = subprocess.run(
        [get_adb_path()] + args,
        capture_output=True, text=True, timeout=30
    )
    return result.stdout.strip()

async def get_connected_devices() -> list[str]:
    """Auto-detect running emulator instances (emulator-5554, localhost:7555 etc)"""
    output = await run_adb(["devices"])
    lines = output.split("\n")[1:]
    devices = [l.split("\t")[0] for l in lines if "\tdevice" in l]
    return [d for d in devices if d.startswith("emulator-") or "localhost" in d]

async def ensure_emulator_running() -> str:
    """Check for running emulator, raise helpful error if none found."""
    devices = await get_connected_devices()
    if not devices:
        raise AgentError(
            ErrorCode.EXEC_ANDROID_OFFLINE,
            "未检测到运行中的 Android 模拟器，请先启动模拟器（如 BlueStacks 或 Android Studio AVD）"
        )
    return devices[0]
```

**首次使用 Android 功能时的用户引导文案：**

```
要使用 Android 控制功能，请先在电脑上启动一个 Android 模拟器：

• BlueStacks：直接打开即可
• Android Studio AVD：Tools → AVD Manager → 启动模拟器
• MuMu Player：直接打开即可

模拟器启动后，点击「重新检测」。
```

---

### 27.6 首次启动环境检测

Agent 首次启动时自动检测，缺少必要条件时给出明确提示，不让用户面对技术报错。

```python
# agent-core/utils/system_check.py

import platform, os, shutil
import httpx
from loguru import logger

async def run_system_check() -> dict:
    results = {}

    # 操作系统
    os_name = platform.system()
    results["os"] = {
        "ok":    os_name in ("Windows", "Darwin"),
        "value": f"{os_name} {platform.version()}",
        "hint":  "Linux 暂不支持" if os_name == "Linux" else None
    }

    # 网络（能否到达 FA 服务器）
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get("https://api.furtheraether.com/health")
        results["network"] = {"ok": resp.status_code == 200, "value": "连接正常"}
    except Exception:
        results["network"] = {
            "ok":    False,
            "value": "无法连接服务器",
            "hint":  "请检查网络或防火墙设置"
        }

    # 磁盘空间
    free_gb = shutil.disk_usage(os.path.expanduser("~")).free / (1024**3)
    results["disk"] = {
        "ok":    free_gb >= 2.0,
        "value": f"{free_gb:.1f} GB 可用",
        "hint":  "建议至少保留 2GB" if free_gb < 2.0 else None
    }

    # Android 模拟器（可选）
    from tools.android_tool import get_connected_devices
    emulators = await get_connected_devices()
    results["android"] = {
        "ok":    len(emulators) > 0,
        "value": f"检测到 {len(emulators)} 个模拟器" if emulators else "未检测到模拟器",
        "hint":  None
    }

    passed = all(v["ok"] for k, v in results.items() if k in ("os", "network", "disk"))
    return {"passed": passed, "checks": results}
```

**桌面端启动时展示（`desktop-ui/src/pages/SystemCheck.tsx`）：**

```
正在检测运行环境...

✅ 操作系统       Windows 11
✅ 网络连接       连接正常
✅ 磁盘空间       45.2 GB 可用
⚪ Android模拟器  未检测到（可选，启动模拟器后自动识别）

[开始使用]
```

---

## 二十八、默认工具包（Built-in Toolset）

Agent 安装后内置一套工具包，覆盖四类常用能力，开箱即用。工具列表统一在配置文件中管理，新增或禁用某个工具只需改一行配置，无需改代码。

---

### 28.1 工具包配置文件

**文件**：`agent-core/config/toolset.json`

这是工具包的唯一事实来源，服务器下发的任务拆解也会参考这个列表，AI 只会生成当前启用的工具对应的子任务。

```json
{
  "version": "1.0.0",
  "tools": {
    "document": {
      "enabled": true,
      "description": "Office 文档与 PDF 处理",
      "capabilities": [
        {"id": "docx_read",    "name": "读取 Word 文档",     "enabled": true},
        {"id": "docx_write",   "name": "生成/修改 Word 文档", "enabled": true},
        {"id": "xlsx_read",    "name": "读取 Excel 表格",    "enabled": true},
        {"id": "xlsx_write",   "name": "生成/修改 Excel 表格","enabled": true},
        {"id": "pdf_read",     "name": "读取 PDF 内容",      "enabled": true},
        {"id": "pdf_convert",  "name": "文档转 PDF",         "enabled": true},
        {"id": "pdf_merge",    "name": "合并/拆分 PDF",      "enabled": true}
      ]
    },
    "image": {
      "enabled": true,
      "description": "图片处理",
      "capabilities": [
        {"id": "screenshot",   "name": "屏幕截图",           "enabled": true},
        {"id": "img_compress", "name": "图片压缩",           "enabled": true},
        {"id": "img_convert",  "name": "格式转换（PNG/JPG/WebP）","enabled": true},
        {"id": "img_resize",   "name": "调整尺寸",           "enabled": true},
        {"id": "img_batch",    "name": "批量处理图片",        "enabled": true}
      ]
    },
    "archive": {
      "enabled": true,
      "description": "压缩与解压",
      "capabilities": [
        {"id": "zip_create",   "name": "创建 ZIP",           "enabled": true},
        {"id": "zip_extract",  "name": "解压 ZIP",           "enabled": true},
        {"id": "rar_extract",  "name": "解压 RAR",           "enabled": true},
        {"id": "7z_create",    "name": "创建 7z",            "enabled": true},
        {"id": "7z_extract",   "name": "解压 7z",            "enabled": true}
      ]
    },
    "media": {
      "enabled": true,
      "description": "视频与音频处理",
      "capabilities": [
        {"id": "video_convert","name": "视频格式转换",        "enabled": true},
        {"id": "video_trim",   "name": "视频剪切",           "enabled": true},
        {"id": "audio_convert","name": "音频格式转换",        "enabled": true},
        {"id": "audio_extract","name": "从视频提取音频",      "enabled": true}
      ]
    }
  }
}
```

---

### 28.2 底层依赖（打包进安装包，用户无感知）

| 工具 | 用途 | 打包方式 |
|------|------|----------|
| **LibreOffice** | docx/xlsx 读写、转 PDF | 精简版，内置约 300MB |
| **Pillow** | 图片处理（压缩/转换/裁剪） | Python 包，pip 打包 |
| **python-pptx / openpyxl / python-docx** | Office 文档读写 | Python 包 |
| **pypdf** | PDF 读取、合并、拆分 | Python 包 |
| **7-Zip CLI（7za）** | zip/rar/7z 压缩解压 | 独立二进制，内置 |
| **FFmpeg** | 视频/音频转码、剪切 | 精简版二进制，内置约 50MB |

> LibreOffice 精简版只保留命令行转换功能，不含完整 GUI，安装包体积可控制在 400MB 以内。

---

### 28.3 工具加载机制

启动时读取 `toolset.json`，只注册 `enabled: true` 的工具，AI 调度层的 system prompt 根据已启用工具动态生成，确保 AI 不会生成用不了的子任务。

```python
# agent-core/config/toolset_loader.py

import json
from pathlib import Path

TOOLSET_PATH = Path(__file__).parent / "toolset.json"

def load_enabled_capabilities() -> list[dict]:
    """读取所有启用的能力，供 AI 调度层生成 system prompt 时使用"""
    config = json.loads(TOOLSET_PATH.read_text())
    result = []
    for category, data in config["tools"].items():
        if not data["enabled"]:
            continue
        for cap in data["capabilities"]:
            if cap["enabled"]:
                result.append({
                    "id":       cap["id"],
                    "name":     cap["name"],
                    "category": category,
                })
    return result

def is_capability_enabled(capability_id: str) -> bool:
    """执行前校验该能力是否启用"""
    caps = load_enabled_capabilities()
    return any(c["id"] == capability_id for c in caps)
```

**在 Planner 的 system prompt 中动态注入当前可用工具：**

```python
# agent-core/modules/ai_dispatcher.py

from config.toolset_loader import load_enabled_capabilities

def build_planner_system_prompt() -> str:
    caps = load_enabled_capabilities()
    caps_text = "\n".join(f"- {c['id']}: {c['name']}" for c in caps)
    return f"""
你是 FurtherAether 的任务规划引擎。

当前已启用的工具能力如下，只能使用这些能力，不要生成列表之外的工具调用：
{caps_text}

...（其余 prompt 内容不变）
"""
```

---

### 28.4 新增工具的标准流程

后续想加新工具（如网页抓取、OCR、代码执行等），按以下步骤操作：

```
1. 在 toolset.json 里加一条 capability（默认 enabled: false，灰度开放）
2. 在 tools/ 目录新建对应的 tool 实现，继承 BaseTool
3. 在 executor.py 的工具路由表里注册
4. 更新 test_cases.json 补充测试用例
5. 改 enabled: true 即可开放给用户
```

不需要改 AI 的 system prompt，因为 prompt 是动态生成的，加了新能力自动出现在 AI 可用列表里。

---

*文档版本：v2.0 | 最后更新：2026年3月*

---

### 28.5 用户工具扩展（Tool Marketplace）

除内置工具外，用户可以在桌面端的「工具市场」自行安装额外工具包，安装即生效，无需重启。

**设计原则：**
- 工具包是独立的 Python 包 + 一个 `tool_manifest.json` 描述文件
- 安装时自动下载依赖、注册工具、更新 AI 可用列表
- 卸载时彻底清除，不留残留
- 工具市场由 FurtherAether 官方审核后上架，保证安全

---

**工具包目录结构（开发者视角）：**

```
my_tool_package/
├── tool_manifest.json      # 工具描述（必须）
├── tool.py                 # 工具实现，继承 BaseTool（必须）
├── requirements.txt        # 额外 Python 依赖（可选）
└── README.md               # 用户说明（可选）
```

**`tool_manifest.json` 格式：**

```json
{
  "id":          "ocr_tool",
  "name":        "OCR 文字识别",
  "description": "识别图片或 PDF 中的文字内容，支持中英文",
  "version":     "1.0.0",
  "author":      "FurtherAether",
  "category":    "document",
  "capabilities": [
    {"id": "ocr_image", "name": "识别图片文字"},
    {"id": "ocr_pdf",   "name": "识别 PDF 文字（扫描件）"}
  ],
  "requirements": ["paddleocr>=2.7", "paddlepaddle"],
  "min_app_version": "1.0.0",
  "platforms": ["windows", "macos", "linux"]
}
```

---

**工具市场界面（`desktop-ui/src/pages/Marketplace.tsx`）：**

```
┌─────────────────────────────────────────────────────────┐
│  工具市场                              🔍 搜索工具       │
├─────────────────────────────────────────────────────────┤
│  已安装  |  全部  |  文档处理  |  图片  |  网络  |  其他 │
├──────────────────────────────────────────────────────────┤
│  📄 OCR 文字识别                              [安装]     │
│  识别图片/PDF 中的文字，支持中英文                        │
│  官方出品 · 下载量 12,400                                │
├──────────────────────────────────────────────────────────┤
│  🌐 网页抓取                                  [安装]     │
│  抓取网页正文、表格数据，支持登录态抓取                   │
│  官方出品 · 下载量 8,200                                 │
├──────────────────────────────────────────────────────────┤
│  💻 代码执行                                  [已安装 ✓] │
│  在沙盒中运行 Python/Shell 代码片段                      │
│  官方出品 · 下载量 6,100                    [卸载]       │
└──────────────────────────────────────────────────────────┘
```

---

**工具安装流程（`agent-core/tools/marketplace.py`）：**

```python
import httpx, importlib, json
from pathlib import Path

TOOLS_DIR       = Path.home() / ".furtheraether" / "tools"
MARKETPLACE_API = "https://api.furtheraether.com/marketplace"

async def install_tool(tool_id: str) -> dict:
    """
    下载并安装工具包：
    1. 从市场 API 获取下载地址
    2. 下载工具包到本地
    3. 安装额外依赖（pip）
    4. 注册到 toolset.json
    5. 热加载，无需重启
    """
    # 1. 获取工具包信息
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{MARKETPLACE_API}/tools/{tool_id}")
        tool_info = resp.json()

    tool_path = TOOLS_DIR / tool_id
    tool_path.mkdir(parents=True, exist_ok=True)

    # 2. 下载工具文件
    async with httpx.AsyncClient() as client:
        pkg = await client.get(tool_info["download_url"])
    (tool_path / "tool.py").write_bytes(pkg.content)
    (tool_path / "tool_manifest.json").write_text(
        json.dumps(tool_info["manifest"], ensure_ascii=False)
    )

    # 3. 安装依赖
    if tool_info["manifest"].get("requirements"):
        import subprocess, sys
        subprocess.run([
            sys.executable, "-m", "pip", "install",
            *tool_info["manifest"]["requirements"],
            "--break-system-packages", "-q"
        ], check=True)

    # 4. 注册到 toolset.json
    _register_tool(tool_info["manifest"])

    # 5. 热加载（无需重启）
    _hot_reload_tool(tool_id, tool_path)

    return {"success": True, "tool_id": tool_id}

def _register_tool(manifest: dict):
    """把工具写入 toolset.json"""
    config_path = Path(__file__).parent.parent / "config" / "toolset.json"
    config = json.loads(config_path.read_text())
    category = manifest.get("category", "user")
    if category not in config["tools"]:
        config["tools"][category] = {"enabled": True, "description": category, "capabilities": []}
    for cap in manifest["capabilities"]:
        cap["enabled"] = True
        cap["source"]  = "marketplace"    # 标记来源，方便卸载时清除
        config["tools"][category]["capabilities"].append(cap)
    config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2))

def _hot_reload_tool(tool_id: str, tool_path: Path):
    """动态加载新工具，注册到全局工具路由表"""
    import importlib.util
    spec   = importlib.util.spec_from_file_location(tool_id, tool_path / "tool.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    # 注册到 executor 的工具路由
    from modules.executor import register_tool
    register_tool(tool_id, module.Tool())

async def uninstall_tool(tool_id: str):
    """卸载工具：删除文件 + 从 toolset.json 移除"""
    import shutil
    tool_path = TOOLS_DIR / tool_id
    if tool_path.exists():
        shutil.rmtree(tool_path)
    # 从 toolset.json 移除 source=marketplace 的条目
    _unregister_tool(tool_id)
```

---

**工具更新机制：**

```python
async def check_tool_updates() -> list[dict]:
    """启动时检查已安装工具是否有新版本"""
    installed = _get_installed_tools()       # 读 toolset.json 里 source=marketplace 的条目
    updates = []
    async with httpx.AsyncClient() as client:
        for tool in installed:
            resp = await client.get(f"{MARKETPLACE_API}/tools/{tool['id']}/latest")
            latest = resp.json()
            if latest["version"] != tool["version"]:
                updates.append({
                    "id":              tool["id"],
                    "name":            tool["name"],
                    "current_version": tool["version"],
                    "new_version":     latest["version"],
                    "changelog":       latest.get("changelog", ""),
                })
    return updates
```

**桌面端启动时若有更新，顶部显示提示条：**

```
🔔  2 个工具有新版本可用  [查看更新]  [稍后提醒]
```


## 二十九、FurtherAether 服务器管理工具（fa-admin）

一个独立的命令行工具，专为你（管理员）设计。有独立的管理员身份认证，与服务器建立加密连接，可以在任何电脑上运行，不需要 SSH 进服务器。

---

### 29.1 设计定位

```
你的电脑
  └── fa-admin（命令行工具）
         │  HTTPS + 管理员 JWT
         ▼
  FurtherAether 服务器
  └── /admin/* 路由（仅管理员 token 可访问）
```

- **独立身份**：管理员账号与普通用户账号完全分离，存在不同的表里
- **任何地方可用**：只要有网络，在任何电脑上运行 `fa-admin` 即可管理服务器
- **操作留痕**：所有管理操作写入 `admin_logs` 表，方便审计

---

### 29.2 安装

```bash
# 在你的本地 Linux 电脑上安装（需要 Python 3.11+）
pip install fa-admin --break-system-packages

# 或者下载单文件可执行版本（不需要 Python）
# 从 platform.furtheraether.com/admin/download 下载
# 推荐放到 /usr/local/bin/ 方便全局使用
sudo mv fa-admin /usr/local/bin/ && sudo chmod +x /usr/local/bin/fa-admin
```

---

### 29.3 首次登录与身份绑定

```bash
# 首次配置，输入服务器地址和管理员邮箱
fa-admin login

# 交互式引导：
# ? 服务器地址：https://api.furtheraether.com
# ? 管理员邮箱：your@email.com
# → 正在发送验证码...
# ? 请输入邮箱收到的6位验证码：••••••
#
# ✅ 验证成功，身份已绑定到本机
# Token 保存至 ~/.fa-admin/credentials.json（仅本机可读）
```

登录后 token 自动保存，后续命令无需重复输入密码。

---

### 29.4 常用命令

**服务器状态：**

```bash
fa-admin status                   # 服务器总览：在线用户数、API Key状态、内存/CPU
fa-admin status --watch           # 实时刷新（每5秒）
```

**用户管理：**

```bash
fa-admin users list               # 列出所有用户
fa-admin users list --plan sol    # 按套餐筛选
fa-admin users info <user_id>     # 查看单个用户详情（套餐、用量、注册时间）
fa-admin users set-plan <user_id> orion    # 修改用户套餐
fa-admin users ban <user_id>      # 封禁用户
fa-admin users unban <user_id>    # 解封用户
```

**API Key 管理：**

```bash
fa-admin keys list                # 列出所有 API Key（脱敏显示）
fa-admin keys add                 # 交互式添加新 Key
fa-admin keys disable <key_id>    # 暂停某个 Key
fa-admin keys enable <key_id>     # 恢复某个 Key
fa-admin keys balance             # 查看所有 Key 余额（需各平台支持余额查询 API）
```

**用量与统计：**

```bash
fa-admin stats today              # 今日统计（任务数、token消耗、费用）
fa-admin stats month              # 本月统计
fa-admin stats top-users          # 用量最多的前10个用户
fa-admin stats model-breakdown    # 各模型调用量分布
```

**工具市场管理：**

```bash
fa-admin marketplace list         # 查看上架的工具包
fa-admin marketplace publish ./my_tool/   # 上架新工具包（提交审核）
fa-admin marketplace unpublish <tool_id>  # 下架工具包
```

**服务器运维：**

```bash
fa-admin server logs              # 查看最新100行服务器日志
fa-admin server logs --follow     # 实时跟踪日志（类似 tail -f）
fa-admin server restart           # 重启 API 服务
fa-admin server deploy            # 触发最新代码部署（调用 deploy.sh）
fa-admin server db migrate        # 运行数据库迁移
```

---

### 29.5 交互式 TUI 模式

不想记命令的时候，直接运行 `fa-admin` 进入全屏交互界面：

```bash
fa-admin
```

```
╔══════════════════════════════════════════════════════════╗
║  FurtherAether Admin  ·  api.furtheraether.com  ·  在线  ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║   📊 今日概览                                            ║
║      活跃用户  42      任务数  318      花费  ¥12.4      ║
║      API Key  3/4 正常                                   ║
║                                                          ║
║   快捷操作                                               ║
║   [1] 用户管理    [2] API Key    [3] 用量统计            ║
║   [4] 服务器日志  [5] 工具市场   [6] 部署                ║
║                                                          ║
║   [Q] 退出                                               ║
╚══════════════════════════════════════════════════════════╝
```

---

### 29.6 服务器侧：管理员路由

**文件**：`server/routers/admin.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from auth import verify_admin_jwt    # 独立的管理员 token 校验（邮箱验证码登录）

router = APIRouter(prefix="/admin", tags=["管理员"])

# 所有 /admin/* 路由必须通过管理员身份校验
# 普通用户 token 即使有效也无法访问

@router.get("/status")
async def server_status(admin=Depends(verify_admin_jwt)):
    return {
        "online_agents": len(manager.agent),
        "online_mobiles": sum(len(v) for v in manager.mobile.values()),
        "api_keys": await get_key_status_summary(),
        "uptime": get_uptime(),
    }

@router.get("/users")
async def list_users(plan: str = None, page: int = 1,
                     admin=Depends(verify_admin_jwt)):
    return await get_users_paginated(plan=plan, page=page)

@router.patch("/users/{user_id}/plan")
async def set_user_plan(user_id: str, plan: str,
                        admin=Depends(verify_admin_jwt)):
    await update_user_plan(user_id, plan)
    await log_admin_action(admin["sub"], "set_plan", {"user_id": user_id, "plan": plan})
    return {"ok": True}

@router.post("/server/deploy")
async def trigger_deploy(admin=Depends(verify_admin_jwt)):
    """触发服务器部署（调用 deploy.sh）"""
    import asyncio
    proc = await asyncio.create_subprocess_exec(
        "/app/furtheraether/server/deploy.sh",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    await log_admin_action(admin["sub"], "deploy", {})
    return {"ok": proc.returncode == 0, "output": stdout.decode()}
```

**管理员身份校验（独立于普通用户）：**

```python
# server/utils/auth.py 补充

def create_admin_token(admin_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=30)
    return jwt.encode(
        {"sub": admin_id, "role": "admin", "exp": expire},
        settings.ADMIN_JWT_SECRET,    # 与普通用户使用不同的 secret
        algorithm=settings.JWT_ALGORITHM
    )

async def verify_admin_jwt(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.ADMIN_JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM]
        )
        if payload.get("role") != "admin":
            raise HTTPException(403, "Not an admin token")
        return payload
    except JWTError:
        raise HTTPException(401, "Invalid admin token")


# ── 邮箱验证码登录流程 ────────────────────────

# POST /admin/auth/send-code  → 发送验证码到管理员邮箱
# POST /admin/auth/verify     → 验证码正确后返回管理员 token

import random, string
from email.message import EmailMessage
import smtplib

async def send_admin_verification_code(email: str) -> str:
    """生成6位验证码，存入 Redis（5分钟有效），发送到管理员邮箱"""
    if email != settings.ADMIN_EMAIL:
        raise HTTPException(403, "Not an authorized admin email")

    code = ''.join(random.choices(string.digits, k=6))
    await redis_client.setex(f"admin_code:{email}", 300, code)   # 5分钟过期

    # 发送邮件（使用任意 SMTP 服务，如 QQ 邮箱、阿里企业邮箱）
    msg = EmailMessage()
    msg["Subject"] = "FurtherAether 管理员登录验证码"
    msg["From"]    = settings.SMTP_FROM
    msg["To"]      = email
    msg.set_content(f"你的验证码是：{code}\n\n5分钟内有效，请勿泄露。")

    with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT) as smtp:
        smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.send_message(msg)

    return code   # 仅供本地开发日志打印，生产不返回给客户端

async def verify_admin_code(email: str, code: str) -> str:
    """校验验证码，正确则签发管理员 token"""
    if email != settings.ADMIN_EMAIL:
        raise HTTPException(403, "Not an authorized admin email")

    stored = await redis_client.get(f"admin_code:{email}")
    if not stored or stored != code:
        raise HTTPException(401, "验证码错误或已过期")

    await redis_client.delete(f"admin_code:{email}")   # 用完即删，防重放
    return create_admin_token(email)
```

**.env.prod 补充：**

```bash
# 管理员专属密钥，与用户 JWT_SECRET 完全分开
ADMIN_JWT_SECRET=another_random_32_byte_secret
ADMIN_EMAIL=your@email.com      # 你的管理员邮箱，登录时发验证码到这里

# SMTP 邮件发送配置（用于发验证码）
SMTP_HOST=smtp.qq.com           # QQ邮箱：smtp.qq.com / 阿里云：smtp.aliyun.com
SMTP_PORT=465
SMTP_USER=your@qq.com
SMTP_PASSWORD=your_smtp_auth_code   # QQ邮箱用"授权码"，不是登录密码
SMTP_FROM=your@qq.com
```

---

### 29.7 管理员操作日志

所有管理操作自动记录，方便审计和回溯。

```sql
CREATE TABLE admin_logs (
    id          SERIAL PRIMARY KEY,
    admin_id    TEXT NOT NULL,
    action      TEXT NOT NULL,        -- 'set_plan' | 'ban_user' | 'deploy' | ...
    target      JSON,                 -- 操作对象，如 {"user_id": "xxx"}
    ip          TEXT,                 -- 操作来源 IP
    created_at  TIMESTAMP DEFAULT NOW()
);
```

```bash
# 用 fa-admin 查看操作历史
fa-admin logs                         # 最近50条操作记录
fa-admin logs --action deploy         # 只看部署记录
fa-admin logs --since 2026-03-01      # 指定日期之后的记录
```


---

## 附录：项目关键信息

> 请填写以下信息，开发过程中 AI 需要这些配置。所有敏感信息（密码/Key）填写后请妥善保管此文档。

---

### A. 域名与服务器

| 项目 | 值 |
|------|----|
| 主域名 | furtheraether.com |
| API 服务器 | api.furtheraether.com |
| 平台网站 | platform.furtheraether.com |
| 支付页面 | pay.furtheraether.com |
| 管理工具 | code.furtheraether.com（可选） |
| 本地服务器 IP | `[填写你的公网IP]` |
| 服务器系统 | Linux（本地） |
| DDNS 服务 | `这个公网上架先不做` |

---

### B. 管理员账号

| 项目 | 值 |
|------|----|
| 管理员邮箱 | `13263101819@163.com` |
| fa-admin 服务器地址 | https://api.furtheraether.com |
| SMTP 服务商 | `163（网易）` |
| SMTP 地址 | `我不知道，但你可以查到` |

---

### C. 上游模型 API Key

| Provider | Key（脱敏） | 备注 |
|----------|------------|------|
| DeepSeek | `sk-8508d9278254439795ab87e2862c1be5` | 主力规划/执行模型 |
| Qwen（阿里云百炼） | `[填写]` | Luna档主力 |
| Kimi（Moonshot） | `[填写]` | Orion档浏览器/Android |
| 智谱AI（GLM） | `[填写]` | Orion档整合/文件 |

---

### D. 收款信息（内测阶段）

| 项目 | 值 |
|------|----|
| 微信收款码图片路径 | `[填写，如 /assets/wechat_qr.png]` |
| 支付宝收款码图片路径 | `[填写]` |
| 收款通知邮箱 | `[填写]` |
| 人工激活流程 | fa-admin users set-plan \<user_id\> \<plan\> |

---

### E. 服务器环境变量清单（`.env.prod`）

> 全部填好后直接粘贴到服务器的 `.env.prod` 文件

```bash
# 数据库
DATABASE_URL=postgresql+asyncpg://fa:[密码]@localhost:5432/furtheraether
REDIS_URL=redis://localhost:6379/0

# JWT
JWT_SECRET=[生成：python -c "import secrets; print(secrets.token_hex(32))"]
ADMIN_JWT_SECRET=[同上，另生成一个]
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=120
REFRESH_TOKEN_EXPIRE_DAYS=30

# 管理员
ADMIN_EMAIL=[你的邮箱]

# SMTP
SMTP_HOST=[填写]
SMTP_PORT=465
SMTP_USER=[填写]
SMTP_PASSWORD=[填写]
SMTP_FROM=[填写]

# 上游模型 API Key
DEEPSEEK_API_KEY=[填写]
QWEN_API_KEY=[填写]
MOONSHOT_API_KEY=[填写]
ZHIPUAI_API_KEY=[填写]

# Key 加密
KEY_ENCRYPTION_SECRET=[生成：python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"]

# 套餐 Token 限额
LUNA_TOKEN_LIMIT=3000000
SOL_TOKEN_LIMIT=10000000
ORION_TOKEN_LIMIT=15000000

# 应用
APP_VERSION=1.0.0
ENV=production
DEBUG=false
SENTRY_DSN=[从 sentry.io 获取，可选]
```

---

### F. 待办清单（开发开始前）

- [ ] Namecheap 添加 DNS A 记录，指向本地服务器公网 IP
- [ ] 配置 DDNS，防止 IP 变动导致域名失效
- [ ] 联系宽带运营商开放 443/80 端口（或确认已开放）
- [ ] 注册 Apple Developer 账号（¥688/年，用于 macOS 签名）
- [ ] 准备收款码图片（微信 + 支付宝）
- [ ] 注册 Sentry 账号（免费，用于错误监控）
- [ ] 注册 UptimeRobot 账号（免费，用于服务监控）
- [ ] 在各模型平台充值并获取 API Key

