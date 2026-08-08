import { NextResponse } from "next/server";
import { chatTest } from "@/lib/ai";

// 测试表单当前配置(未保存也生效),不读已保存设置
export async function POST(req: Request) {
  const started = Date.now();
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // 无请求体时退回已保存配置
  }
  try {
    const content = await chatTest({
      provider: typeof body.provider === "string" ? body.provider : undefined,
      baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
      model: typeof body.model === "string" ? body.model : undefined,
      parseMethod:
        body.parseMethod === "anthropic" ? "anthropic" : "openai",
    });
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
