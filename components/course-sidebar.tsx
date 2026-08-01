"use client";

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
}

export default function CourseSidebar({
  course,
  currentStepId,
  progress,
  onNavigate,
}: Props) {
  return (
    <aside className="sticky top-14 h-[calc(100vh-3.5rem)] w-72 shrink-0 overflow-y-auto border-r border-line bg-card/60 p-5">
      <h1 className="mb-1 font-serif text-lg font-bold leading-snug text-ink">
        {course.title}
      </h1>
      <p className="mb-5 text-xs text-ink-soft">
        {course.language} · {course.level} · 约 {course.estimatedMinutes} 分钟
      </p>
      <nav className="space-y-5">
        {course.chapters.map((chapter, ci) => (
          <div key={chapter.id}>
            <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              {ci + 1} · {chapter.title}
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
        ))}
      </nav>
    </aside>
  );
}
