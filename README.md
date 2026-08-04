# FreeCodeLearn

输入一个主题,AI 几分钟生成一门 freeCodeCamp 风格的编程课程,即刻开始学习。

## 功能

- **AI 生成课程**:支持任何 OpenAI 兼容协议的服务(OpenAI / DeepSeek / 通义 / Ollama / OpenCode Zen 免费模型等)
- **定制化生成**:
  - 上传参考文档(txt / md / 代码文件),AI 取材于你的文档生成课程(术语、示例、工作流保持一致)
  - 选择已有课程作为参考,新课程模仿其项目式结构与步骤粒度
  - 补充说明、难度、章节数自由指定
- **大纲确认步骤**:AI 先产出完整课程大纲(标题/章节/步骤/时长),确认或「换个大纲」后再开始生成
- **主题把关**:无关主题(如烹饪)会先被拦截提示,可选择「仍然生成」或「换个主题」
- **freeCodeCamp 式学习体验**:
  - 左侧大纲(章节可折叠、当前步骤自动跟随)+ 右侧内容
  - 图文步骤式章节(markdown 渲染,代码块一键复制)
  - 代码挑战 + 浏览器沙箱自动判题(iframe sandbox,用户代码不接触服务端,安全)
  - freeCodeCamp 教学法:真实项目贯穿全程、挑战渐进小步、种子代码保护结构(编辑区模式)、
    判题仿 hint 风格(人话错误提示、由宽到严的断言、防破坏断言)
  - 章节测验(选择题 + 解析,答对全部才通过)
  - 学习激励:通过横幅、章节完成转场、尝试次数鼓励、课程完成庆祝
  - 进度跟踪(localStorage,自动续学上次未完成步骤;首页卡片显示进度与「继续学习」)
  - 追加章节:课程学习页面可直接让 AI 追加新章节
- **课程导入导出**:导出 .fcl 文件(含课程与学习进度),随时导入恢复
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

## 桌面版(Electron)

- `npm run dev:desktop`:启动内嵌服务器 + Electron 窗口
- 数据目录:`~/.config/freecodelearn/data`(可用 `FCL_DATA_DIR` 覆盖)
- 打包:先 `npm run build`,再 `npx electron-builder --linux`(国内网络需 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`)

## 项目结构

```
app/
  page.tsx               首页:课程列表 + 生成表单(参考文档/参考课程)
  settings/page.tsx      AI 服务配置
  courses/[id]/page.tsx  学习页(服务端取课程)
  api/ai/outline         大纲生成(含主题把关)与确认
  api/ai/chapter         单章内容生成(并行)
  api/ai/assemble        组装保存课程
  api/ai/test            补充自动判题
  api/courses            课程列表 / 详情 / 删除 / 导入
  api/settings           设置读写
components/
  course-player.tsx      学习主界面(进度、导航、通过/章节横幅)
  course-sidebar.tsx     大纲侧边栏(折叠、跟随、进度)
  challenge-runner.tsx   CodeMirror 编辑器 + iframe 判题器(种子模式/chai 风格断言)
  quiz-view.tsx          选择题测验
  lesson-view.tsx        markdown 课文渲染(代码块复制)
lib/
  types.ts               课程数据模型(seedBefore/seedAfter/编辑区标记)
  store.ts               文件存储(data/)
  ai.ts                  AI 提示词与生成流程(教学法见下)
  progress.ts            进度(localStorage)
electron/
  main.js                桌面壳:内嵌服务器 + 自动打开窗口
```

## 教学法(提示词设计)

AI 提示词模仿 freeCodeCamp 真实课程(如 Learn HTML by Building a Cat Photo App),要点:

- **课程 = 一个真实项目**:「用 X 做 Y」,章节 = 构建阶段,每章结束项目处于可运行状态
- **挑战渐进小步**:每个挑战只引入一个新概念、只改一处
- **描述三步式**:过渡句衔接上下文 → 概念讲解(术语高亮)→ 精确指令(改哪里、写什么、值是什么)
- **种子代码模式**:`seedBefore` + 编辑区 + `seedAfter`,结构骨架在编辑区外,学习者只改编辑区
- **判题仿 hint 风格**:每个测试只查一件事;失败信息写人话 + 细节提示(拼写/大小写/空格);
  断言由宽到严(存在性 → 结构性 → 值宽松 → 值严格 → 规范性);含防破坏断言
- **测验考理解不考记忆**:用新例子检验概念

## 判题约定

- 沙箱中可用:`test(name, fn)` / `assert(cond, msg)`(含 equal/notEqual/exists/match/notMatch/include 等
  chai 风格辅助)、`code`(编辑区代码)、`document`(渲染后 DOM)、`__fcl_input`(非代码语言全文)
- 语言支持:HTML(渲染 DOM 断言)、CSS(注入 style + getComputedStyle)、JavaScript(直接执行)、
  其他文本类(Shell/Git/SQL/Python 等字符串断言)
- 非 JS 语言无自动判题时,提供参考答案查看与一键填入
