import { NextResponse } from "next/server";
import { getSettings, saveSettings, type ParseMethod } from "@/lib/store";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(
    settings ?? { provider: "", baseUrl: "", apiKey: "", model: "", parseMethod: "openai" }
  );
}

export async function POST(req: Request) {
  const body = await req.json();
  const parseMethod: ParseMethod = body.parseMethod === "anthropic" ? "anthropic" : "openai";
  const settings = {
    provider: String(body.provider ?? "自定义").trim() || "自定义",
    baseUrl: String(body.baseUrl ?? "").trim(),
    apiKey: String(body.apiKey ?? "").trim(),
    model: String(body.model ?? "").trim(),
    parseMethod,
  };
  if (!settings.apiKey) {
    return NextResponse.json({ error: "apiKey 不能为空" }, { status: 400 });
  }
  await saveSettings(settings);
  return NextResponse.json({ ok: true });
}
