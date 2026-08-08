import { narrateDesign } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const params = {
    topic: String(body.topic ?? "").slice(0, 120),
    techStack: Array.isArray(body.techStack) ? body.techStack.map(String) : [],
    goal: String(body.goal ?? "").slice(0, 300),
  };
  if (!params.topic.trim()) {
    return new Response(JSON.stringify({ error: "缺少主题" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await narrateDesign(params, (text) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
          );
        });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch (e) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              error: e instanceof Error ? e.message : "设计说明生成失败",
            })}\n\n`
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
