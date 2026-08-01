import { NextResponse } from "next/server";
import { generateChapter } from "@/lib/ai";
import type { CourseOutline } from "@/lib/ai";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const outline = body.outline as CourseOutline;
    const chapterIndex = Number(body.chapterIndex);
    if (!outline?.chapters?.[chapterIndex]) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }
    const steps = await generateChapter(outline, chapterIndex);
    return NextResponse.json({ steps });
  } catch (e) {
    const message = e instanceof Error ? e.message : "章节生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
