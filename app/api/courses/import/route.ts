import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { saveCourse } from "@/lib/store";
import type { Course } from "@/lib/types";

export async function POST(req: NextRequest) {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: "无效的 JSON" }, { status: 400 });
  }
  const c = data as Partial<Course>;
  if (
    !c ||
    typeof c.title !== "string" ||
    !Array.isArray(c.chapters) ||
    c.chapters.length === 0
  ) {
    return NextResponse.json(
      { error: "课程格式不正确:缺少 title 或 chapters" },
      { status: 400 }
    );
  }
  const course: Course = {
    id: randomUUID(),
    title: c.title,
    description: String(c.description ?? ""),
    topic: String(c.topic ?? c.title),
    level: ["beginner", "intermediate", "advanced"].includes(c.level as string)
      ? (c.level as Course["level"])
      : "beginner",
    language: String(c.language ?? ""),
    estimatedMinutes: Number(c.estimatedMinutes ?? 30) || 30,
    createdAt: new Date().toISOString(),
    chapters: c.chapters.map((ch, ci) => ({
      id: String(ch.id ?? `ch-${ci + 1}`),
      title: String(ch.title ?? `第 ${ci + 1} 章`),
      description: ch.description ? String(ch.description) : undefined,
      steps: Array.isArray(ch.steps)
        ? ch.steps.map((s, si) => ({
            ...s,
            id: String(s.id ?? `c${ci + 1}-s${si + 1}`),
          }))
        : [],
    })),
  };
  // 保留渐进生成的续传信息:生成中的课程导入后仍能后台补齐剩余章节
  if (c.outline && Array.isArray(c.chapters)) {
    course.outline = c.outline as Course["outline"];
    course.pendingChapters = Math.max(
      0,
      Number(c.pendingChapters ?? 0)
    );
    if (c.generationError) course.generationError = c.generationError;
  }
  if (Array.isArray(c.allowedCommands)) course.allowedCommands = c.allowedCommands;
  if (Array.isArray(c.blockedCommands)) course.blockedCommands = c.blockedCommands;
  await saveCourse(course);
  return NextResponse.json({ id: course.id });
}
