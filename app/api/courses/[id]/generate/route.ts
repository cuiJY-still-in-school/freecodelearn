import { NextResponse } from "next/server";
import { appendGeneratedChapters, generateChapter } from "@/lib/ai";
import { getCourse, saveCourse } from "@/lib/store";
import type { Chapter } from "@/lib/types";

// 内存防重入:同一课程只允许一个后台生成任务(单进程部署足够)
const generating = new Set<string>();

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (generating.has(id)) {
    return NextResponse.json({ status: "running", pending: null });
  }

  const course = await getCourse(id);
  if (!course) {
    return NextResponse.json({ error: "课程不存在" }, { status: 404 });
  }

  const outline = course.outline;
  const pending = course.pendingChapters ?? 0;
  if (!outline || pending <= 0) {
    return NextResponse.json({ status: "idle", pending: 0 });
  }

  generating.add(id);
  try {
    // 串行逐章生成(顺序:第 2 章、第 3 章...),每章完成立即落盘,页面轮询即可看到
    while ((course.pendingChapters ?? 0) > 0) {
      const idx = outline.chapters.length - (course.pendingChapters ?? 0);
      if (idx < 0 || idx >= outline.chapters.length) break;
      const oc = outline.chapters[idx];
      try {
        const steps = await generateChapter(outline, idx);
        const chapter: Chapter = {
          id: `ch-${idx + 1}`,
          title: oc.title,
          description: oc.description || undefined,
          steps,
        };
        await appendGeneratedChapters(course, [chapter]);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "章节生成失败";
        course.generationError = `第 ${idx + 1} 章《${oc.title}》生成失败:${message}`;
        await saveCourse(course);
        return NextResponse.json(
          { status: "error", error: course.generationError },
          { status: 200 }
        );
      }
    }
    return NextResponse.json({
      status: "done",
      chapters: course.chapters.length,
    });
  } finally {
    generating.delete(id);
  }
}
