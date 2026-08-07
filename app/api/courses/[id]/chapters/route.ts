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
  // 后台仍在逐章生成时禁止追加:追加章节 id 会与生成中的章节冲突
  if ((course.pendingChapters ?? 0) > 0) {
    return NextResponse.json(
      { error: "课程仍在后台生成,全部章节就绪后才能扩展" },
      { status: 409 }
    );
  }
  try {
    const steps = await appendChapter(course, title);
    const newChapter = {
      id: `ch-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
      title,
      steps,
    };
    course.chapters.push(newChapter);
    // 追加成功:清掉历史生成错误,课程时长随之增加
    delete course.generationError;
    course.estimatedMinutes = (course.estimatedMinutes ?? 30) + 15;
    await saveCourse(course);
    return NextResponse.json({ ok: true, chapter: newChapter });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "章节生成失败" },
      { status: 500 }
    );
  }
}
