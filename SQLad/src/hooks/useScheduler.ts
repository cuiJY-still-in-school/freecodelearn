import { useEffect, useRef } from "react";
import { api } from "../api/client";
import type { ChatMessage, ProviderInfo, ToolCall, Trigger } from "../api/types";

/** Run one trigger end-to-end: evaluate the condition; if it returns rows,
 *  ask the AI to do `action_prompt` with the matched rows injected as
 *  `matched_rows` JSON. Tool calls are dispatched against the backend.
 *  Frontend-only tools (set_view / save_view / ...) are *not* available
 *  here — those need an active table context — so the action should be
 *  expressed in terms of backend tools (query / create_table / insert_rows /
 *  fetch_url). */
export async function runTriggerOnce(trigger: Trigger): Promise<void> {
  try {
    const result = await api.evaluateTrigger(trigger.id);
    if (result.row_count === 0) {
      await api.markTrigger(trigger.id, "no_change", 0);
      return;
    }
    const providers: ProviderInfo[] = await api.listAiProviders();
    const active = providers.find((p) => p.is_default);
    if (!active) {
      await api.markTrigger(
        trigger.id,
        "error",
        result.row_count,
        "没有配置 AI Provider"
      );
      return;
    }
    const matched = result.rows.map((r) => {
      const obj: Record<string, unknown> = {};
      result.columns.forEach((c, i) => (obj[c] = r[i]));
      return obj;
    });
    const tools = await api.listTools();
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "你是 SQLad 的自动化工人。一个用户定义的触发器命中了，下面给你它的 action 描述和 matched_rows。" +
          "用提供的后端工具（query / create_table / insert_rows / fetch_url / list_tables）完成 action，不要请求确认，直接做。" +
          "完成后用一句话总结你做了什么。",
      },
      {
        role: "user",
        content:
          `Trigger: ${trigger.name}\n\n` +
          `Action:\n${trigger.action_prompt}\n\n` +
          `matched_rows (${matched.length}):\n${JSON.stringify(matched, null, 2)}`,
      },
    ];
    let working = [...messages];
    for (let round = 0; round < 5; round++) {
      const reply = await api.chat(
        { messages: working, tools, temperature: 0.2 },
        active.id
      );
      const msg = reply.message;
      working = [...working, msg];
      const calls: ToolCall[] = msg.tool_calls ?? [];
      if (calls.length === 0) break;
      for (const call of calls) {
        try {
          const out = await api.invokeTool(call.name, call.arguments);
          working = [
            ...working,
            {
              role: "tool",
              content: JSON.stringify(out ?? { ok: true }),
              tool_call_id: call.id,
            },
          ];
        } catch (e) {
          working = [
            ...working,
            {
              role: "tool",
              content: JSON.stringify({
                error: e instanceof Error ? e.message : String(e),
              }),
              tool_call_id: call.id,
            },
          ];
        }
      }
    }
    await api.markTrigger(trigger.id, "fired", result.row_count);
  } catch (e) {
    await api.markTrigger(
      trigger.id,
      "error",
      undefined,
      e instanceof Error ? e.message : String(e)
    );
    throw e;
  }
}

/** Mount this once at app root: scans triggers every 15s and runs any whose
 *  interval_secs has elapsed since their last run. */
export function useScheduler() {
  const running = useRef<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (cancelled) return;
      try {
        const triggers = await api.listTriggers();
        const now = Math.floor(Date.now() / 1000);
        for (const t of triggers) {
          if (!t.enabled || t.interval_secs <= 0) continue;
          if (running.current.has(t.id)) continue;
          const last = t.last_run_at ?? 0;
          if (now - last < t.interval_secs) continue;
          running.current.add(t.id);
          void runTriggerOnce(t).finally(() =>
            running.current.delete(t.id)
          );
        }
      } catch {
        /* ignore scheduler errors */
      }
    }
    const id = window.setInterval(tick, 15_000);
    // Run once shortly after mount so users see activity without waiting 15s.
    const first = window.setTimeout(tick, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.clearTimeout(first);
    };
  }, []);
}
