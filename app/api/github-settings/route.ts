import { NextRequest, NextResponse } from "next/server";
import { getGithubSettings, saveGithubSettings } from "@/lib/github";

export async function GET() {
  const { clientId, repoName } = await getGithubSettings();
  return NextResponse.json({ clientId, repoName });
}

export async function POST(req: NextRequest) {
  const { clientId, repoName } = await req.json().catch(() => ({}));
  if (typeof clientId !== "string" || typeof repoName !== "string") {
    return NextResponse.json({ error: "参数不完整" }, { status: 400 });
  }
  await saveGithubSettings({
    clientId: clientId.trim(),
    repoName: repoName.trim() || "freecodelearn-courses",
  });
  return NextResponse.json({ ok: true });
}
