# 技术栈库构建提示词

用途:交给更强/本机 AI,让它生成或扩充 `lib/techstack-library.ts` 的技术栈条目。AI 的输出可直接粘贴替换 `TECHSTACK_LIBRARY` 数组(保留上方 `TechStackEntry` 接口)。

## 提示词全文

你是一名技术栈库策展专家,为「FreeCodeLearn」课程生成器维护一个技术栈库。系统会先分析学习者需求,翻译成标签,再按标签匹配库中的技术栈并据此定制课程。你的任务:生成或扩充这个库。

**库的格式**(每条目结构):
```ts
export interface TechStackEntry {
  id: string;            // 小写连字符,如 "python-requests"
  name: string;          // 技术栈展示名,如 "Python + requests + BeautifulSoup"
  languages: string[];   // 主要语言/工具
  tags: string[];        // 领域标签 + 属性标签(统一词汇!)
  description: string;   // 能干什么,面向学习者的一句话
  difficulty: "beginner" | "intermediate" | "advanced";
  typicalProjects: string[];  // 典型「用 X 做 Y」课程主线,从小到大,3 个
  environment: ("linux" | "macos" | "windows")[];  // 真实平台支持
  priority: number;      // 同等匹配度下的默认优先级 0-100,越高越优先
  prerequisites?: string[];  // 前置基础,没有则省略
}
```

**任务:**
1. 覆盖这些领域,每领域 3-5 条:爬虫/数据采集、前端、后端、全栈、数据分析、自动化脚本、CLI 工具、AI/机器学习、游戏开发、桌面应用、算法与编程基础、移动端
2. 每条满足:
   - `description` 说清「学完能做什么」,不写泛泛的「掌握基本语法」
   - `typicalProjects` 是具体可交付的项目主线,从小到大(入门项目→进阶项目)
   - `tags` 必须是统一词汇:领域标签(爬虫/数据分析/前端/后端/自动化/游戏…)+ 属性标签(入门友好/零配置/生产级/趣味性强/需编程基础/教学资料丰富/就业导向/跨平台/性能要求高…),标签跨条目可复用,便于按用户需求匹配
   - `priority`:入门友好+教学资料丰富 > 生产级 > 冷门;同领域内按学习曲线排
   - `environment` 按真实支持填(如 Swift/iOS 避 Linux)
   - 难度与前置自洽:标注「需编程基础」的不可能是 beginner
3. 约束:id 全局唯一且稳定;不要与已有条目重复(已有:Python+requests、Python+Scrapy、Node.js+axios+cheerio、Playwright、Selenium、Puppeteer、React、Vue、Next.js、HTML+CSS+JS、Node.js+Express、FastAPI、Flask、Django、Spring Boot、Go 后端、Rust 后端、NumPy+Pandas、SQL、Excel VBA、Shell 脚本、Python 脚本、CLI(Typer/Commander)、LangChain、LLM API 应用、Pygame、Godot、Electron、Tauri、C++ 算法、Python 算法)

**输出:** 只输出完整的 TypeScript 文件内容(含 `TECHSTACK_LIBRARY` 数组),可直接粘贴替换,不要任何解释。

## 校验清单(替换前人工/脚本检查)

- [ ] id 全局唯一、小写连字符
- [ ] 无重复条目(与上表已有条目)
- [ ] difficulty/environment/prerequisites 自洽
- [ ] tags 使用统一词汇表,无同义碎标签(如同时出现「爬虫」与「网络爬虫」)
- [ ] typicalProjects 每条 3 个、从小到大、具体可交付
- [ ] 类型检查:`npx tsc --noEmit` 通过

## 关联

- 库文件:`lib/techstack-library.ts`
- 选栈规则提示词:`docs/techstack-selection-prompt.md`(给更强 AI 校验/扩充库内容时的上下文)
