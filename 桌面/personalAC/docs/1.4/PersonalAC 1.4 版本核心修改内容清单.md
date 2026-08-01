```text
# PersonalAC 1.4 版本核心修改内容清单：自我驱动与全能管家

1.4 版本是 PersonalAC 的一次重大飞跃，核心目标是实现 Agent 的“自我意识”与“全能任务管理”，同时解决跨平台部署的最后障碍。

---

## 1. Agent-Native Todo 系统 (智能待办)

**目标：** 将 Todo 从静态清单变为 Agent 可理解、可操作、可预测的动态任务流。

- [ ] **新增 `Todo` 数据表**：
    - 字段：`id`, `title`, `content`, `priority`, `status` (pending/done/dropped), `due_date`, `recurrence` (cron string), `agent_created` (boolean), `related_kp_id` (关联知识点)。
- [ ] **双向交互逻辑**：
    - **UI 侧**：新增极简 Todo 视图，支持快速添加和周期性设置。
    - **Agent 侧**：新增 `manage_todo` 工具。Agent 可以在对话中感知需求并自动创建任务。
    - **智能提醒**：Agent 会根据 `due_date` 主动在 Web 端或通过已配置的通知渠道推送提醒。

---

## 2. 终极编排：自我唤醒与动态心跳 (Self-Driven Orchestration)

**目标：** 让 Agent 从“拨号上网”模式进化为“常驻大脑”模式。

- [ ] **自我唤醒心跳 (Heartbeat Logic)**：
    - 建立一个后台守护进程/定时任务，每隔固定时间（如 30 分钟）唤醒 Agent 的“思考模块”。
    - **思考内容**：Agent 自动扫描：
        1. 最近是否有新邮件资源未解析？
        2. 是否有即将到期的 Todo？
        3. 是否有学生长期未掌握的薄弱点需要主动推送练习？
- [ ] **动态优先级编排**：
    - Agent 根据扫描结果，自主决定是否触发用户可见的“主动反馈”。
    - **避免骚扰**：引入“静默阈值”，确保 Agent 的主动唤醒不会变成无意义的骚扰。

---

## 3. 极致兼容性：NPM 全环境适配 (Deployment Robustness)

**目标：** 彻底解决 `npm install` 过程中的编译报错，实现“零门槛”安装。

- [ ] **SQLite 兼容性降级方案**：
    - 优化 `better-sqlite3` 的加载逻辑：若编译失败，自动尝试使用 `sqlite3` (预编译版) 或提供清晰的 `node-gyp` 环境修复指引。
    - 考虑在云端模式下支持连接远程数据库，规避本地编译问题。
- [ ] **环境预检脚本 (Pre-flight Check)**：
    - 在 `npm install` 或 `personalac init` 时自动运行。
    - 检测 Node 版本、权限、磁盘空间、C++ 编译环境，并生成一键修复建议。
- [ ] **Docker 一键部署支持**：
    - 随包附带 `Dockerfile` 和 `docker-compose.yml`。
    - 目标：`docker run personalac` 即可在任何服务器（无论环境多乱）上完美运行。

---

## 4. 数据结构与 API 升级

- [ ] **新增 `AgentThought` 表**：
    - 记录 Agent 的后台思考记录、任务规划碎片。
    - 作用：为 Agent 提供“长期记忆”，使其在下次唤醒时知道上次思考到了哪里。
- [ ] **API 扩展**：
    - `/api/todo`：全套 CRUD 接口。
    - `/api/agent/heartbeat`：手动触发 Agent 思考逻辑。

---

## 5. 极致便捷性：CLI 增强

- [ ] **`pac doctor` 命令**：一键诊断当前安装环境的问题。
- [ ] **`pac sync` 命令**：手动触发云端与本地的强制同步。

---

**执行建议：** 1.4 的开发重点应放在 **Todo 系统的建立** 和 **自我唤醒逻辑的闭环** 上。兼容性问题建议通过提供 Docker 镜像作为终极兜底方案。
```
