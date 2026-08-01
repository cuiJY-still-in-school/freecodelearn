import { NextRequest, NextResponse } from "next/server";
import { appendChapter } from "@/lib/ai";
import { getCourse, saveCourse } from "@/lib/store";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { title } = await req.json().catch(() => ({}));
  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "缺少章节标题" }, { status: 400 });
  }
  const course = await getCourse(id);
  if (!course) {
    return NextResponse.json({ error: "课程不存在" }, { status: 404 });
  }
  try {
    const steps = await appendChapter(course, title);
    const newChapter = {
      id: `ch-${course.chapters.length + 1}`,
      title,
      steps,
    };
    course.chapters.push(newChapter);
    await saveCourse(course);
    return NextResponse.json({ ok: true, chapter: newChapter });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "章节生成失败" },
      { status: 500 }
    );
  }
}
