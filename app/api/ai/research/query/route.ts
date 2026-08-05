import { NextResponse } from "next/server";
import { researchQuery } from "@/lib/ai";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const q = String(body.q ?? "").trim();
    if (!q) {
      return NextResponse.json({ text: "" });
    }
    const sites = Array.isArray(body.sites)
      ? body.sites.map((s: unknown) => String(s)).slice(0, 4)
      : [];
    const text = await researchQuery(q, sites);
    return NextResponse.json({ text });
  } catch (err) {
    console.error("research query error:", err);
    return NextResponse.json({ text: "" });
  }
}
