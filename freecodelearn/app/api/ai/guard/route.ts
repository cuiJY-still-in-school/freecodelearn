import { NextResponse } from "next/server";
import { guardTopic } from "@/lib/ai";

export async function POST(req: Request) {
  const body = await req.json();
  const topic = String(body.topic ?? "").trim();
  if (!topic) {
    return NextResponse.json({ error: "缺少主题" }, { status: 400 });
  }
  try {
    const result = await guardTopic(topic);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "主题校验失败" },
      { status: 500 }
    );
  }
}
