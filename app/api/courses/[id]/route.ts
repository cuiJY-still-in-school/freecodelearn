import { NextResponse } from "next/server";
import { getCourse } from "@/lib/store";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const course = await getCourse(id);
  if (!course) return NextResponse.json({ error: "课程不存在" }, { status: 404 });
  return NextResponse.json(course);
}
