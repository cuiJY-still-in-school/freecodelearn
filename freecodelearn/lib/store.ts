import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Course } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const COURSES_DIR = path.join(DATA_DIR, "courses");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

export interface AISettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface CourseMeta {
  id: string;
  title: string;
  description: string;
  topic: string;
  level: Course["level"];
  language: string;
  estimatedMinutes: number;
  createdAt: string;
  stepCount: number;
  chapterCount: number;
}

async function ensureDirs() {
  await fs.mkdir(COURSES_DIR, { recursive: true });
}

export async function listCourses(): Promise<CourseMeta[]> {
  await ensureDirs();
  const files = await fs.readdir(COURSES_DIR);
  const metas: CourseMeta[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const course = JSON.parse(
        await fs.readFile(path.join(COURSES_DIR, f), "utf8")
      ) as Course;
      metas.push(toMeta(course));
    } catch {
      // skip corrupt files
    }
  }
  return metas.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCourse(id: string): Promise<Course | null> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(
      path.join(COURSES_DIR, `${safeId(id)}.json`),
      "utf8"
    );
    return JSON.parse(raw) as Course;
  } catch {
    return null;
  }
}

export async function saveCourse(course: Course): Promise<void> {
  await ensureDirs();
  await fs.writeFile(
    path.join(COURSES_DIR, `${safeId(course.id)}.json`),
    JSON.stringify(course, null, 2),
    "utf8"
  );
}

export async function deleteCourse(id: string): Promise<void> {
  await ensureDirs();
  await fs.rm(path.join(COURSES_DIR, `${safeId(id)}.json`), { force: true });
}

export function newCourseId(): string {
  return randomUUID();
}

export async function saveSettings(settings: AISettings): Promise<void> {
  await ensureDirs();
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf8");
}

export async function getSettings(): Promise<AISettings | null> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf8");
    return JSON.parse(raw) as AISettings;
  } catch {
    const env = {
      baseUrl: process.env.AI_BASE_URL ?? "",
      apiKey: process.env.AI_API_KEY ?? "",
      model: process.env.AI_MODEL ?? "",
    };
    return env.baseUrl || env.apiKey || env.model ? env : null;
  }
}

export function toMeta(course: Course): CourseMeta {
  const stepCount = course.chapters.reduce((a, c) => a + c.steps.length, 0);
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    topic: course.topic,
    level: course.level,
    language: course.language,
    estimatedMinutes: course.estimatedMinutes,
    createdAt: course.createdAt,
    stepCount,
    chapterCount: course.chapters.length,
  };
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}
