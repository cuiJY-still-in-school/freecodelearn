"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CourseOutline } from "@/lib/types";
import { clearDraft, saveDraft, type OutlineDraft } from "@/lib/drafts";

const STEP_ICON: Record<string, string> = {
  lesson: "📖",
  challenge: "⌘",
  quiz: "✓",
};

export default function OutlineEditor({ draft }: { draft: OutlineDraft }) {
  const router = useRouter();
  const [outline, setOutline] = useState<CourseOutline>(draft.outline);
  const [busy, setBusy] = useState<"idle" | "generating">("idle");
  const [error, setError] = useState("");
  const [sel, setSel] = useState(0);
  const total = useMemo(
    () => outline.chapters.reduce((a, c) => a + c.steps.length, 0),
    [outline]
  );

  const patchChapter = (ci: number, p: Partial<CourseOutline["chapters"][number]>) => {
    const next = {
      ...outline,
      chapters: outline.chapters.map((c, i) => (i === ci ? { ...c, ...p } : c)),
    };
    setOutline(next);
    saveDraft({ ...draft, outline: next });
  };
  const moveChapter = (ci: number, dir: -1 | 1) => {
    const j = ci + dir;
    if (j < 0 || j >= outline.chapters.length) return;
    const chs = [...outline.chapters];
    [chs[ci], chs[j]] = [chs[j], chs[ci]];
    const next = { ...outline, chapters: chs };
    setOutline(next);
    saveDraft({ ...draft, outline: next });
  };
  const removeChapter = (ci: number) => {
    if (outline.chapters.length <= 1) return;
    if (!window.confirm("删除该章节后不可恢复,确认?")) return;
    const next = { ...outline, chapters: outline.chapters.filter((_, i) => i !== ci) };
    setOutline(next);
    setSel((s) => Math.min(s, next.chapters.length - 1));
    saveDraft({ ...draft, outline: next });
  };
  const addChapter = () => {
    const next = {
      ...outline,
      chapters: [
        ...outline.chapters,
        { title: `第 ${outline.chapters.length + 1} 章`, description: "", steps: [{ title: "新步骤", type: "lesson" as const, brief: "" }] },
      ],
    };
    setOutline(next);
    setSel(next.chapters.length - 1);
    saveDraft({ ...draft, outline: next });
  };

  const patchStep = (si: number, p: Partial<CourseOutline["chapters"][number]["steps"][number]>) => {
    const next = {
      ...outline,
      chapters: outline.chapters.map((c, i) =>
        i === sel ? { ...c, steps: c.steps.map((s, j) => (j === si ? { ...s, ...p } : s)) } : c
      ),
    };
    setOutline(next);
    saveDraft({ ...draft, outline: next });
  };
  const moveStep = (si: number, dir: -1 | 1) => {
    const steps = outline.chapters[sel]?.steps ?? [];
    const j = si + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[si], next[j]] = [next[j], next[si]];
    patchSteps(next);
  };
  const removeStep = (si: number) => {
    const steps = outline.chapters[sel]?.steps ?? [];
    if (steps.length <= 1) return;
    patchSteps(steps.filter((_, j) => j !== si));
  };
  const addStep = () => {
    const steps = outline.chapters[sel]?.steps ?? [];
    patchSteps([
      ...steps,
      { title: `新步骤 ${steps.length + 1}`, type: "lesson", brief: "" },
    ]);
  };
  const patchSteps = (steps: CourseOutline["chapters"][number]["steps"]) => {
    const next = {
      ...outline,
      chapters: outline.chapters.map((c, i) => (i === sel ? { ...c, steps } : c)),
    };
    setOutline(next);
    saveDraft({ ...draft, outline: next });
  };

  const confirm = async () => {
    if (busy === "generating") return;
    setBusy("generating");
    setError("");
    try {
      const res = await fetch("/api/ai/chapter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outline, chapterIndex: 0 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "第一章生成失败");
      const saveRes = await fetch("/api/ai/assemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outline, chapters: [data.steps] }),
      });
      const saved = await saveRes.json();
      if (!saveRes.ok) throw new Error(saved.error ?? "课程保存失败");
      clearDraft();
      try {
        sessionStorage.removeItem("fcl-chat-snapshot");
      } catch {
        // 忽略
      }
      router.push(`/courses/${saved.id}`);
    } catch (e) {
      setBusy("idle");
      setError(e instanceof Error ? e.message : "课程生成失败,请重试");
    }
  };

  const ch = outline.chapters[sel];

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* 左侧:章节结构 */}
      <aside className="w-80 shrink-0 border-r border-line bg-bg-subtle/40">
        <div className="px-5 py-4">
          <p className="text-xs font-medium tracking-wide text-accent">课程大纲</p>
          <h1 className="mt-1 font-serif text-lg font-bold leading-snug">{outline.title}</h1>
          <p className="mt-1 text-xs text-ink-soft">{outline.description}</p>
        </div>
        <div className="mx-5 mb-3 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] text-ink-soft">
            {outline.language}
          </span>
          <span className="rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] text-ink-soft">
            {outline.chapters.length} 章
          </span>
          <span className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-[11px] text-accent">
            共 {total} 步
          </span>
          <span className="rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] text-ink-soft">
            约 {outline.estimatedMinutes} 分钟
          </span>
        </div>
        <nav className="space-y-1 px-3 pb-6">
          {outline.chapters.map((c, ci) => (
            <button
              key={ci}
              onClick={() => setSel(ci)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${
                ci === sel ? "bg-accent-soft text-accent" : "hover:bg-bg-subtle"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                  ci === sel ? "bg-accent text-white" : "bg-card text-ink-soft border border-line"
                }`}
              >
                {ci + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-sm font-medium ${
                    ci === sel ? "text-accent" : "text-ink"
                  }`}
                >
                  {c.title}
                </span>
                <span className="block text-[11px] text-ink-soft">
                  {c.steps.length} 步
                </span>
              </span>
            </button>
          ))}
          <button
            onClick={addChapter}
            disabled={busy === "generating"}
            className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-line px-3 py-2.5 text-sm text-ink-soft transition hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-dashed border-line text-xs">+</span>
            新增章节
          </button>
        </nav>
      </aside>

      {/* 右侧:章节编辑 */}
      <main className="min-w-0 flex-1 px-8 py-6">
        {!ch ? (
          <p className="text-center text-ink-soft">没有章节</p>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent font-serif text-sm font-bold text-white">
                {sel + 1}
              </span>
              <div className="min-w-0 flex-1">
                <input
                  value={ch.title}
                  onChange={(e) => patchChapter(sel, { title: e.target.value })}
                  disabled={busy === "generating"}
                  aria-label="章节标题"
                  className="w-full rounded-lg border border-line bg-card px-3 py-1.5 font-serif text-xl font-bold text-ink outline-none transition focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                />
                <textarea
                  value={ch.description ?? ""}
                  onChange={(e) => patchChapter(sel, { description: e.target.value })}
                  disabled={busy === "generating"}
                  placeholder="本章目标(可编辑)"
                  rows={2}
                  className="mt-2 w-full resize-none rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink-soft outline-none transition focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => moveChapter(sel, -1)}
                  disabled={sel === 0}
                  className="rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink-soft transition hover:bg-bg-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                  title="上移章节"
                >↑</button>
                <button
                  onClick={() => moveChapter(sel, 1)}
                  disabled={sel === outline.chapters.length - 1}
                  className="rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink-soft transition hover:bg-bg-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                  title="下移章节"
                >↓</button>
                <button
                  onClick={() => removeChapter(sel)}
                  disabled={outline.chapters.length <= 1}
                  className="rounded-lg border border-line px-2.5 py-1.5 text-sm text-red/70 transition hover:bg-red-soft hover:text-red disabled:cursor-not-allowed disabled:opacity-30"
                  title="删除章节"
                >✕</button>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-line bg-card">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <p className="text-xs font-medium text-ink-soft">本章步骤(共 {ch.steps.length} 步)</p>
                <span className="text-[11px] text-ink-soft/60">教一点,做一点,逐步完成</span>
              </div>
              <ul className="divide-y divide-line/60">
                {ch.steps.map((s, si) => (
                  <li key={si} className="flex items-center gap-2.5 px-4 py-2.5 text-sm">
                    <span className="font-mono text-[11px] text-ink-soft">{si + 1}</span>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold bg-bg-subtle">
                      {STEP_ICON[s.type] ?? "•"}
                    </span>
                    <input
                      value={s.title}
                      onChange={(e) => patchStep(si, { title: e.target.value })}
                      disabled={busy === "generating"}
                      aria-label={`步骤 ${si + 1} 标题`}
                      className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-ink outline-none transition focus:border-accent/60 focus:bg-card disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <select
                      value={s.type}
                      onChange={(e) =>
                        patchStep(si, { type: e.target.value as typeof s.type })
                      }
                      disabled={busy === "generating"}
                      aria-label="步骤类型"
                      className="shrink-0 rounded-lg border border-line bg-card px-2 py-1 text-xs text-ink-soft outline-none transition focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="lesson">讲解</option>
                      <option value="challenge">代码挑战</option>
                      <option value="quiz">测验</option>
                    </select>
                    <div className="flex shrink-0 gap-0.5">
                      <button
                        onClick={() => moveStep(si, -1)}
                        disabled={si === 0 || busy === "generating"}
                        className="rounded-lg px-1.5 py-1 text-xs text-ink-soft transition hover:bg-bg-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                        title="上移步骤"
                      >↑</button>
                      <button
                        onClick={() => moveStep(si, 1)}
                        disabled={si === ch.steps.length - 1 || busy === "generating"}
                        className="rounded-lg px-1.5 py-1 text-xs text-ink-soft transition hover:bg-bg-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                        title="下移步骤"
                      >↓</button>
                      <button
                        onClick={() => removeStep(si)}
                        disabled={ch.steps.length <= 1 || busy === "generating"}
                        className="rounded-lg px-1.5 py-1 text-xs text-red/60 transition hover:bg-red-soft hover:text-red disabled:cursor-not-allowed disabled:opacity-30"
                        title="删除步骤"
                      >✕</button>
                    </div>
                  </li>
                ))}
              </ul>
              <button
                onClick={addStep}
                disabled={busy === "generating"}
                className="m-3 w-[calc(100%-1.5rem)] rounded-xl border border-dashed border-line py-2 text-xs text-ink-soft transition hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                + 添加步骤
              </button>
            </div>
          </>
        )}

        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-soft px-4 py-3 text-sm text-red">
            {error}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6">
          {busy === "generating" ? (
            <div className="flex items-center gap-2 text-sm text-ink">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
              正在生成第一章《{outline.chapters[0]?.title}》,完成后即可开始学习…
            </div>
          ) : (
            <>
              <button
                onClick={confirm}
                className="rounded-xl bg-ink px-8 py-3 text-sm font-semibold text-bg transition hover:bg-accent"
              >
                确认大纲,开始生成课程 →
              </button>
              <Link
                href="/"
                className="rounded-xl border border-line px-5 py-3 text-sm font-medium text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
              >
                ← 回到聊天继续修改
              </Link>
            </>
          )}
          <p className="text-xs text-ink-soft">
            确认后先生成第一章(约 30-60 秒)即可开始学习
            {outline.chapters.length > 1
              ? `,其余 ${outline.chapters.length - 1} 章在你学习的同时自动生成`
              : "。"}
          </p>
        </div>
      </main>
    </div>
  );
}
