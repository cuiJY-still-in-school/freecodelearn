import { NextResponse } from "next/server";
import { reviseOutline, type ChatTurn } from "@/lib/ai";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter(
        (m: ChatTurn) =>
          m && ["user", "assistant"].includes(m.role) && typeof m.content === "string"
      )
      .slice(-30) as ChatTurn[];
    if (!body.currentOutline?.chapters?.length) {
      return NextResponse.json({ error: "缺少当前大纲" }, { status: 400 });
    }
    if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
      return NextResponse.json({ error: "缺少反馈" }, { status: 400 });
    }
    const input = {
      topic: String(body.currentOutline.topic ?? body.currentOutline.title ?? "课程"),
      level: body.currentOutline.level ?? "beginner",
      referenceDoc:
        typeof body.referenceDoc === "string" ? body.referenceDoc.slice(0, 50_000) : undefined,
      researchNotes:
        typeof body.researchNotes === "string"
          ? body.researchNotes.slice(0, 30_000)
          : undefined,
    };
    const outline = await reviseOutline(body.currentOutline, messages, input);
    return NextResponse.json(outline);
  } catch (e) {
    const message = e instanceof Error ? e.message : "大纲修订失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
