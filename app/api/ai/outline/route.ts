import { NextResponse } from "next/server";
import { generateOutline } from "@/lib/ai";

export async function POST(req: Request) {
  try {
    const input = await req.json();
    if (!input?.topic?.trim()) {
      return NextResponse.json({ error: "请填写课程主题" }, { status: 400 });
    }
    const outline = await generateOutline(input);
    return NextResponse.json(outline);
  } catch (e) {
    const message = e instanceof Error ? e.message : "大纲生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
