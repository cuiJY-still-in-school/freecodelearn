import { NextResponse } from "next/server";
import { researchTopic } from "@/lib/ai";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const topic = String(body.topic ?? "").trim();
    if (!topic) {
      return NextResponse.json({ error: "缺少主题" }, { status: 400 });
    }
    const goal = body.goal ? String(body.goal).trim().slice(0, 500) : undefined;
    const notes = await researchTopic(topic, goal);
    return NextResponse.json({ notes });
  } catch (err) {
    console.error("research error:", err);
    // 检索失败不阻塞生成流程
    return NextResponse.json({ notes: "" });
  }
}
