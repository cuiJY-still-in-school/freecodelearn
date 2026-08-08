"use client";

import type { CourseOutline } from "@/lib/types";

interface OutlineCardProps {
  outline: CourseOutline;
  editable: boolean;
  busy: "idle" | "generating";
  error?: string;
  researched?: boolean;
  goal?: string;
  onEditChapter: (ci: number, patch: Partial<CourseOutline["chapters"][number]>) => void;
  onMoveChapter: (ci: number, dir: -1 | 1) => void;
  onRemoveChapter: (ci: number) => void;
  onConfirm: () => void;
  onRegenerate: () => void;
}

export default function OutlineCard({
  outline,
  editable,
  busy,
  error,
  researched,
  goal,
  onEditChapter,
  onMoveChapter,
  onRemoveChapter,
  onConfirm,
  onRegenerate,
}: OutlineCardProps) {
  const generating = busy === "generating";
  return (
    <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-accent">大纲已生成 · 请确认</p>
          <h3 className="mt-1 font-serif text-xl font-bold">{outline.title}</h3>
          <p className="mt-1 text-sm text-ink-soft">{outline.description}</p>
        </div>
        <span className="shrink-0 rounded-full border border-line bg-bg-subtle px-3 py-1 text-xs text-ink-soft">
          {outline.language} · {outline.chapters.length} 章 · 约 {outline.estimatedMinutes} 分钟
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {researched && (
          <span className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-[11px] text-accent">
            🔍 已联网检索资料并应用于课程设计
          </span>
        )}
        {goal?.trim() && (
          <span className="rounded-full border border-line bg-bg-subtle px-2.5 py-0.5 text-[11px] text-ink-soft">
            🎯 目标:{goal.trim().slice(0, 40)}
            {goal.trim().length > 40 ? "…" : ""}
          </span>
        )}
      </div>

      {editable && !generating && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-dashed border-accent/30 bg-accent-soft/30 px-4 py-2.5 text-xs leading-relaxed text-ink-soft">
          <span>💡</span>
          <span>
            不满意这份大纲?点下方
            <button
              type="button"
              onClick={onRegenerate}
              className="mx-1 rounded-md border border-accent/40 px-1.5 py-0.5 text-accent transition hover:bg-accent hover:text-white"
            >
              ↻ 换个大纲
            </button>
            ,或直接编辑章节、在聊天里继续提修改意见。
          </span>
        </div>
      )}

      <div className="mt-4 space-y-4">
        {outline.chapters.map((c, ci) => (
          <div key={ci} className="rounded-xl border border-line bg-bg-subtle/50 p-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-ink-soft">{ci + 1}</span>
              <input
                value={c.title}
                onChange={(e) => onEditChapter(ci, { title: e.target.value })}
                disabled={!editable || generating}
                className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 py-1 text-sm font-bold text-ink outline-none transition focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={`第 ${ci + 1} 章标题`}
              />
              {editable && !generating && (
                <>
                  <button
                    onClick={() => onMoveChapter(ci, -1)}
                    disabled={ci === 0}
                    className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs text-ink-soft transition hover:bg-bg-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                    title="上移章节"
                  >↑</button>
                  <button
                    onClick={() => onMoveChapter(ci, 1)}
                    disabled={ci === outline.chapters.length - 1}
                    className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs text-ink-soft transition hover:bg-bg-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                    title="下移章节"
                  >↓</button>
                  <button
                    onClick={() => onRemoveChapter(ci)}
                    disabled={outline.chapters.length <= 1}
                    className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs text-red/70 transition hover:bg-red-soft hover:text-red disabled:cursor-not-allowed disabled:opacity-30"
                    title="删除章节"
                  >✕</button>
                </>
              )}
            </div>
            <textarea
              value={c.description ?? ""}
              onChange={(e) => onEditChapter(ci, { description: e.target.value })}
              disabled={!editable || generating}
              placeholder="本章目标(可编辑)"
              rows={1}
              className="mt-2 w-full resize-none rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-ink-soft outline-none transition focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
            />
            <ul className="mt-2.5 space-y-1">
              {c.steps.map((s, si) => (
                <li key={si} className="flex items-center gap-2 text-xs text-ink-soft">
                  <span
                    className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold ${
                      s.type === "challenge"
                        ? "bg-purple-100 text-purple-700"
                        : s.type === "quiz"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {s.type === "challenge" ? "⌘" : s.type === "quiz" ? "✓" : "📖"}
                  </span>
                  <span className="truncate">{s.title}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-soft px-4 py-3 text-sm text-red">
          {error}
        </div>
      )}

      {generating ? (
        <div className="mt-5 rounded-xl border border-line bg-bg-subtle/50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            正在生成第一章《{outline.chapters[0]?.title}》
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            第一章完成后立即开始学习
            {outline.chapters.length > 1
              ? `,其余 ${outline.chapters.length - 1} 章会在学习过程中自动生成`
              : "。"}
          </p>
          <div className="mt-4 space-y-1.5">
            {outline.chapters.map((c, ci) => (
              <div key={ci} className="flex items-center gap-2 text-xs">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                    ci === 0 ? "bg-accent-soft text-accent" : "bg-bg-subtle text-ink-soft/50"
                  }`}
                >
                  {ci === 0 ? "●" : "○"}
                </span>
                <span className="truncate">{c.title}</span>
                <span className="ml-auto shrink-0 text-ink-soft/60">
                  {ci === 0 ? "正在生成..." : "学习时自动生成"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={onConfirm}
            disabled={!editable}
            className="flex-1 rounded-xl bg-ink py-3 text-sm font-semibold text-bg transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            确认大纲,开始生成课程 →
          </button>
          {editable && (
            <button
              onClick={onRegenerate}
              className="rounded-xl border border-line px-5 py-3 text-sm font-medium text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
            >
              ↻ 换个大纲
            </button>
          )}
        </div>
      )}
      {!generating && (
        <p className="mt-3 text-center text-xs text-ink-soft">
          确认后先生成第一章(约 30-60 秒)即可开始学习
          {outline.chapters.length > 1
            ? `,其余 ${outline.chapters.length - 1} 章在你学习的同时自动生成`
            : "。"}
        </p>
      )}
    </div>
  );
}
