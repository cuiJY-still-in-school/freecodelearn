import { NextResponse } from "next/server";
import { generateOutline } from "@/lib/ai";
import { getTechStack } from "@/lib/techstack-library";

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
    // 对话阶段选定的技术栈:按 id 从库中查出完整条目,约束大纲设计
    if (typeof input.techStackId === "string" && input.techStackId.trim()) {
      const entry = getTechStack(input.techStackId.trim());
      if (entry) input.techStack = entry;
    }
    delete input.techStackId;
    const outline = await generateOutline(input);
    return NextResponse.json(outline);
  } catch (e) {
    const message = e instanceof Error ? e.message : "大纲生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
