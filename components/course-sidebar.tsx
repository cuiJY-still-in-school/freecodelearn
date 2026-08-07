"use client";

import { useEffect, useRef, useState } from "react";
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
  onExportMd?: () => void;
  className?: string;
}

export default function CourseSidebar({
  course,
  currentStepId,
  progress,
  onNavigate,
  onClearProgress,
  onExportMd,
  className,
}: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // 当前步骤跟随:切换步骤时把激活项滚动到侧边栏可见区域
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [currentStepId]);

  // 当前步骤所在章节自动展开
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 步骤切换时自动展开所在章节,函数式更新无级联
    setCollapsed((prev) => {
      const chapter = course.chapters.find((c) =>
        c.steps.some((s) => s.id === currentStepId)
      );
      if (!chapter || !prev.has(chapter.id)) return prev;
      const next = new Set(prev);
      next.delete(chapter.id);
      return next;
    });
  }, [currentStepId, course.chapters]);

  function toggleChapter(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
          const isCollapsed = collapsed.has(chapter.id);
          return (
            <div key={chapter.id}>
              <button
                onClick={() => toggleChapter(chapter.id)}
                title={isCollapsed ? "展开章节" : "折叠章节"}
                className="mb-1.5 flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
              >
                <span>
                  {ci + 1} · {chapter.title}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-ink-soft/70">
                    {doneIn}/{chapter.steps.length}
                  </span>
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </button>
              {!isCollapsed &&
                chapter.steps.map((step) => {
                const done = progress[step.id];
                const active = step.id === currentStepId;
                return (
                  <button
                    key={step.id}
                    ref={active ? activeRef : undefined}
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
                    {step.type === "challenge" &&
                      typeof step.difficulty === "number" && (
                        <span
                          className="ml-auto flex shrink-0 items-center gap-0.5"
                          title={`难度 ${step.difficulty}/5`}
                        >
                          {[1, 2, 3, 4, 5].map((n) => (
                            <span
                              key={n}
                              className={`h-1 w-1 rounded-full ${
                                n <= step.difficulty! ? "bg-accent/70" : "bg-line"
                              }`}
                            />
                          ))}
                        </span>
                      )}
                  </button>
                );
              })}
            </div>
          );
        })}
        {/* 后台待生成章节占位 */}
        {(course.pendingChapters ?? 0) > 0 &&
          course.outline?.chapters
            .slice(course.chapters.length)
            .map((oc, i) => (
              <div
                key={`pending-${i}`}
                className="mb-1.5 flex items-center gap-2 rounded-lg border border-dashed border-line px-2 py-1.5 text-[13px] text-ink-soft/50"
              >
                <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                <span className="truncate">
                  {course.chapters.length + i + 1} · {oc.title}
                </span>
                <span className="ml-auto shrink-0 text-[10px]">生成中</span>
              </div>
            ))}
      </nav>
      <div className="mt-6 space-y-1 border-t border-line pt-4">
        {onExportMd && (
          <button
            onClick={onExportMd}
            className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
            title="导出 Markdown 讲义,可离线阅读/打印"
          >
            ⬇ 导出讲义(.md)
          </button>
        )}
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
