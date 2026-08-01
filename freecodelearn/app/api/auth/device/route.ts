import { NextResponse } from "next/server";
import { getGithubSettings, requestDeviceCode } from "@/lib/github";

export async function POST() {
  const { clientId } = await getGithubSettings();
  if (!clientId) {
    return NextResponse.json(
      { error: "未配置 GitHub Client ID,请先在「设置」页填写" },
      { status: 400 }
    );
  }
  try {
    const info = await requestDeviceCode(clientId);
    return NextResponse.json({
      userCode: info.user_code,
      verificationUri: info.verification_uri,
      deviceCode: info.device_code,
      interval: Math.max(5, info.interval ?? 5),
      expiresIn: info.expires_in,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "设备授权失败" },
      { status: 500 }
    );
  }
}
