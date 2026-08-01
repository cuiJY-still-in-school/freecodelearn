# FreeCodeLearn

输入一个主题,AI 几分钟生成一门 freeCodeCamp 风格的编程课程,即刻开始学习。

## 功能

- **AI 生成课程**:支持任何 OpenAI 兼容协议的服务(OpenAI / DeepSeek / 通义 / Ollama / OpenCode Zen 免费模型等)
- **freeCodeCamp 式学习体验**:
  - 左侧大纲 + 右侧内容
  - 图文步骤式章节(markdown 渲染)
  - 代码挑战 + 浏览器沙箱自动判题(iframe sandbox,用户代码不接触服务端,安全)
  - 章节测验(选择题 + 解析)
  - 进度跟踪(localStorage,自动续学上次未完成步骤)
- 课程数据存于 `data/courses/`(JSON 文件,gitignore)

## 快速开始

```bash
npm install
npm run dev
# 打开 http://localhost:3000
```

## 配置 AI 服务

打开「设置」页填入三项:

| 字段 | 示例 |
| --- | --- |
| Base URL | `https://api.openai.com/v1` |
| API Key | `sk-...` |
| 模型 | `gpt-4o` |

### 免费方案:OpenCode Zen(无需信用卡)

1. 到 <https://opencode.ai/zen> 注册并创建 API Key
2. 设置页填入:

```
Base URL: https://opencode.ai/zen/v1
模型:     deepseek-v4-flash-free(或 minimax-m2.5-free / qwen3.6-plus-free / big-pickle)
```

免费额度约 100 次请求/天。

也可用环境变量 `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`(优先级低于网页设置)。

## 项目结构

```
app/
  page.tsx              首页:课程列表 + 生成表单
  settings/page.tsx     AI 服务配置
  courses/[id]/page.tsx 学习页(服务端取课程)
  api/ai/generate       AI 生成课程
  api/courses           课程列表 / 删除
  api/settings          设置读写
components/
  course-player.tsx     学习主界面(进度、导航)
  course-sidebar.tsx    大纲侧边栏
  challenge-runner.tsx  CodeMirror 编辑器 + iframe 判题器
  quiz-view.tsx         选择题测验
  lesson-view.tsx       markdown 课文渲染
lib/
  types.ts              课程数据模型
  store.ts              文件存储(data/)
  ai.ts                 AI 生成(结构化 JSON 输出)
  progress.ts           进度(localStorage)
```

## 判题约定

AI 生成的 JS 挑战测试使用 `test(name, fn)` / `assert(cond, msg)` 辅助函数,运行在
沙箱 iframe 中(见 `lib/ai.ts` 的 SYSTEM_PROMPT)。非 JS 语言挑战无自动判题,
提供参考答案查看。
