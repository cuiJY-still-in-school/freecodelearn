export type StepType = "lesson" | "challenge" | "quiz";

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface Step {
  id: string;
  title: string;
  type: StepType;
  bodyMarkdown?: string;
  starterCode?: string;
  solution?: string;
  tests?: string;
  html?: string;
  language?: string;
  questions?: QuizQuestion[];
  /** 种子代码(可编辑区之前的固定代码,freeCodeCamp --fcc-editable-region-- 模式) */
  seedBefore?: string;
  /** 种子代码(可编辑区之后的固定代码) */
  seedAfter?: string;
}

/** 编辑区标记,模仿 freeCodeCamp 的 --fcc-editable-region-- */
export const EDITABLE_MARK = "--fcc-editable-region--";

/** 从拼接内容中提取编辑区代码;无标记时回退为全文 */
export function extractEditableCode(full: string): string {
  const re = new RegExp(
    `\\s*${EDITABLE_MARK}\\s*([\\s\\S]*?)\\s*${EDITABLE_MARK}\\s*`
  );
  const m = full.match(re);
  return m ? m[1].trim() : full;
}

/** 把编辑区标记替换为当前语言上下文里的注释形式 */
export function sanitizeEditableMarks(full: string, inStyleOrScript: boolean): string {
  if (!full.includes(EDITABLE_MARK)) return full;
  const comment = inStyleOrScript ? "/* --fcc-editable-region-- */" : "<!-- --fcc-editable-region-- -->";
  return full.replaceAll(EDITABLE_MARK, comment);
}

/** 拼接种子代码:seedBefore + 标记 + starterCode + 标记 + seedAfter */
export function buildSeedCode(step: Step): string {
  const before = step.seedBefore ?? "";
  const after = step.seedAfter ?? "";
  const mid = step.starterCode ?? "";
  if (!before && !after) return mid;
  return `${before}\n${EDITABLE_MARK}\n${mid}\n${EDITABLE_MARK}\n${after}`;
}

export interface Chapter {
  id: string;
  title: string;
  description?: string;
  steps: Step[];
}

/** 大纲中的单个步骤(确认阶段与生成阶段共用) */
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
  /** 终端练习白名单扩展/禁用(仅命令行类课程,AI 按课程需要声明) */
  allowedCommands?: string[];
  blockedCommands?: string[];
}

export interface Course {
  id: string;
  title: string;
  description: string;
  topic: string;
  level: "beginner" | "intermediate" | "advanced";
  language: string;
  estimatedMinutes: number;
  createdAt: string;
  chapters: Chapter[];
  /** 终端练习白名单扩展(课程声明的额外命令,AI 按课程需要生成) */
  allowedCommands?: string[];
  /** 终端练习白名单禁用(课程声明的不允许执行命令) */
  blockedCommands?: string[];
  /** 尚未生成的章节数(渐进生成中):>0 时大纲已保存在 outline 字段,供后台逐章生成 */
  pendingChapters?: number;
  /** 后台生成失败信息(用户可重试),生成成功后清空 */
  generationError?: string;
  /** 课程大纲(仅渐进生成中保留,全部生成完成后移除,减小文件体积) */
  outline?: CourseOutline;
}

export function flattenSteps(course: Course): { chapter: Chapter; step: Step }[] {
  const out: { chapter: Chapter; step: Step }[] = [];
  for (const chapter of course.chapters) {
    for (const step of chapter.steps) {
      out.push({ chapter, step });
    }
  }
  return out;
}

export function countSteps(course: Course): number {
  return course.chapters.reduce((acc, c) => acc + c.steps.length, 0);
}

export function firstStepId(course: Course): string {
  const flat = flattenSteps(course);
  return flat.length ? flat[0].step.id : "";
}

export function nextStepId(course: Course, stepId: string): string | null {
  const flat = flattenSteps(course);
  const idx = flat.findIndex((s) => s.step.id === stepId);
  if (idx === -1 || idx === flat.length - 1) return null;
  return flat[idx + 1].step.id;
}

export function prevStepId(course: Course, stepId: string): string | null {
  const flat = flattenSteps(course);
  const idx = flat.findIndex((s) => s.step.id === stepId);
  if (idx <= 0) return null;
  return flat[idx - 1].step.id;
}

export function findStep(course: Course, stepId: string): Step | null {
  for (const chapter of course.chapters) {
    const found = chapter.steps.find((s) => s.id === stepId);
    if (found) return found;
  }
  return null;
}
