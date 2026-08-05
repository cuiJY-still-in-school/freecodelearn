import type { Chapter, Course, Step } from "./types";
import { getSettings, newCourseId, saveCourse } from "./store";

export interface GenerateInput {
  topic: string;
  level: Course["level"];
  /** 兼容字段:已不再强制,由 AI 根据目标自定章节数 */
  chapters?: number;
  description?: string;
  /** 学习目标:想达到什么水平,AI 据此决定章节数 */
  goal?: string;
/** 联网检索到的资料摘要(researchPlan + researchQuery 组合生成) */
  researchNotes?: string;
  /** 用户上传的参考文档全文(用于定制课程内容) */
  referenceDoc?: string;
  /** 参考已有课程的结构摘要(用于风格/结构定制) */
  referenceCourse?: string;
}

export interface OutlineStep {
  title: string;
  type: "lesson" | "challenge" | "quiz";
  brief: string;
}

export interface OutlineChapter {
  title: string;
  description: string;
  steps: OutlineStep[];
}

export interface CourseOutline {
  title: string;
  description: string;
  topic: string;
  level: Course["level"];
  language: string;
  estimatedMinutes: number;
  chapters: OutlineChapter[];
  /** 参考文档全文(透传给章节生成) */
  referenceDoc?: string;
  /** 联网检索到的资料摘要(透传给章节生成) */
  researchNotes?: string;
}

const SYSTEM_PROMPT = `你是课程设计专家,擅长设计 freeCodeCamp 风格的循序渐进编程课程。`;

const OUTLINE_TASK = `根据用户输入设计课程大纲,输出严格的 JSON(不要任何多余文字,不要 markdown 代码块)。

JSON 结构:
{
  "title": "课程标题(简洁有力)",
  "description": "一两句课程简介(面向学习者,写清楚学完能获得什么)",
  "topic": "主题",
  "level": "beginner|intermediate|advanced",
  "language": "根据主题推断的编程语言或工具语言(JavaScript、Python、HTML/CSS、SQL、Shell、Go 等;命令行/工具类主题必须用其命令语言如 Shell/Git,不要写「无代码」;仅纯概念主题才可用「无代码」)",
  "estimatedMinutes": 预计学习总分钟数,
  "chapters": [
    {
      "title": "章节标题",
      "description": "本章目标:学习者学完这章能做什么、项目进展到哪一步(一句话,写结果不写过程)",
      "steps": [
        { "title": "步骤标题", "type": "lesson|challenge|quiz", "brief": "该步骤要讲的核心内容与精确改动点,2-3 句,供内容生成阶段使用" }
      ]
    }
  ]
}

设计规则(模仿 freeCodeCamp 真实课程,如「Learn HTML by Building a Cat Photo App」):
1. 课程必须是一个贯穿始终的真实项目:比如「用 HTML/CSS 做一张咖啡菜单页」「用 Python 写一个猜数字游戏」「用 JavaScript 做一个待办清单」。标题直接叫「用 X 做 Y」,不要写「入门」「教程」等词
2. 章节 = 项目的构建阶段,像连续剧:第 1 章搭骨架并给出最小可用版本,中间章逐层加功能,最后一章打磨完善并做综合测验。每章结束项目必须处于「可运行、能看到成果」的状态
3. 循序渐进:每章 3-5 个步骤,先 lesson 讲概念(结合项目讲),再 challenge 动手练,quiz 放在每章末尾
4. 总步骤数 10-16 个;lesson 约占一半,challenge 3-5 个,quiz 每章 1 个
5. 挑战要小步渐进:像 freeCodeCamp 的 step 系列,每个挑战只引入一个新概念、只改一处小地方(如「给 h1 加一个 class」「给数组排序并赋值」),绝不要一个大挑战塞三个知识点
6. challenge 步骤的 brief 必须写清楚:改哪里、改成什么(精确到元素/函数/值),让内容作者无需再猜
7. 每章 quiz 考察「理解」而非「记忆」:用新的小例子检验概念是否真懂(如把本章讲的语法换个场景提问)
8. 章节数由你根据「学习目标」与主题复杂度自定(3-10 章):目标宏大、内容面广则 5-10 章;入门小目标则 3-4 章;不注水,每章都要有明确的构建成果
9. 用户提供「学习目标」时,课程围绕目标设计:学完能做什么、覆盖哪些关键技能;目标决定章节数与步骤

参考资料(必须遵守):
- 如果提供了「参考文档」:课程内容必须取材自该文档(文档的技术栈、术语、示例、工作流),大纲先覆盖文档核心内容再扩展
- 如果提供了「参考课程」:新课程应模仿其项目式结构、步骤粒度与风格,但主题按用户输入,不得照搬参考课程内容
- 如果提供了「联网检索资料」:大纲必须覆盖资料中的核心知识点、常用工具与最佳实践,确保课程内容具体、不过时、不空洞`;

const CHAPTER_TASK = `你是课程内容作者。根据大纲中的一章,撰写完整的课程内容,输出严格的 JSON(不要任何多余文字,不要 markdown 代码块)。

教学法(模仿 freeCodeCamp 真实课程,如 Learn HTML by Building a Cat Photo App):
1. 课程是一个真实项目,挑战是渐进的小步:每个挑战只引入一个新概念,让学习者只改一处小地方
2. 描述写法遵循 freeCodeCamp 三步式:① 过渡句衔接上下文(「Now you're ready to start adding content to the page.」式的承上启下,简短一句);② 概念讲解 1-2 句,术语用反引号或加粗(如 HTML 中的 src 属性);③ 精确操作指令:改哪个元素/函数、写什么、值是什么(URL、文本、数值都给全,不让学习者猜)
3. 挑战用「种子代码」模式:seedBefore(编辑区前的固定代码)+ starterCode(编辑区初始内容)+ seedAfter(编辑区后的固定代码)。种子代码提供完整可运行的结构骨架(如 <!DOCTYPE html>、html/head/body 外壳),编辑区只包住要改的那一小段;学习者只改编辑区。编辑区标记由系统自动添加,不要在字段里写
4. 判题用 freeCodeCamp hint 风格(见 tests 约定)

JSON 结构(单个对象,包含该章所有步骤):
{
  "steps": [
    {
      "type": "lesson|challenge|quiz",
      "bodyMarkdown": "图文讲解(markdown)。lesson:过渡句 + 概念讲解(配代码示例)+ 小结;challenge:过渡句 + 概念 + 精确指令",
      "seedBefore": "仅 challenge:编辑区之前的固定代码(完整骨架,如 <!DOCTYPE html>...<body>;无骨架时省略)",
      "starterCode": "仅 challenge:编辑区初始内容(学习者要改的部分;无种子代码时则是完整初始代码,含 TODO 注释)",
      "seedAfter": "仅 challenge:编辑区之后的固定代码(如 </body></html>;无则省略)",
      "solution": "仅 challenge:编辑区的完整参考解答(只含编辑区部分,不含种子代码)",
      "tests": "仅 challenge:判题测试(见下方约定)",
      "html": "仅 challenge 且语言为 CSS:测试页面的 DOM 结构(如 <div class=\"container\"></div>)",
      "questions": "仅 quiz:选择题数组(3-5 题)"
    }
  ]
}

quiz questions 格式:
[{"question": "题干", "options": ["选项A","选项B","选项C"], "correctIndex": 0, "explanation": "解析(简短,指出为什么对/错)"}]

quiz 规则:
- 每章末尾的 quiz 必须有 3-5 题,严禁生成空 questions
- 考察理解:题目用与讲解不同的新例子,选项区分「听懂了」与「只记住例子」的人
- 同一题内选项必须互不相同;不同题目之间的选项文字也不得完全重复
- correctIndex 必须在 options 下标范围内,正确答案唯一
- explanation 要说明正确选项为什么对,以及常见错误选项错在哪

challenge tests 约定(运行在浏览器沙箱中,测试内可用):
- code:编辑区代码字符串(适合正则/包含检查:标签小写、元素数量、是否用了某个语法)
- document:页面渲染后的 DOM(适合检查元素存在、文本、嵌套、顺序、样式)
- __fcl_input:仅非代码语言(Shell/Git/SQL 等),用户输入全文
- 测试写法模仿 freeCodeCamp hints 的「由宽到严」结构,按下列顺序组织:
  ① 存在性:元素/函数/关键词存在(如 assert.exists / document.querySelector('h1'))
  ② 结构性:数量正确(如 querySelectorAll('h1').length === 1,防学习者写了多个)、嵌套正确(父元素正确)、顺序正确(在另一个元素之后)
  ③ 值检查(宽松):文本小写化后匹配(如 textContent.trim().toLowerCase() === 'catphotoapp',允许大小写差异)
  ④ 值检查(严格):精确匹配(大小写敏感),让学习者注意大小写
  ⑤ 规范性/细节:引号包裹、空格位置等最佳实践(如 assert.notMatch 检查属性值没有不带引号)
- 每个 hint 的失败信息必须像 freeCodeCamp 一样写「人话 + 细节提示」:指出可能的原因(「你可能拼写有误」「注意大小写」「确保元素名和属性名之间有空格」),而不是只报断言失败
- 语言为 HTML 的挑战:编辑区是 HTML 代码,渲染后可用 document 断言;同时用 code 正则断言(小写、闭合、引号)。例如:
  test("h2 标签应为小写", () => { assert.notMatch(code, /<\\/?H2>/); });
  test("存在 h2", () => { assert(document.querySelector("h2")); });
  test("h2 文本为 猫照片(宽松)", () => { assert(document.querySelector("h2").innerText.trim().toLowerCase() === "猫照片"); });
  test("h2 文本精确为 猫照片", () => { assert(document.querySelector("h2").innerText.trim() === "猫照片"); });
  test("h2 在 h1 下方", () => { const order=[...document.querySelectorAll("h1,h2")].map(n=>n.tagName); assert(order.indexOf("H1") < order.indexOf("H2")); });
  test("h1 未被改坏", () => { assert(document.querySelector("h1").innerText.trim() === "猫照片应用"); });
  test("只有一个 h1", () => { assert(document.querySelectorAll("h1").length === 1); });
- 语言为 CSS 的挑战:编辑区是 CSS,会作为 <style> 注入;必须提供 html(测试用 DOM);用 document.querySelector 和 getComputedStyle 断言
- 语言为 JavaScript 的挑战:编辑区代码自动执行,直接调用用户函数;覆盖正常情况和边界情况(空数组、负数、0 等);加防破坏断言(题目要求保留的其他函数/逻辑仍然存在)
- 其他语言(Shell/Git/SQL/命令工具等):用户输入在 __fcl_input 中,用字符串断言,例如:
  test("包含 git init", () => { assert(__fcl_input.includes("git init"), "应包含 git init 命令"); });
- 每个挑战至少 4 个测试,每个测试只检查一件事;失败信息用中文人话;不要依赖未导入的外部库

写作要求:
1. 严格遵循大纲中该章步骤的 title/type/brief,顺序一致,不要增删步骤
2. bodyMarkdown 用简体中文,讲解要具体、有示例,循序渐进;术语第一次出现时给出简短解释
3. 所有语言的 challenge 都必须提供 starterCode、solution、tests;HTML 挑战按需给 seedBefore/seedAfter(要检查结构完整性时必给),CSS 挑战必须给 html
4. 若有「参考文档」:讲解与示例取材于参考文档的技术栈与术语,保持一致性
5. 只输出 JSON,不要多余文字`;

async function chat(
  userPrompt: string,
  json: boolean
): Promise<string> {
  const settings = await getSettings();
  if (!settings || !settings.apiKey) {
    throw new Error(
      "未配置 AI 服务。请先在「设置」页填写 provider / baseUrl / apiKey / model,或设置环境变量 AI_BASE_URL、AI_API_KEY、AI_MODEL"
    );
  }

  const baseUrl = (settings.baseUrl || "https://api.openai.com/v1").replace(
    /\/+$/,
    ""
  );
  const method = settings.parseMethod ?? "openai";

  if (method === "anthropic") {
    const response = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
        ...(json ? { "anthropic-beta": "json-20250507" } : {}),
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 8192,
        temperature: 0.7,
        system: json
          ? `${SYSTEM_PROMPT}\n\n严格输出 JSON,不要任何多余文字或 markdown 代码块。`
          : SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI 服务请求失败 (${response.status}): ${text.slice(0, 300)}`);
    }
    const data = await response.json();
    const content: string =
      (Array.isArray(data?.content)
        ? data.content
            .map((b: { text?: string }) => b?.text ?? "")
            .join("")
        : "") ?? "";
    if (!content) throw new Error("AI 返回为空,请检查模型配置");
    return content;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI 服务请求失败 (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("AI 返回为空,请检查模型配置");
  return content;
}

function parseJSON(content: string): Record<string, unknown> {
  const cleaned = content
    .replace(/^```(?:json)?/m, "")
    .replace(/```\s*$/m, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("AI 输出无法解析为 JSON");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

/* ---------- 连接测试 ---------- */

export async function chatTest(): Promise<string> {
  const content = await chat("只回复两个字:正常。不要其他任何内容。", false);
  if (!content) throw new Error("AI 返回为空");
  return content;
}

/* ---------- 主题相关度把关 ---------- */

const GUARD_TASK = `你是产品审核员。判断用户输入的主题是否适合作为「编程/技术学习课程」的主题,输出严格 JSON(不要任何多余文字):
{"relevant": true 或 false, "reason": "一句话说明原因(中文)"}

判断标准:
- 相关(返回 true):编程语言、框架、前端/后端开发、算法、数据结构、数据库、网络、操作系统、命令行/Shell、Git、信息安全、AI 技术、网页设计(HTML/CSS)、软件工具使用等一切计算机技术学习内容
- 无关(返回 false):烹饪美食、旅游攻略、健身运动、音乐绘画、商业管理、心理情感、生活常识等与计算机编程无关的内容
- 边缘情况自行判断:不确定时偏向相关,reason 如实说明

用户主题:`;

export async function guardTopic(
  topic: string
): Promise<{ relevant: boolean; reason: string }> {
  try {
    const content = await chat(`${GUARD_TASK}${topic}`, true);
    const raw = parseJSON(content);
    return {
      relevant: raw.relevant !== false,
      reason: raw.reason ? String(raw.reason) : "",
    };
  } catch {
    // 把关失败不阻塞生成流程
    return { relevant: true, reason: "" };
  }
}

/* ---------- 联网检索资料(准备阶段) ---------- */

/** 当前日期(含星期),用于让 AI 感知时效性 */
function todayStr(): string {
  const d = new Date();
  const w = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}(${w})`;
}

/** 学习者操作系统与终端(命令行/Shell 类课程必须贴合该平台) */
function platformStr(): string {
  switch (process.platform) {
    case "win32":
      return "Windows(终端为 PowerShell 或 cmd)";
    case "darwin":
      return "macOS(终端为 zsh)";
    default:
      return "Linux(终端为 bash)";
  }
}

/** 系统参数:日期、时区、语言、学习者系统环境、用途,注入所有生成阶段提示词 */
const systemContext = () =>
  `【系统参数】
- 当前日期:${todayStr()}(请据此判断资料与信息的时效性)
- 系统时区:${Intl.DateTimeFormat().resolvedOptions().timeZone}
- 学习者操作系统:${platformStr()}
- 语言:简体中文
- 用途:为学习者在「FreeCodeLearn」生成 freeCodeCamp 风格的编程课程

命令行/Shell 类课程必须使用学习者操作系统真实可用的命令与语法(Windows 用 PowerShell/cmd,Linux/macOS 用 bash/zsh),提示中给出的练习命令须能在该平台直接执行;禁止出现跨平台不兼容的命令拼写。`;

const RESEARCH_PLAN_TASK = `你是资料检索策划。请根据下面的课程主题,规划需要联网查询的知识点与目标网站,输出严格 JSON(不要任何多余文字):
{"queries": ["查询词1", "查询词2", ...], "sites": ["权威域名1", "权威域名2", ...]}

规则:
- 3-5 个查询词,覆盖:① 核心概念 ② 常用工具/库 ③ 典型用法或最佳实践 ④ 进阶内容
- 查询词要具体、可检索(如「Python collections Counter 用法」「Git 工作区 暂存区 区别」),不要空泛(如「python 教程」)
- 中文为主,术语可用英文
- sites:2-4 个你认为对该主题最权威、内容最新、最值得采信的网站域名(如 docs.python.org、developer.mozilla.org、stackoverflow.com、learn.microsoft.com、www.w3schools.com 等,按主题选择,不要带 https:// 前缀)
- 检索时将优先从这些网站获取资料,查不到才回退通用搜索

课程主题:`;

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&ensp;|&#0183;|&nbsp;/g, " ")
    .replace(/&#\d+;/g, "");
}

async function bingSearch(query: string, count = 3): Promise<string> {
  try {
    const res = await fetch(
      `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${count}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return "";
    const html = await res.text();
    const items: string[] = [];
    for (const m of html.matchAll(/<li class="b_algo"[\s\S]*?<\/li>/g)) {
      const block = m[0];
      const titleM = block.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/);
      const snipM = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
      const title = titleM ? decodeEntities(stripHtml(titleM[1])).trim() : "";
      const snip = snipM ? decodeEntities(stripHtml(snipM[1])).trim() : "";
      if (title) items.push(snip ? `${title}: ${snip}` : title);
      if (items.length >= count) break;
    }
    return items.join("\n");
  } catch {
    return "";
  }
}

/** 在课程准备阶段联网检索资料:AI 制定查询计划与目标网站 → 优先站内检索、回退通用搜索 → 汇总摘要(失败返回空,不阻塞) */
export async function researchPlan(
  topic: string,
  goal?: string
): Promise<{ queries: string[]; sites: string[] }> {
  try {
    const content = await chat(
      `${systemContext()}\n\n${RESEARCH_PLAN_TASK}\n${topic}${
        goal ? `\n学习目标:${goal}` : ""
      }`,
      true
    );
    const raw = parseJSON(content);
    const queries = (Array.isArray(raw.queries) ? raw.queries : [])
      .map((q) => String(q).trim())
      .filter(Boolean)
      .slice(0, 5);
    // AI 自行选择的目标网站(校验为合法域名)
    const sites = (Array.isArray(raw.sites) ? raw.sites : [])
      .map((s) => String(s).trim().replace(/^https?:\/\//, ""))
      .filter((s) => /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(s))
      .slice(0, 4);
    return { queries, sites };
  } catch {
    return { queries: [], sites: [] };
  }
}

export async function researchQuery(
  q: string,
  sites: string[]
): Promise<string> {
  try {
    // ① 优先从 AI 指定的网站站内检索(可多站依次尝试,取第一个有结果的)
    for (const site of sites) {
      const r = await bingSearch(`site:${site} ${q}`);
      if (r) return r;
    }
    // ② 站内无结果 → 回退通用搜索
    return (await bingSearch(q)) ?? "";
  } catch {
    return "";
  }
}

/* ---------- 大纲生成 ---------- */

export async function generateOutline(input: GenerateInput): Promise<CourseOutline> {
  const refDoc = (input.referenceDoc ?? "").slice(0, 30000);
  const researchNotes = (input.researchNotes ?? "").slice(0, 30000);
  const userPrompt = `${systemContext()}\n\n请设计课程大纲。\n主题:${input.topic}\n难度:${input.level}${
    input.goal ? `\n学习目标:${input.goal}` : ""
  }${input.description ? `\n补充说明:${input.description}` : ""}${
    refDoc
      ? `\n\n参考文档(课程内容必须取材于此,术语/示例/工作流保持一致):\n"""\n${refDoc}\n"""`
      : ""
  }${
    input.referenceCourse
      ? `\n\n参考课程(模仿其项目式结构与步骤粒度,但内容按本主题原创):\n"""\n${input.referenceCourse}\n"""`
      : ""
  }${
    researchNotes
      ? `\n\n联网检索资料(覆盖其中的核心知识点、常用工具与最佳实践;资料检索于 ${todayStr()},注意时效性):\n"""\n${researchNotes}\n"""`
      : ""
  }\n\n${OUTLINE_TASK}`;

  const content = await chat(userPrompt, true);
  const raw = parseJSON(content);

  const chapters: OutlineChapter[] = (Array.isArray(raw.chapters) ? raw.chapters : [])
    .map((c, ci) => {
      const ch = c as Record<string, unknown>;
      const steps: OutlineStep[] = (Array.isArray(ch.steps) ? ch.steps : []).map(
        (s) => {
          const st = s as Record<string, unknown>;
          const type = String(st.type ?? "lesson");
          return {
            title: String(st.title ?? `步骤 ${steps.length + 1}`),
            type: (["lesson", "challenge", "quiz"].includes(type)
              ? type
              : "lesson") as OutlineStep["type"],
            brief: st.brief ? String(st.brief) : "",
          };
        }
      );
      return {
        title: String(ch.title ?? `第 ${ci + 1} 章`),
        description: ch.description ? String(ch.description) : "",
        steps,
      };
    })
    .filter((c) => c.steps.length > 0);

  if (chapters.length === 0) {
    throw new Error("AI 输出中没有有效章节,请重试");
  }

  return {
    title: String(raw.title ?? input.topic),
    description: String(raw.description ?? `关于${input.topic}的课程`),
    topic: input.topic,
    level: input.level,
    language: String(raw.language ?? "JavaScript"),
    estimatedMinutes: Number(raw.estimatedMinutes ?? 30) || 30,
    chapters,
    referenceDoc: refDoc || undefined,
    researchNotes: researchNotes || undefined,
  };
}

/* ---------- 单章内容生成 ---------- */

const TEST_TASK = `你是测试工程师。为下面的代码挑战编写自动判题测试,输出严格 JSON(不要任何多余文字):
{"tests": "JavaScript 测试代码", "html": "CSS 语言时提供的测试 DOM 结构,其他语言为空字符串"}

测试约定(运行在浏览器沙箱中,模仿 freeCodeCamp hints 的写法):
- test(name, fn) 定义测试,fn 内用 assert(condition, message);每个测试只检查一件事
- 可用变量:code(编辑区代码字符串,可正则断言)、document(渲染后 DOM)、__fcl_input(非代码语言全文)
- 每个测试的失败信息必须写「人话 + 细节提示」(如「你可能拼写有误」「注意大小写」「确保元素名和属性名之间有空格」),像 freeCodeCamp 的 hint 一样指出可能原因
- 断言按「由宽到严」组织:① 存在性 → ② 结构性(数量/嵌套/顺序)→ ③ 值宽松(小写化匹配)→ ④ 值严格(大小写敏感)→ ⑤ 规范性(引号/空格)
- HTML 语言:编辑区是 HTML,用 document 断言 + code 正则断言(小写、闭合、引号);数量断言防重复(如 h1 只能有一个)
- CSS 语言:用户 CSS 注入为 <style>;html 必须包含测试引用的所有元素;用 document.querySelector + getComputedStyle
- JS 语言:用户代码自动执行,直接调用函数;覆盖正常与边界情况(空数组、负数、0);加防破坏断言(题目要求保留的原有函数/逻辑仍在)
- 其他语言(Shell/Git/SQL):用 __fcl_input.includes(...) 断言;可加 notInclude 防学习者多写多余内容
- 至少 4 个测试;测试名字用中文简要描述检查点
- 只输出 JSON`;

/** 从 AI 输出中提取 tests 字符串:可能是字符串,也可能是结构化数组/对象 */
function extractTests(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v
      .map((item) => {
        if (typeof item === "string") return item;
        const o = (item ?? {}) as Record<string, unknown>;
        return String(o.test ?? o.code ?? o.assert ?? "");
      })
      .filter(Boolean)
      .join("\n");
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return String(o.test ?? o.code ?? o.assert ?? "");
  }
  return "";
}

/** 判断 tests 是否是可执行的判题代码(含 test() 或 assert 调用) */
function testsUsable(tests?: string): boolean {
  return Boolean(tests && /test\s*\(|assert\.|__fcl_input|document\.querySelector/.test(tests));
}

async function generateTests(step: Step): Promise<void> {
  const userPrompt = `题目:${step.title}\n语言:${step.language}\n\n题目说明:\n${
    step.bodyMarkdown?.slice(0, 800) ?? ""
  }\n\n种子代码(编辑区前):\n${
    step.seedBefore ?? "(无)"
  }\n\n编辑区初始内容:\n${step.starterCode ?? ""}\n\n种子代码(编辑区后):\n${
    step.seedAfter ?? "(无)"
  }\n\n参考解答:\n${step.solution ?? ""}\n\n${TEST_TASK}`;
  const content = await chat(userPrompt, true);
  const raw = parseJSON(content);
  const tests = extractTests(raw.tests);
  if (tests) step.tests = tests;
  if (raw.html) step.html = String(raw.html);
}

export async function generateChapter(
  outline: CourseOutline,
  chapterIndex: number
): Promise<Step[]> {
  const chapter = outline.chapters[chapterIndex];
  if (!chapter) throw new Error("章节不存在");

  const userPrompt = `${systemContext()}\n\n课程信息:\n标题:${outline.title}\n语言:${outline.language}\n难度:${outline.level}\n\n本章标题:${chapter.title}\n本章简介:${chapter.description}\n\n本章步骤(必须全部覆盖,顺序一致):\n${chapter.steps
    .map((s, i) => `${i + 1}. [${s.type}] ${s.title}\n   brief: ${s.brief}`)
    .join("\n")}${
    outline.referenceDoc
      ? `\n\n参考文档(讲解与示例取材于此,术语/示例保持一致):\n"""\n${outline.referenceDoc}\n"""`
      : ""
  }${
    outline.researchNotes
      ? `\n\n联网检索资料(讲解可取材其中,术语与做法保持一致;检索于 ${todayStr()}):\n"""\n${outline.researchNotes.slice(
          0,
          30000
        )}\n"""`
      : ""
  }\n\n请生成本章全部步骤内容。${CHAPTER_TASK}`;

  const content = await chat(userPrompt, true);
  const raw = parseJSON(content);
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];

  const steps = chapter.steps.map((os, i) => {
    const rs = (rawSteps[i] ?? {}) as Record<string, unknown>;
    const type = os.type;
    const step: Step = {
      id: `c${chapterIndex + 1}-s${i + 1}`,
      title: os.title,
      type,
      bodyMarkdown: rs.bodyMarkdown ? String(rs.bodyMarkdown) : undefined,
      language: outline.language,
    };
    if (type === "challenge") {
      step.starterCode = rs.starterCode ? String(rs.starterCode) : undefined;
      step.solution = rs.solution ? String(rs.solution) : undefined;
      const tests = extractTests(rs.tests);
      step.tests = tests || undefined;
      step.html = rs.html ? String(rs.html) : undefined;
      step.seedBefore = rs.seedBefore ? String(rs.seedBefore) : undefined;
      step.seedAfter = rs.seedAfter ? String(rs.seedAfter) : undefined;
    }
    if (type === "quiz" && Array.isArray(rs.questions)) {
      step.questions = rs.questions.map((q) => {
        const qu = q as Record<string, unknown>;
        return {
          question: String(qu.question ?? ""),
          options: Array.isArray(qu.options) ? qu.options.map((o) => String(o)) : [],
          correctIndex: Number(qu.correctIndex ?? 0),
          explanation: qu.explanation ? String(qu.explanation) : undefined,
        };
      });
    }
    return step;
  });

  // 为所有缺测试或测试不可执行的挑战补自动判题(JS/CSS/HTML 用代码模式,其他语言用 __fcl_input 文本断言)
  const challenges = steps.filter(
    (s) => s.type === "challenge" && !testsUsable(s.tests)
  );
  await Promise.all(
    challenges.map(async (s) => {
      try {
        await generateTests(s);
        if (!testsUsable(s.tests)) s.tests = undefined;
      } catch {
        // 测试生成失败则降级:无自动判题,保留查看解答
        s.tests = undefined;
      }
    })
  );
  // 补全缺失的 starterCode / solution(保证学习页体验完整)
  const incomplete = steps.filter(
    (s) =>
      s.type === "challenge" &&
      (!s.starterCode || !s.solution)
  );
  if (incomplete.length > 0) {
    await Promise.all(
      incomplete.map(async (s) => {
        try {
          const content = await chat(
            `题目:${s.title}\n语言:${s.language}\n\n题目说明:\n${
              s.bodyMarkdown?.slice(0, 800) ?? ""
            }\n\n现有内容:\nstarterCode:\n${
              s.starterCode ?? "(无)"
            }\nsolution:\n${s.solution ?? "(无)"}\n\n请补全缺失部分,输出严格 JSON(不要任何多余文字):\n{"starterCode": "初始代码,含 TODO 注释(若已有则原样返回)", "solution": "完整参考解答(若已有则原样返回)"}`,
            true
          );
          const raw = parseJSON(content);
          if (!s.starterCode && raw.starterCode)
            s.starterCode = String(raw.starterCode);
          if (!s.solution && raw.solution) s.solution = String(raw.solution);
        } catch {
          // 补全失败不影响主流程
        }
      })
    );
  }

  return steps;
}

/* ---------- 追加章节 ---------- */

const APPEND_TASK = `你是课程内容作者。为已有课程追加一个全新的章节,输出严格 JSON(不要任何多余文字)。

教学法与课程生成完全一致:课程是真实项目,挑战是渐进小步,用种子代码(seedBefore/starterCode/seedAfter)保护结构;描述用「过渡句 + 概念 + 精确指令」三步式;测试用 freeCodeCamp hint 风格(每个测试只查一件事,失败信息写人话+细节提示,含防破坏断言,断言由宽到严)。

JSON 结构:
{"steps": [步骤数组,格式与单章生成完全一致(见下方说明)]}

步骤格式与生成规则(与单章生成相同):
- lesson:{"type":"lesson","bodyMarkdown":"图文讲解(markdown),过渡句衔接课程进度,先讲概念再给示例,术语第一次出现给出解释"}
- challenge:{"type":"challenge","bodyMarkdown":"过渡句+概念讲解+精确指令","seedBefore":"编辑区前固定代码(可选)","starterCode":"编辑区初始内容","seedAfter":"编辑区后固定代码(可选)","solution":"编辑区完整参考解答","tests":"判题测试","html":"仅 CSS 语言需要(测试 DOM)"}
- quiz:{"type":"quiz","questions":[{"question":"题干","options":["A","B","C"],"correctIndex":0,"explanation":"解析"}]}(3-5 题,考察理解用新例子,选项互不重复,correctIndex 在范围内)

challenge tests 约定(运行在浏览器沙箱):
- 可用变量:code(编辑区代码,可正则断言)、document(渲染后 DOM)、__fcl_input(非代码语言全文)
- 断言由宽到严:存在性 → 结构性(数量/嵌套/顺序)→ 值宽松 → 值严格(大小写)→ 规范性(引号/空格)
- 失败信息写人话+细节提示(拼写/大小写/空格等可能原因)
- HTML 语言:编辑区是 HTML,用 document 断言 + code 断言(小写、闭合、引号),数量断言防重复
- CSS 语言:编辑区是 CSS 注入为 <style>,html 提供测试 DOM,用 getComputedStyle 断言
- JS 语言:编辑区代码自动执行,直接调用函数,覆盖边界情况,加防破坏断言
- 其他语言(Shell/Git/SQL):用 __fcl_input.includes(...) 断言,可加 notInclude 防多余内容
- 每个挑战至少 4 个测试,每个测试只查一件事,含防破坏断言
- 每个挑战必须同时提供 starterCode、solution、tests;quiz 必须有 questions
- bodyMarkdown 用简体中文,循序渐进,与课程既有风格一致
- 只输出 JSON,不要多余文字`;

export async function appendChapter(
  course: Pick<Course, "title" | "language" | "level" | "description">,
  chapterTitle: string
): Promise<Step[]> {
  const existing = course.description ? `\n课程简介:${course.description}` : "";
  const userPrompt = `${systemContext()}\n\n课程标题:${course.title}${existing}
课程语言:${course.language}
课程难度:${course.level}

请追加新章节「${chapterTitle}」,包含 3-5 个步骤(lesson + challenge + quiz 混合,quiz 放最后)。\n\n${APPEND_TASK}`;

  const content = await chat(userPrompt, true);
  const raw = parseJSON(content);
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];
  if (rawSteps.length === 0) throw new Error("AI 没有返回有效步骤");

  const steps: Step[] = rawSteps.map((rs, i) => {
    const r = rs as Record<string, unknown>;
    const type = ["lesson", "challenge", "quiz"].includes(String(r.type))
      ? (String(r.type) as Step["type"])
      : "lesson";
    const step: Step = {
      id: `append-${i + 1}`,
      title: String(r.title ?? `步骤 ${i + 1}`),
      type,
      bodyMarkdown: r.bodyMarkdown ? String(r.bodyMarkdown) : undefined,
      language: course.language,
    };
    if (type === "challenge") {
      step.starterCode = r.starterCode ? String(r.starterCode) : undefined;
      step.solution = r.solution ? String(r.solution) : undefined;
      const tests = extractTests(r.tests);
      step.tests = tests || undefined;
      step.html = r.html ? String(r.html) : undefined;
      step.seedBefore = r.seedBefore ? String(r.seedBefore) : undefined;
      step.seedAfter = r.seedAfter ? String(r.seedAfter) : undefined;
    }
    if (type === "quiz" && Array.isArray(r.questions)) {
      step.questions = r.questions.map((q) => {
        const qu = q as Record<string, unknown>;
        return {
          question: String(qu.question ?? ""),
          options: Array.isArray(qu.options) ? qu.options.map((o) => String(o)) : [],
          correctIndex: Number(qu.correctIndex ?? 0),
          explanation: qu.explanation ? String(qu.explanation) : undefined,
        };
      });
    }
    return step;
  });

  // 补测试与 starter/solution(跳过描述性无效测试)
  const challenges = steps.filter(
    (s) => s.type === "challenge" && !testsUsable(s.tests)
  );
  await Promise.all(
    challenges.map(async (s) => {
      try {
        await generateTests(s);
        if (!testsUsable(s.tests)) s.tests = undefined;
      } catch {
        s.tests = undefined;
      }
    })
  );
  return sanitizeSteps(steps);
}

/* ---------- 组装保存 ---------- */

export async function assembleCourse(
  outline: CourseOutline,
  chapters: Step[][]
): Promise<Course> {
  const course: Course = {
    id: newCourseId(),
    title: outline.title,
    description: outline.description,
    topic: outline.topic,
    level: outline.level,
    language: outline.language,
    estimatedMinutes: outline.estimatedMinutes,
    createdAt: new Date().toISOString(),
    chapters: outline.chapters.map((oc, i): Chapter => {
      let steps = chapters[i];
      if (!steps || steps.length === 0) {
        throw new Error(`第 ${i + 1} 章内容缺失`);
      }
      steps = sanitizeSteps(steps);
      return {
        id: `ch-${i + 1}`,
        title: oc.title,
        description: oc.description || undefined,
        steps,
      };
    }),
  };
  await saveCourse(course);
  return course;
}

function sanitizeSteps(steps: Step[]): Step[] {
  return steps
    .filter((s) => {
      if (s.type === "quiz") {
        const valid = (s.questions ?? []).filter(
          (q) =>
            q.question &&
            Array.isArray(q.options) &&
            q.options.length >= 2 &&
            q.correctIndex >= 0 &&
            q.correctIndex < q.options.length
        );
        s.questions = valid;
        return valid.length > 0;
      }
      if (s.type === "lesson" && !s.bodyMarkdown) {
        s.bodyMarkdown = `# ${s.title}\n\n本章内容暂缺,请直接标记为已完成继续。`;
      }
      return true;
    })
    .map((s) => s);
}
