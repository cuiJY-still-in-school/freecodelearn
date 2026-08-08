import { NextResponse } from "next/server";
import { generateOutline } from "@/lib/ai";

export async function POST(req: Request) {
  try {
    const input = await req.json();
    if (!input?.topic?.trim()) {
      return NextResponse.json({ error: "请填写课程主题" }, { status: 400 });
    }
    // 服务端限长:参考文档过大影响 AI 请求且易超时
    if (
      typeof input.referenceDoc === "string" &&
      input.referenceDoc.length > 50_000
    ) {
      input.referenceDoc = input.referenceDoc.slice(0, 50_000);
    }
    const outline = await generateOutline(input);
    return NextResponse.json(outline);
  } catch (e) {
    const message = e instanceof Error ? e.message : "大纲生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
