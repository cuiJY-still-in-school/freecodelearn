import { NextResponse } from "next/server";
import { chatTest } from "@/lib/ai";

export async function POST() {
  const started = Date.now();
  try {
    const content = await chatTest();
    return NextResponse.json({
      ok: true,
      ms: Date.now() - started,
      preview: content.slice(0, 120),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, ms: Date.now() - started, error: err instanceof Error ? err.message : "连接失败" },
      { status: 500 }
    );
  }
}
