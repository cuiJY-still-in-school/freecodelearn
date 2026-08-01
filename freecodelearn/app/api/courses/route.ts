import { NextResponse } from "next/server";
import { listCourses, deleteCourse } from "@/lib/store";

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
