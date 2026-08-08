"use client";

import { useEffect, useRef, useState } from "react";
import type { CourseOutline } from "@/lib/types";
import OutlineCard from "./outline-card";
import {
  analyzeChat,
  narrateChat,
  reviseChat,
  type AnalyzeResult,
  type ChatTurn,
} from "@/lib/chat";

type ChatMessageInput =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; streaming?: boolean }
  | {
      role: "outline";
      outline: CourseOutline;
      params: AnalyzeResult;
      editable: boolean;
      busy: "idle" | "generating";
      error?: string;
    }
  | { role: "status"; content: string; kind: "progress" | "done" | "error" };

type ChatMessage = ChatMessageInput & { id: string };

let seq = 0;
const nextId = () => `m${Date.now()}-${seq++}`;

interface ChatGeneratorProps {
  courseList: { id: string; title: string }[];
  onCourseCreated: (id: string) => void;
}

const SNAP_KEY = "fcl-chat-snapshot";

interface Snapshot {
  messages: ChatMessage[];
  refDoc: { name: string; text: string } | null;
  researchNote: string;
}

export default function ChatGenerator({ courseList, onCourseCreated }: ChatGeneratorProps) {
  // 惰性初始化:挂载时一次性读取上次会话快照(生成中途离开页面后恢复)
  const [snap] = useState<Snapshot | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(SNAP_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as Snapshot;
      sessionStorage.removeItem(SNAP_KEY);
      return s;
    } catch {
      sessionStorage.removeItem(SNAP_KEY);
      return null;
    }
  });
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    snap
      ? (snap.messages ?? []).map((m) =>
          m.role === "outline" && m.busy === "generating"
            ? {
                ...m,
                busy: "idle" as const,
                editable: true,
                error: "第一章生成因切换页面而中断,请重新确认大纲",
              }
            : m
        )
      : []
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [chips, setChips] = useState<string[] | null>(null);
  const [refDoc, setRefDoc] = useState<{ name: string; text: string } | null>(
    () => snap?.refDoc ?? null
  );
  const [refDocError, setRefDocError] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [researchNote, setResearchNote] = useState(() => snap?.researchNote ?? "");

  const statusIdRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ---------- 消息操作 ----------

  const push = (m: ChatMessageInput) => {
    const msg = { ...m, id: nextId() } as ChatMessage;
    setMessages((prev) => [...prev, msg]);
    return msg.id;
  };
  const patch = (id: string, p: Partial<ChatMessage>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? ({ ...m, ...p } as ChatMessage) : m))
    );
  };
  const lastOutline = (): (ChatMessage & { role: "outline" }) | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "outline") return messages[i] as ChatMessage & { role: "outline" };
    }
    return null;
  };

  // 对话上下文:仅文本消息,用于 analyze / revise
  const convTurns = (): ChatTurn[] =>
    messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // ---------- 快照 ----------

  // 快照持续写入(挂载时已在惰性初始化中恢复)
  useEffect(() => {
    if (messages.length === 0 && !refDoc) return;
    const snapNow: Snapshot = {
      messages,
      refDoc,
      researchNote,
    };
    try {
      sessionStorage.setItem(SNAP_KEY, JSON.stringify(snapNow));
    } catch {
      // 快照过大等写入失败:不阻塞
    }
  }, [messages, refDoc, researchNote]);

  // ---------- 滚动到底 ----------

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, chips]);

  // ---------- 研究进度 ----------

  const setStatus = (content: string, kind: "progress" | "done" | "error" = "progress") => {
    if (statusIdRef.current) {
      patch(statusIdRef.current, { content, kind } as Partial<ChatMessage>);
    } else {
      statusIdRef.current = push({ role: "status", content, kind });
    }
  };

  const doResearch = async (topic: string, goal: string): Promise<string> => {
    statusIdRef.current = null;
    setStatus("正在制定资料查询计划...");
    try {
      const pr = await fetch("/api/ai/research/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, goal: goal || undefined }),
      });
      const plan = await pr.json().catch(() => null);
      const queries: string[] = Array.isArray(plan?.queries) ? plan.queries : [];
      if (queries.length === 0) throw new Error("empty plan");
      const sections: string[] = [];
      for (let i = 0; i < queries.length; i++) {
        setStatus(`正在联网检索:${queries[i]}(${i + 1}/${queries.length})`);
        const qr = await fetch("/api/ai/research/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: queries[i], sites: plan.sites }),
        });
        const qd = await qr.json().catch(() => null);
        const text = (qd?.text ?? "").toString().trim();
        if (text) sections.push(`【${queries[i]}】\n${text}`);
      }
      setStatus(`检索完成,共 ${queries.length} 条知识点`, "done");
      return sections.join("\n\n").slice(0, 30000);
    } catch {
      setStatus("联网检索不可用,将继续纯 AI 生成", "done");
      return "";
    }
  };

  // ---------- 大纲生成(analyze 已给出参数) ----------

  const runOutlineFlow = async (r: AnalyzeResult) => {
    // ① 流式设计说明(与联网检索并行)
    const noteId = push({ role: "assistant", content: "", streaming: true });
    const researchPromise = doResearch(r.topic, r.goal);
    try {
      await narrateChat(
        { topic: r.topic, techStack: r.techStack, goal: r.goal },
        (t) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === noteId && m.role === "assistant"
                ? { ...m, content: m.content + t }
                : m
            )
          );
        }
      );
    } catch (e) {
      patch(noteId, {
        content: e instanceof Error ? e.message : "设计说明生成失败",
        streaming: false,
      });
    }
    patch(noteId, { streaming: false });
    const researchNoteValue = await researchPromise;
    setResearchNote(researchNoteValue);

    // ② 参考课程摘要(用户提到「参考某课程」时)
    let refCourseSummary = "";
    if (r.refCourseId) {
      try {
        const res = await fetch(`/api/courses/${r.refCourseId}`);
        const c = await res.json();
        refCourseSummary = [
          `标题:${c.title}`,
          `语言:${c.language} · 难度:${c.level}`,
          ...(c.chapters ?? []).map(
            (ch: { title: string; steps: { title: string; type: string }[] }, i: number) =>
              `第${i + 1}章《${ch.title}》(${ch.steps.length} 步):` +
              ch.steps.map((s) => `${s.title}[${s.type}]`).join("、")
          ),
        ]
          .join("\n")
          .slice(0, 6000);
      } catch {
        refCourseSummary = "";
      }
    }

    // ③ 生成大纲
    const res = await fetch("/api/ai/outline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: r.topic,
        level: r.level,
        goal: r.goal.trim() || undefined,
        description: r.extra || undefined,
        researchNotes: researchNoteValue || undefined,
        referenceDoc: refDoc?.text,
        referenceCourse: refCourseSummary || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "大纲生成失败");
    push({ role: "outline", outline: data as CourseOutline, params: r, editable: true, busy: "idle" });
  };

  // ---------- 发送 ----------

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setSessionError("");
    setInput("");
    setChips(null);
    push({ role: "user", content: t });
    // 注意:push 是异步 setState,立即构造包含新消息的上下文供 API 使用
    const turns: ChatTurn[] = [...convTurns(), { role: "user", content: t }];

    const existing = lastOutline();
    setBusy(true);
    try {
      if (existing?.editable) {
        // 大纲已存在:走修订,不再重新分析
        const newOutline = await reviseChat(turns, existing.outline, {
          referenceDoc: refDoc?.text,
          researchNotes: researchNote || undefined,
        });
        patch(existing.id, { editable: false });
        push({ role: "outline", outline: newOutline, params: existing.params, editable: true, busy: "idle" });
      } else {
        const r = await analyzeChat(turns, {
          referenceDoc: refDoc?.text,
          courseList,
        });
        if (r.action === "reject") {
          setStatus(r.reason || "该主题与编程学习无关", "error");
          setChips(["仍要生成"]);
        } else if (r.action === "ask") {
          push({ role: "assistant", content: r.question });
          setChips(r.suggestions.length > 0 ? r.suggestions : null);
        } else {
          await runOutlineFlow(r);
        }
      }
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : "出错了,请重试");
    } finally {
      setBusy(false);
      statusIdRef.current = null;
    }
  };

  // reject 后「仍要生成」:用最后一条用户消息硬生成
  const forceGenerate = async () => {
    const last = [...messages].reverse().find((m) => m.role === "user");
    if (!last) return;
    setChips(null);
    setBusy(true);
    setSessionError("");
    try {
      await runOutlineFlow({
        action: "outline",
        reason: "",
        question: "",
        suggestions: [],
        topic: last.content.slice(0, 120),
        level: "beginner",
        goal: "",
        extra: "",
        techStack: [],
        refCourseId: "",
      });
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : "出错了,请重试");
    } finally {
      setBusy(false);
      statusIdRef.current = null;
    }
  };

  // ---------- 大纲卡片操作 ----------

  const patchOutlineChapter = (ci: number, p: Partial<CourseOutline["chapters"][number]>) => {
    const o = lastOutline();
    if (!o) return;
    const outline = {
      ...o.outline,
      chapters: o.outline.chapters.map((c, i) => (i === ci ? { ...c, ...p } : c)),
    };
    patch(o.id, { outline });
  };
  const moveChapter = (ci: number, dir: -1 | 1) => {
    const o = lastOutline();
    if (!o) return;
    const chs = [...o.outline.chapters];
    const j = ci + dir;
    if (j < 0 || j >= chs.length) return;
    [chs[ci], chs[j]] = [chs[j], chs[ci]];
    patch(o.id, { outline: { ...o.outline, chapters: chs } });
  };
  const removeChapter = (ci: number) => {
    const o = lastOutline();
    if (!o) return;
    if (!window.confirm("删除该章节后不可恢复,确认?")) return;
    if (o.outline.chapters.length <= 1) return;
    patch(o.id, {
      outline: { ...o.outline, chapters: o.outline.chapters.filter((_, i) => i !== ci) },
    });
  };

  // 确认大纲 → 生成第一章 → 进入课程
  const confirmOutline = async () => {
    const o = lastOutline();
    if (!o || o.busy === "generating") return;
    patch(o.id, { busy: "generating", error: undefined });
    try {
      const res = await fetch("/api/ai/chapter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outline: o.outline, chapterIndex: 0 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "第一章生成失败");
      const saveRes = await fetch("/api/ai/assemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outline: o.outline, chapters: [data.steps] }),
      });
      const saved = await saveRes.json();
      if (!saveRes.ok) throw new Error(saved.error ?? "课程保存失败");
      sessionStorage.removeItem(SNAP_KEY);
      onCourseCreated(saved.id);
    } catch (err) {
      patch(o.id, {
        busy: "idle",
        error: err instanceof Error ? err.message : "课程生成失败",
      });
    }
  };

  // 换个大纲:用同一参数重新生成(不复用研究,避免太久)
  const regenerateOutline = async () => {
    const o = lastOutline();
    if (!o || o.busy === "generating") return;
    if (!window.confirm("将重新生成一份全新大纲,当前对章节的编辑会丢失。确定重新生成?")) return;
    patch(o.id, { editable: false });
    setBusy(true);
    setSessionError("");
    try {
      await runOutlineFlow(o.params);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : "大纲重新生成失败");
      patch(o.id, { editable: true });
    } finally {
      setBusy(false);
    }
  };

  // ---------- 参考文档 ----------

  const loadRefDoc = async (f: File) => {
    setRefDocError("");
    if (!/\.(txt|md|json|js|ts|py|html|css|sql|csv|yml|yaml|sh|go|rs|java|c|cpp)$/i.test(f.name)) {
      setRefDocError("暂不支持该文件类型,请使用 txt / md / 代码文件");
      return;
    }
    if (f.size > 512 * 1024) {
      setRefDocError("文件过大(限 512KB),请截取核心内容后重试");
      return;
    }
    try {
      const text = await f.text();
      setRefDoc({ name: f.name, text: text.slice(0, 30000) });
    } catch {
      setRefDocError("读取文件失败,请重试");
    }
  };

  // ---------- 渲染 ----------

  return (
    <div className="fade-up mx-auto max-w-3xl">
      <div className="flex min-h-[280px] flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
        {/* 消息区 */}
        <div ref={listRef} className="max-h-[480px] min-h-[280px] flex-1 space-y-4 overflow-y-auto p-5">
          {messages.length === 0 && (
            <div className="py-6 text-center">
              <p className="font-serif text-lg font-bold text-ink">和 AI 聊聊你想学什么</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
                描述你想要的效果,AI 会替你选择技术栈并生成课程。
                <br />
                例如:「我想做一个能抓取豆瓣电影评分的工具」「把常用 Linux 命令系统地学一遍」
              </p>
            </div>
          )}
          {messages.map((m) => {
            if (m.role === "user") {
              return (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-sm text-bg">
                    {m.content}
                  </div>
                </div>
              );
            }
            if (m.role === "assistant") {
              return (
                <div key={m.id} className="flex justify-start">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-line bg-bg-subtle px-4 py-2.5 text-sm leading-relaxed text-ink">
                    {m.content || "..."}
                    {m.streaming && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
                  </div>
                </div>
              );
            }
            if (m.role === "outline") {
              return (
                <div key={m.id} className="flex justify-start">
                  <div className="w-full">
                    <OutlineCard
                      outline={m.outline}
                      editable={m.editable}
                      busy={m.busy}
                      error={m.error}
                      researched={Boolean(researchNote)}
                      goal={m.params.goal}
                      onEditChapter={patchOutlineChapter}
                      onMoveChapter={moveChapter}
                      onRemoveChapter={removeChapter}
                      onConfirm={confirmOutline}
                      onRegenerate={regenerateOutline}
                    />
                  </div>
                </div>
              );
            }
            return (
              <div key={m.id} className="flex justify-center">
                <span
                  className={`max-w-full rounded-full px-3 py-1 text-[11px] ${
                    m.kind === "error"
                      ? "bg-red-soft text-red"
                      : m.kind === "done"
                        ? "bg-green-soft text-green"
                        : "bg-accent-soft text-accent"
                  }`}
                >
                  {m.kind === "progress" && (
                    <span className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current/30 border-t-current align-middle" />
                  )}
                  {m.content}
                </span>
              </div>
            );
          })}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm border border-line bg-bg-subtle px-4 py-2.5 text-sm text-ink-soft">
                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-accent/50" />
                <span className="ml-2">AI 思考中...</span>
              </div>
            </div>
          )}
        </div>

        {/* 快捷回复 */}
        {chips && (
          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
            {chips.map((c) => (
              <button
                key={c}
                onClick={() => (c === "仍要生成" ? forceGenerate() : send(c))}
                disabled={busy}
                className="rounded-full border border-accent/40 bg-accent-soft px-3.5 py-1.5 text-xs text-accent transition hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* 输入区 */}
        <div className="border-t border-line bg-bg-subtle/50 px-5 py-4">
          {refDoc && (
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs text-ink-soft">
              <span className="truncate">📄 {refDoc.name}</span>
              <button
                onClick={() => setRefDoc(null)}
                className="ml-auto shrink-0 text-red/70 transition hover:text-red"
              >
                移除
              </button>
            </div>
          )}
          {refDocError && <p className="mb-2 text-xs text-red">{refDocError}</p>}
          {sessionError && (
            <div className="mb-2 rounded-xl border border-red-200 bg-red-soft px-4 py-2.5 text-sm text-red">
              {sessionError}
            </div>
          )}
          <div className="flex items-end gap-2">
            <label
              title="上传参考文档(txt / md / 代码)"
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-line bg-card text-base text-ink-soft transition hover:border-accent/50 hover:text-accent"
            >
              📎
              <input
                type="file"
                accept=".txt,.md,.json,.js,.ts,.py,.html,.css,.sql,.csv,.yml,.yaml,.sh,.go,.rs,.java,.c,.cpp"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) loadRefDoc(f);
                  e.target.value = "";
                }}
              />
            </label>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={2}
              placeholder="描述你想学什么,回车发送(Shift+Enter 换行)"
              aria-label="聊天输入框"
              className="max-h-32 flex-1 resize-none rounded-xl border border-line bg-bg px-4 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <button
              onClick={() => send(input)}
              disabled={busy || !input.trim()}
              className="h-10 shrink-0 rounded-xl bg-ink px-5 text-sm font-semibold text-bg transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              发送
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-ink-soft/70">
            AI 会根据你的描述选择技术栈;生成前先联网检索资料,再定制课程
          </p>
        </div>
      </div>

      {/* reject 后的硬生成 */}
      {chips?.includes("仍要生成") && (
        <p className="mt-2 text-center text-[11px] text-ink-soft/60">
          也可以直接在输入框里描述新的主题
        </p>
      )}
    </div>
  );
}
