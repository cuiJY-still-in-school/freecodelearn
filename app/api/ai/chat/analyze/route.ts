import { NextResponse } from "next/server";
import { analyzeChat, type ChatTurn } from "@/lib/ai";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter(
        (m: ChatTurn) =>
          m && ["user", "assistant"].includes(m.role) && typeof m.content === "string"
      )
      .slice(-30) as ChatTurn[];
    if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
      return NextResponse.json({ error: "请先描述你想学什么" }, { status: 400 });
    }
    const referenceDoc =
      typeof body.referenceDoc === "string" ? body.referenceDoc.slice(0, 50_000) : undefined;
    const courseList = Array.isArray(body.courseList) ? body.courseList : undefined;
    const result = await analyzeChat(messages, { referenceDoc, courseList });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "需求分析失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
