import { NextResponse } from "next/server";
import { listCourses, deleteCourse, renameCourse } from "@/lib/store";

export async function GET() {
  const courses = await listCourses();
  return NextResponse.json(courses);
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  await deleteCourse(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const { id, title } = await req.json();
  if (!id || typeof title !== "string")
    return NextResponse.json({ error: "缺少 id 或 title" }, { status: 400 });
  const course = await renameCourse(id, title);
  if (!course)
    return NextResponse.json({ error: "课程不存在" }, { status: 404 });
  return NextResponse.json({ ok: true, course });
}
