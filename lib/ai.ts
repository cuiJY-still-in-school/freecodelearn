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
1. 循序渐进:每章 3-5 个步骤,先 lesson 讲概念,再 challenge 动手练,quiz 放在每章末尾
2. 总步骤数 10-16 个;lesson 约占一半,challenge 3-5 个,quiz 每章 1 个
3. 最后一章包含一个综合 quiz
4. challenge 步骤的 brief 中写明:函数签名、输入输出要求、边界情况(如空数组)
5. 章节数按用户指定的数字(1-12),内容适度即可,不要注水`;

const CHAPTER_TASK = `你是课程内容作者。根据大纲中的一章,撰写完整的课程内容,输出严格的 JSON。

JSON 结构(单个对象,包含该章所有步骤):
{
  "steps": [
    {
      "type": "lesson|challenge|quiz",
      "bodyMarkdown": "图文讲解(markdown)。lesson:按大纲 brief 讲解,像 freeCodeCamp:先讲概念,给代码示例,再小结。challenge:写清题目要求、函数签名、示例输入输出、提示。quiz 可留空",
      "starterCode": "仅 challenge 且语言为 JavaScript/CSS/HTML:初始代码,含 TODO 注释",
      "solution": "仅 challenge:完整参考解答",
      "tests": "仅 challenge 且语言为 JavaScript/CSS/HTML:测试代码,必须使用下面约定的 test/assert 辅助函数",
      "html": "仅 challenge 且测试需要 DOM 元素:测试用到的 HTML 结构(如 <div class=\"container\">...</div>)。CSS/HTML 语言的挑战必须提供",
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

challenge tests 约定(JavaScript,运行在浏览器沙箱中):
- test(name, fn) 定义测试,fn 内用 assert(condition, message)
- 语言为 JavaScript:用户代码在测试前自动执行,直接调用用户定义的函数
- 语言为 CSS/HTML 的挑战【必须】同时提供 tests 和 html 两个字段(自动判题):
  * html:测试页面的 DOM 结构,如 <div class="container">...</div>
  * tests:用户代码会作为 <style> 注入,测试用 document.querySelector 和 getComputedStyle 断言,例如:
    test("display 属性为 flex", () => {
      const el = document.querySelector(".container");
      assert(getComputedStyle(el).display === "flex", "display 应该为 flex");
    });
- 其他语言(Shell/Git/SQL/命令工具等)的挑战也必须有 tests:用户输入作为字符串保存在 __fcl_input 中,测试用字符串断言,例如:
  test("包含 git init", () => {
    assert(__fcl_input.includes("git init"), "应包含 git init 命令");
  });
- 必须覆盖正常情况和边界情况(空数组、负数、0 等),至少 2 个测试
- 不要依赖未导入的外部库

写作要求:
1. 严格遵循大纲中该章步骤的 title/type/brief,顺序一致,不要增删步骤
2. bodyMarkdown 用简体中文,讲解要具体、有示例,循序渐进
3. 所有语言的 challenge 都必须提供 starterCode(可编辑的初始内容,JS/CSS/HTML 为代码,其他语言为示例命令/文本)、solution(完整参考解答)、tests(按上面的约定);CSS/HTML 再加 html
4. 只输出 JSON,不要多余文字`;

async function chat(
  userPrompt: string,
  json: boolean
): Promise<string> {
  const settings = await getSettings();
  if (!settings || !settings.apiKey) {
    throw new Error(
      "未配置 AI 服务。请先在「设置」页填写 baseUrl / apiKey / model,或设置环境变量 AI_BASE_URL、AI_API_KEY、AI_MODEL"
    );
  }

  const baseUrl = (settings.baseUrl || "https://api.openai.com/v1").replace(
    /\/+$/,
    ""
  );
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
{"tests": "JavaScript 测试代码", "html": "CSS/HTML 语言时提供的测试 DOM 结构,其他语言为空字符串"}

测试约定(运行在浏览器沙箱中):
- test(name, fn) 定义测试,fn 内用 assert(condition, message)
- JS 语言:用户函数在测试前自动执行,直接调用
- CSS/HTML 语言:用户 CSS 会作为 <style> 注入;html 必须包含测试引用的所有元素;用 document.querySelector 和 getComputedStyle 断言
- 其他语言(Shell/Git/SQL 等):用户输入保存在 __fcl_input 字符串中,用 __fcl_input.includes(...) 等字符串断言,例如:
  test("包含 git init", () => { assert(__fcl_input.includes("git init"), "应包含 git init"); });
- 至少 2 个测试,覆盖正常情况和边界情况
- 只输出 JSON`;

async function generateTests(step: Step): Promise<void> {
  const userPrompt = `题目:${step.title}\n语言:${step.language}\n\n题目说明:\n${
    step.bodyMarkdown?.slice(0, 800) ?? ""
  }\n\n初始代码:\n${step.starterCode ?? ""}\n\n参考解答:\n${step.solution ?? ""}\n\n${TEST_TASK}`;
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

const APPEND_TASK = `你是课程内容作者。为已有课程追加一个全新的章节,输出严格 JSON。

JSON 结构:
{"steps": [步骤数组,格式与单章生成完全一致(见下方说明)]}

步骤格式与生成规则(与单章生成相同):
- lesson:{"type":"lesson","bodyMarkdown":"图文讲解(markdown)"}
- challenge:{"type":"challenge","bodyMarkdown":"题目要求","starterCode":"初始代码","solution":"完整参考解答","tests":"判题测试(约定:JS/CSS/HTML 用代码断言,CSS/HTML 必须有 html 字段;其他语言用户输入在 __fcl_input 中,用 __fcl_input.includes 断言)","html":"仅 CSS/HTML 需要"}
- quiz:{"type":"quiz","questions":[{"question":"题干","options":["A","B","C"],"correctIndex":0,"explanation":"解析"}]}(3-5 题,选项互不重复,correctIndex 在范围内)
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
