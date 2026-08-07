import { NextResponse } from "next/server";
import { assembleCourse } from "@/lib/ai";
import type { CourseOutline } from "@/lib/types";
import type { Step } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const outline = body.outline as CourseOutline;
    const chapters = body.chapters as Step[][];
    if (!outline?.chapters?.length || !Array.isArray(chapters)) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }
    const course = await assembleCourse(outline, chapters);
    return NextResponse.json(course);
  } catch (e) {
    const message = e instanceof Error ? e.message : "课程保存失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
