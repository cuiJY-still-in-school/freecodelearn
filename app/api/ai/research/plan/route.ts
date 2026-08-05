import { NextResponse } from "next/server";
import { researchPlan } from "@/lib/ai";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const topic = String(body.topic ?? "").trim();
    if (!topic) {
      return NextResponse.json({ error: "缺少主题" }, { status: 400 });
    }
    const goal = body.goal ? String(body.goal).trim().slice(0, 500) : undefined;
    const { queries, sites } = await researchPlan(topic, goal);
    return NextResponse.json({ queries, sites });
  } catch (err) {
    console.error("research plan error:", err);
    return NextResponse.json({ queries: [], sites: [] });
  }
}
