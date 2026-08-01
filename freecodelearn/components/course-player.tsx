"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type { Course } from "@/lib/types";
import {
  countSteps,
  findStep,
  firstStepId,
  flattenSteps,
  nextStepId,
  prevStepId,
} from "@/lib/types";
import { loadProgress, saveProgress, type ProgressMap } from "@/lib/progress";
import CourseSidebar from "@/components/course-sidebar";
import LessonView from "@/components/lesson-view";
import ChallengeRunner from "@/components/challenge-runner";
import QuizView from "@/components/quiz-view";

const STEP_BADGE: Record<string, string> = {
  lesson: "讲解",
  challenge: "代码挑战",
  quiz: "测验",
};

const STEP_BADGE_CLS: Record<string, string> = {
  lesson: "bg-blue-50 text-blue-700 border-blue-200",
  challenge: "bg-purple-50 text-purple-700 border-purple-200",
  quiz: "bg-amber-50 text-amber-700 border-amber-200",
};

const CONFETTI_COLORS = ["#d97757", "#e8c468", "#7fb069", "#6a9fd8", "#b08bd0"];

function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 1.2,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotate: Math.random() * 360,
    }))
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            background: p.color,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export default function CoursePlayer({ course }: { course: Course }) {
  const flat = useMemo(() => flattenSteps(course), [course]);
  const total = countSteps(course);

  const [currentId, setCurrentId] = useState<string>(() => {
    const saved = loadProgress(course.id);
    const firstUndone = flat.find((f) => !saved[f.step.id]);
    if (firstUndone) return firstUndone.step.id;
    return flat.length ? flat[flat.length - 1].step.id : firstStepId(course);
  });
  const [progress, setProgress] = useState<ProgressMap>(() =>
    loadProgress(course.id)
  );
  const [celebrating, setCelebrating] = useState(false);

  const step = findStep(course, currentId);
  const doneCount = Object.values(progress).filter(Boolean).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const isLast = currentId === (flat.length ? flat[flat.length - 1].step.id : "");

  const markDone = useCallback(
    (id: string, status: "done" | "passed" | "correct") => {
      setProgress((prev) => {
        const next = { ...prev, [id]: status };
        saveProgress(course.id, next);
        return next;
      });
    },
    [course.id]
  );

  function goTo(id: string) {
    setCurrentId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const next = nextStepId(course, currentId);
  const prev = prevStepId(course, currentId);

  function celebrate() {
    setCelebrating(true);
    window.setTimeout(() => setCelebrating(false), 3000);
  }

  if (!step) {
    return <p className="p-10 text-center text-ink-soft">步骤不存在</p>;
  }

  const isDone = Boolean(progress[step.id]);

  return (
    <div className="flex">
      <CourseSidebar
        course={course}
        currentStepId={currentId}
        progress={progress}
        onNavigate={goTo}
      />
      <div className="min-w-0 flex-1">
        {/* 进度条 */}
        <div className="border-b border-line bg-card/70 px-6 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-4">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="shrink-0 font-mono text-xs text-ink-soft">
              {doneCount}/{total} · {pct}%
            </span>
          </div>
        </div>

        <div className="relative mx-auto max-w-3xl px-6 py-10">
          {celebrating && <Confetti />}

          {/* 课程完成横幅 */}
          {isLast && isDone && !next && (
            <div className="fade-up relative mb-8 overflow-hidden rounded-2xl border border-green/30 bg-green-soft p-6 text-center">
              <span className="pop inline-block text-4xl">🎉</span>
              <h2 className="mt-2 font-serif text-2xl font-bold text-green">
                课程完成!
              </h2>
              <p className="mt-1 text-sm text-green/80">
                你已完成《{course.title}》全部 {total} 个步骤,干得漂亮
              </p>
              <Link
                href="/"
                className="mt-4 inline-block rounded-xl bg-green px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                回到课程列表
              </Link>
            </div>
          )}

          <div className="mb-3 flex items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STEP_BADGE_CLS[step.type]}`}
            >
              {STEP_BADGE[step.type]}
            </span>
            {isDone && (
              <span className="rounded-full border border-green/30 bg-green-soft px-2.5 py-0.5 text-xs font-medium text-green">
                ✓ 已完成
              </span>
            )}
          </div>
          <h1 className="mb-8 font-serif text-3xl font-bold tracking-tight">
            {step.title}
          </h1>

          {step.bodyMarkdown && (
            <div className="mb-8">
              <LessonView content={step.bodyMarkdown} />
            </div>
          )}

          {step.type === "challenge" && (
            <div>
              <ChallengeRunner
                starterCode={step.starterCode ?? ""}
                tests={step.tests}
                solution={step.solution}
                html={step.html}
                language={step.language}
                onPassed={() => {
                  markDone(step.id, "passed");
                  if (next) window.setTimeout(() => goTo(next), 600);
                }}
              />
              {!step.tests && (
                <button
                  onClick={() => markDone(step.id, "done")}
                  className="mt-4 rounded-xl border border-line px-4 py-2 text-sm text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
                >
                  标记为已完成
                </button>
              )}
            </div>
          )}

          {step.type === "quiz" &&
            (step.questions && step.questions.length > 0 ? (
              <QuizView
                questions={step.questions}
                onComplete={() => {
                  markDone(step.id, "correct");
                  if (next) window.setTimeout(() => goTo(next), 800);
                }}
              />
            ) : (
              <button
                onClick={() => markDone(step.id, "done")}
                className="rounded-xl border border-line px-4 py-2 text-sm text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
              >
                标记为已完成
              </button>
            ))}

          {step.type === "lesson" && (
            <button
              onClick={() => markDone(step.id, "done")}
              className="rounded-xl border border-line px-4 py-2 text-sm text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
            >
              标记为已完成
            </button>
          )}

          {/* 底部导航 */}
          <div className="mt-12 flex items-center justify-between border-t border-line pt-6">
            {prev ? (
              <button
                onClick={() => goTo(prev)}
                className="rounded-xl border border-line px-5 py-2.5 text-sm text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
              >
                ← 上一项
              </button>
            ) : (
              <span />
            )}
            {next && !isDone ? (
              <button
                onClick={() => {
                  markDone(step.id, "done");
                  goTo(next);
                }}
                className="rounded-xl bg-ink px-6 py-2.5 text-sm font-semibold text-bg transition hover:bg-accent"
              >
                标记完成并继续 →
              </button>
            ) : next ? (
              <button
                onClick={() => goTo(next)}
                className="rounded-xl bg-ink px-6 py-2.5 text-sm font-semibold text-bg transition hover:bg-accent"
              >
                下一项 →
              </button>
            ) : (
              isDone && (
                <button
                  onClick={celebrate}
                  className="rounded-xl border border-accent/40 bg-accent-soft px-6 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent hover:text-white"
                >
                  再庆祝一次 🎉
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
