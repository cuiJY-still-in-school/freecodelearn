import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/store";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(settings ?? { baseUrl: "", apiKey: "", model: "" });
}

export async function POST(req: Request) {
  const body = await req.json();
  const settings = {
    baseUrl: String(body.baseUrl ?? "").trim(),
    apiKey: String(body.apiKey ?? "").trim(),
    model: String(body.model ?? "").trim(),
  };
  if (!settings.apiKey) {
    return NextResponse.json({ error: "apiKey 不能为空" }, { status: 400 });
  }
  await saveSettings(settings);
  return NextResponse.json({ ok: true });
}
