import type { CourseOutline } from "./types";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AnalyzeResult {
  action: "ask" | "outline" | "reject";
  reason: string;
  question: string;
  suggestions: string[];
  topic: string;
  level: "beginner" | "intermediate" | "advanced";
  goal: string;
  extra: string;
  techStack: string[];
  refCourseId: string;
}

export async function analyzeChat(
  messages: ChatTurn[],
  opts: { referenceDoc?: string; courseList?: { id: string; title: string }[] } = {}
): Promise<AnalyzeResult> {
  const res = await fetch("/api/ai/chat/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      referenceDoc: opts.referenceDoc,
      courseList: opts.courseList,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "需求分析失败");
  return data as AnalyzeResult;
}

/** 流式读取设计说明(SSE),逐块回调文本 */
export async function narrateChat(
  params: { topic: string; techStack: string[]; goal: string },
  onChunk: (text: string) => void
): Promise<void> {
  const res = await fetch("/api/ai/chat/narrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "设计说明生成失败");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const evt of events) {
      for (const line of evt.split("\n")) {
        if (!line.startsWith("data:")) continue;
        let payload: { text?: string; done?: boolean; error?: string };
        try {
          payload = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }
        if (payload.error) throw new Error(payload.error);
        if (payload.text) onChunk(payload.text);
        if (payload.done) return;
      }
    }
  }
}

export async function reviseChat(
  messages: ChatTurn[],
  currentOutline: CourseOutline,
  opts: { referenceDoc?: string; researchNotes?: string } = {}
): Promise<CourseOutline> {
  const res = await fetch("/api/ai/chat/revise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      currentOutline,
      referenceDoc: opts.referenceDoc,
      researchNotes: opts.researchNotes,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "大纲修订失败");
  return data as CourseOutline;
}
