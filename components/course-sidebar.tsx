"use client";

import Link from "next/link";
import type { Course } from "@/lib/types";
import type { ProgressMap } from "@/lib/progress";

const STEP_ICON: Record<string, string> = {
  lesson: "📖",
  challenge: "⌘",
  quiz: "✓",
};

interface Props {
  course: Course;
  currentStepId: string;
  progress: ProgressMap;
  onNavigate: (stepId: string) => void;
  onClearProgress: () => void;
  className?: string;
}

export default function CourseSidebar({
  course,
  currentStepId,
  progress,
  onNavigate,
  onClearProgress,
  className,
}: Props) {
  return (
    <aside
      className={`sticky top-14 h-[calc(100vh-3.5rem)] w-72 shrink-0 overflow-y-auto border-r border-line bg-card/60 p-5 ${
        className ?? ""
      }`}
    >
      <Link
        href="/"
        className="mb-4 flex w-fit items-center gap-1.5 rounded-lg px-1 py-1 text-xs text-ink-soft transition hover:text-accent"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        全部课程
      </Link>
      <h1 className="mb-1 font-serif text-lg font-bold leading-snug text-ink">
        {course.title}
      </h1>
      <p className="mb-5 text-xs text-ink-soft">
        {course.language} · {course.level} · 约 {course.estimatedMinutes} 分钟
      </p>
      <nav className="space-y-5">
        {course.chapters.map((chapter, ci) => {
          const doneIn = chapter.steps.filter((s) => progress[s.id]).length;
          return (
            <div key={chapter.id}>
              <div className="mb-1.5 flex items-center justify-between px-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                  {ci + 1} · {chapter.title}
                </span>
                <span className="font-mono text-[10px] text-ink-soft/70">
                  {doneIn}/{chapter.steps.length}
                </span>
              </div>
              {chapter.steps.map((step) => {
                const done = progress[step.id];
                const active = step.id === currentStepId;
                return (
                  <button
                    key={step.id}
                    onClick={() => onNavigate(step.id)}
                    className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition ${
                      active
                        ? "bg-accent-soft text-accent"
                        : "text-ink-soft hover:bg-bg-subtle hover:text-ink"
                    }`}
                  >
                    <span className="flex w-4 shrink-0 justify-center">
                      {done ? (
                        <span className="text-green">✓</span>
                      ) : (
                        <span className="opacity-50">{STEP_ICON[step.type]}</span>
                      )}
                    </span>
                    <span className="truncate">{step.title}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className="mt-6 border-t border-line pt-4">
        <button
          onClick={onClearProgress}
          className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-ink-soft transition hover:bg-red-soft hover:text-red"
        >
          清除学习进度
        </button>
      </div>
    </aside>
  );
}
