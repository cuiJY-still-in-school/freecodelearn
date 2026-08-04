import type { Chapter, Course, Step } from "./types";
import { getSettings, newCourseId, saveCourse } from "./store";

export interface GenerateInput {
  topic: string;
  level: Course["level"];
  chapters?: number;
  description?: string;
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
      "description": "章节简介(一两句)",
      "steps": [
        { "title": "步骤标题", "type": "lesson|challenge|quiz", "brief": "该步骤要讲的核心内容,2-3 句,供内容生成阶段使用" }
      ]
    }
  ]
}

设计规则:
1. 课程必须是一个贯穿始终的真实项目(像 freeCodeCamp 的「Learn HTML by Building a Cat Photo App」):比如「用 HTML/CSS 做一张咖啡菜单页」「用 Python 写一个猜数字游戏」「用 JavaScript 做一个待办清单」。不要在标题里写「入门」「教程」等词,直接叫「用 X 做 Y」
2. 章节 = 项目的构建阶段:第 1 章搭骨架,中间章逐层加功能,最后一章完善并做综合测验
3. 循序渐进:每章 3-5 个步骤,先 lesson 讲概念(结合项目讲),再 challenge 动手练,quiz 放在每章末尾
4. 总步骤数 10-16 个;lesson 约占一半,challenge 3-5 个,quiz 每章 1 个
5. 挑战要小步渐进:像 freeCodeCamp 的 step 系列,每个挑战只引入一个新概念、只改一处小地方(如「给 h1 加一个 class」),不要一个大挑战塞三个知识点
6. challenge 步骤的 brief 中写明:改哪里、改什么(精确到元素/函数/值)
7. 章节数按用户指定的数字(1-12),内容适度即可,不要注水`;

const CHAPTER_TASK = `你是课程内容作者。根据大纲中的一章,撰写完整的课程内容,输出严格的 JSON(不要任何多余文字,不要 markdown 代码块)。

教学法(模仿 freeCodeCamp 真实课程,如 Learn HTML by Building a Cat Photo App):
1. 课程是一个真实项目,挑战是渐进的小步:每个挑战只引入一个新概念,让学习者只改一处小地方
2. 讲解用 freeCodeCamp 风格:先 1-2 句讲清概念(配示例),再给精确的操作指令(改哪里、写什么、值是什么)
3. 挑战用「种子代码」模式:seedBefore(编辑区前的固定代码)+ starterCode(编辑区初始内容)+ seedAfter(编辑区后的固定代码)。学习者只改编辑区;种子代码保证页面/程序结构完整,防止改坏。编辑区标记由系统自动添加,不要在字段里写
4. 判题用 freeCodeCamp hint 风格:4-8 个测试,每个测试只检查一件事;包含「防破坏」断言(检查原有的内容/元素仍然存在)

JSON 结构(单个对象,包含该章所有步骤):
{
  "steps": [
    {
      "type": "lesson|challenge|quiz",
      "bodyMarkdown": "图文讲解(markdown)。lesson:先讲概念,给代码示例,再小结。challenge:概念讲解 + 精确指令",
      "seedBefore": "仅 challenge:编辑区之前的固定代码(HTML 如 <html><body>,CSS/JS 如公共常量;无则省略)",
      "starterCode": "仅 challenge:编辑区初始内容(学习者要改的部分;无种子代码时则是完整初始代码,含 TODO 注释)",
      "seedAfter": "仅 challenge:编辑区之后的固定代码(HTML 如 </body></html>;无则省略)",
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
- 同一题内选项必须互不相同;不同题目之间的选项文字也不得完全重复(如多题共用 flex-start/stretch 时,请换用其他干扰项)
- correctIndex 必须在 options 下标范围内,正确答案唯一

challenge tests 约定(运行在浏览器沙箱中,测试内可用):
- code:编辑区代码字符串(适合正则/包含检查:标签小写、元素数量、是否用了某个语法)
- document:页面渲染后的 DOM(适合检查元素存在、文本、嵌套、顺序、样式)
- __fcl_input:仅非代码语言(Shell/Git/SQL 等),用户输入全文
- 语言为 HTML 的挑战:编辑区是 HTML 代码,渲染后可用 document 断言;例如:
  test("h2 标签应为小写", () => { assert.notMatch(code, /<\\/?H2>/); });
  test("存在 h2", () => { assert(document.querySelector("h2")); });
  test("h2 文本为 猫照片", () => { assert(document.querySelector("h2").innerText.trim() === "猫照片"); });
  test("h2 在 h1 下方", () => { const order=[...document.querySelectorAll("h1,h2")].map(n=>n.tagName); assert(order.indexOf("H1") < order.indexOf("H2")); });
  test("h1 未被改坏", () => { assert(document.querySelector("h1").innerText.trim() === "猫照片应用"); });
- 语言为 CSS 的挑战:编辑区是 CSS,会作为 <style> 注入;必须提供 html(测试用 DOM);用 document.querySelector 和 getComputedStyle 断言
- 语言为 JavaScript 的挑战:编辑区代码自动执行,直接调用用户函数;覆盖正常情况和边界情况(空数组、负数、0 等)
- 其他语言(Shell/Git/SQL/命令工具等):用户输入在 __fcl_input 中,用字符串断言,例如:
  test("包含 git init", () => { assert(__fcl_input.includes("git init"), "应包含 git init 命令"); });
- 每个挑战至少 4 个测试,每个测试只检查一件事;包含防破坏断言;不要依赖未导入的外部库

写作要求:
1. 严格遵循大纲中该章步骤的 title/type/brief,顺序一致,不要增删步骤
2. bodyMarkdown 用简体中文,讲解要具体、有示例,循序渐进
3. 所有语言的 challenge 都必须提供 starterCode、solution、tests;HTML 挑战按需给 seedBefore/seedAfter(要检查结构完整性时必给),CSS 挑战必须给 html
4. 只输出 JSON,不要多余文字`;

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

/* ---------- 大纲生成 ---------- */

export async function generateOutline(input: GenerateInput): Promise<CourseOutline> {
  const userPrompt = `请设计课程大纲。\n主题:${input.topic}\n难度:${input.level}${
    input.chapters ? `\n章节数:${input.chapters}` : ""
  }${
    input.description ? `\n补充说明:${input.description}` : ""
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
  };
}

/* ---------- 单章内容生成 ---------- */

const TEST_TASK = `你是测试工程师。为下面的代码挑战编写自动判题测试,输出严格 JSON(不要任何多余文字):
{"tests": "JavaScript 测试代码", "html": "CSS 语言时提供的测试 DOM 结构,其他语言为空字符串"}

测试约定(运行在浏览器沙箱中):
- test(name, fn) 定义测试,fn 内用 assert(condition, message);每个测试只检查一件事
- 可用变量:code(编辑区代码字符串,可正则断言)、document(渲染后 DOM)、__fcl_input(非代码语言全文)
- HTML 语言:编辑区是 HTML,用 document 断言 + code 正则断言(小写、数量、顺序)
- CSS 语言:用户 CSS 注入为 <style>;html 必须包含测试引用的所有元素;用 document.querySelector + getComputedStyle
- JS 语言:用户代码自动执行,直接调用函数;覆盖正常与边界情况(空数组、负数、0)
- 其他语言(Shell/Git/SQL):用 __fcl_input.includes(...) 断言
- 至少 3 个测试;包含防破坏断言(题目要求保留的原有内容仍然存在)
- 只输出 JSON`;

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
  if (raw.tests) step.tests = String(raw.tests);
  if (raw.html) step.html = String(raw.html);
}

export async function generateChapter(
  outline: CourseOutline,
  chapterIndex: number
): Promise<Step[]> {
  const chapter = outline.chapters[chapterIndex];
  if (!chapter) throw new Error("章节不存在");

  const userPrompt = `课程信息:\n标题:${outline.title}\n语言:${outline.language}\n难度:${outline.level}\n\n本章标题:${chapter.title}\n本章简介:${chapter.description}\n\n本章步骤(必须全部覆盖,顺序一致):\n${chapter.steps
    .map((s, i) => `${i + 1}. [${s.type}] ${s.title}\n   brief: ${s.brief}`)
    .join("\n")}\n\n请生成本章全部步骤内容。${CHAPTER_TASK}`;

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
      step.tests = rs.tests ? String(rs.tests) : undefined;
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

  // 为所有缺测试的挑战补充自动判题(JS/CSS/HTML 用代码模式,其他语言用 __fcl_input 文本断言)
  const challenges = steps.filter(
    (s) => s.type === "challenge" && !s.tests
  );
  await Promise.all(
    challenges.map(async (s) => {
      try {
        await generateTests(s);
      } catch {
        // 测试生成失败则降级:无自动判题,保留查看解答
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

教学法与课程生成完全一致:课程是真实项目,挑战是渐进小步,用种子代码(seedBefore/starterCode/seedAfter)保护结构,测试用 freeCodeCamp hint 风格(每个测试只查一件事,含防破坏断言)。

JSON 结构:
{"steps": [步骤数组,格式与单章生成完全一致(见下方说明)]}

步骤格式与生成规则(与单章生成相同):
- lesson:{"type":"lesson","bodyMarkdown":"图文讲解(markdown),先讲概念再给示例"}
- challenge:{"type":"challenge","bodyMarkdown":"概念讲解+精确指令","seedBefore":"编辑区前固定代码(可选)","starterCode":"编辑区初始内容","seedAfter":"编辑区后固定代码(可选)","solution":"编辑区完整参考解答","tests":"判题测试","html":"仅 CSS 语言需要(测试 DOM)"}
- quiz:{"type":"quiz","questions":[{"question":"题干","options":["A","B","C"],"correctIndex":0,"explanation":"解析"}]}(3-5 题,选项互不重复,correctIndex 在范围内)

challenge tests 约定(运行在浏览器沙箱):
- 可用变量:code(编辑区代码,可正则断言)、document(渲染后 DOM)、__fcl_input(非代码语言全文)
- HTML 语言:编辑区是 HTML,用 document 断言 + code 断言(小写、数量、顺序)
- CSS 语言:编辑区是 CSS 注入为 <style>,html 提供测试 DOM,用 getComputedStyle 断言
- JS 语言:编辑区代码自动执行,直接调用函数,覆盖边界情况
- 其他语言(Shell/Git/SQL):用 __fcl_input.includes(...) 断言
- 每个挑战至少 4 个测试,每个测试只查一件事,含防破坏断言
- 每个挑战必须同时提供 starterCode、solution、tests;quiz 必须有 questions
- bodyMarkdown 用简体中文,循序渐进,与课程既有风格一致
- 只输出 JSON,不要多余文字`;

export async function appendChapter(
  course: Pick<Course, "title" | "language" | "level" | "description">,
  chapterTitle: string
): Promise<Step[]> {
  const existing = course.description ? `\n课程简介:${course.description}` : "";
  const userPrompt = `课程标题:${course.title}${existing}
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
      step.tests = r.tests ? String(r.tests) : undefined;
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

  // 补测试与 starter/solution
  const challenges = steps.filter((s) => s.type === "challenge" && !s.tests);
  await Promise.all(
    challenges.map(async (s) => {
      try {
        await generateTests(s);
      } catch {
        // 忽略
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
