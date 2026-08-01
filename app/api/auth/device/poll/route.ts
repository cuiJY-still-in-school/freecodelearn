import { NextRequest, NextResponse } from "next/server";
import { getGithubSettings, pollAccessToken } from "@/lib/github";
import { loginWithToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { deviceCode } = await req.json().catch(() => ({}));
  if (!deviceCode) {
    return NextResponse.json({ error: "缺少 deviceCode" }, { status: 400 });
  }
  const { clientId } = await getGithubSettings();
  if (!clientId) {
    return NextResponse.json({ error: "未配置 GitHub Client ID" }, { status: 400 });
  }
  const result = await pollAccessToken(clientId, deviceCode);
  if (!result.ok) {
    if (result.error === "slow_down") {
      return NextResponse.json({ ok: false, slowDown: true });
    }
    if (result.error === "access_denied" || result.error === "expired_token") {
      return NextResponse.json({
        ok: false,
        failed: true,
        message:
          result.error === "access_denied"
            ? "授权已被拒绝"
            : "授权码已过期,请重新发起登录",
      });
    }
    return NextResponse.json({ ok: false });
  }
  try {
    const user = await loginWithToken(result.accessToken!);
    return NextResponse.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, failed: true, message: err instanceof Error ? err.message : "登录失败" },
      { status: 500 }
    );
  }
}

function publicUser(u: { id: string; login: string; name: string; avatar: string }) {
  return { id: u.id, login: u.login, name: u.name, avatar: u.avatar };
}
