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
}

export interface Chapter {
  id: string;
  title: string;
  description?: string;
  steps: Step[];
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
