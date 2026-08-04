"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function isEditableTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    node.isContentEditable ||
    Boolean(node.closest(".cm-editor"))
  );
}

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
  const [mobileNav, setMobileNav] = useState(false);
  const [appendTitle, setAppendTitle] = useState("");
  const [appending, setAppending] = useState(false);
  const [appendMsg, setAppendMsg] = useState("");
  const [progress, setProgress] = useState<ProgressMap>(() =>
    loadProgress(course.id)
  );
  const [celebrating, setCelebrating] = useState(false);
  // 通过后跳转前提示(2 秒倒计时,可手动立即进入)
  const [passedFlash, setPassedFlash] = useState(false);
  const [chapterFlash, setChapterFlash] = useState<{
    title: string;
    nextId: string;
  } | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 键盘 ←/→ 切换步骤(编辑器中不触发)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      if (e.key === "ArrowLeft" && prev) {
        e.preventDefault();
        goTo(prev);
      } else if (e.key === "ArrowRight" && next) {
        e.preventDefault();
        goTo(next);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function clearAllProgress() {
    if (!window.confirm("确定清除这门课程的全部学习进度吗?")) return;
    setProgress({});
    localStorage.removeItem(`fcl-progress-${course.id}`);
    const first = flat.length ? flat[0].step.id : "";
    if (first) goTo(first);
  }

  const step = findStep(course, currentId);
  const doneCount = Object.values(progress).filter(Boolean).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const isLast = currentId === (flat.length ? flat[flat.length - 1].step.id : "");

  // 浏览器标签标题跟随当前步骤(延迟写入,避免被 Next.js hydration 的 metadata 应用覆盖)
  useEffect(() => {
    const t = setTimeout(() => {
      document.title = step ? `${step.title} · ${course.title}` : course.title;
    }, 150);
    return () => {
      clearTimeout(t);
      document.title = "FreeCodeLearn";
    };
  }, [step, course.title]);

  const markDone = useCallback(
    (id: string, status: "done" | "passed" | "correct"): boolean => {
      setProgress((prev) => {
        const next = { ...prev, [id]: status };
        saveProgress(course.id, next);
        return next;
      });
      // 章节完成检测:本步完成后,若所在章节全部完成且还有下一章 → 章节完成横幅
      const chapter = course.chapters.find((c) =>
        c.steps.some((s) => s.id === id)
      );
      if (!chapter) return false;
      const allDone = chapter.steps.every(
        (s) => progress[s.id] || s.id === id
      );
      if (!allDone) return false;
      const ci = course.chapters.indexOf(chapter);
      const nextChapter = course.chapters[ci + 1];
      const firstOfNext = nextChapter?.steps[0];
      if (!firstOfNext) return false;
      setPassedFlash(false);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      setChapterFlash({ title: nextChapter.title, nextId: firstOfNext.id });
      flashTimerRef.current = setTimeout(() => {
        setChapterFlash(null);
        goTo(firstOfNext.id);
      }, 2500);
      return true;
    },
    [course, progress]
  );

  const unmark = useCallback(
    (id: string) => {
      setProgress((prev) => {
        const next = { ...prev };
        delete next[id];
        saveProgress(course.id, next);
        return next;
      });
    },
    [course.id]
  );

  function goTo(id: string) {
    setCurrentId(id);
    setPassedFlash(false);
    setChapterFlash(null);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function jumpChapter() {
    if (!chapterFlash) return;
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    const { nextId } = chapterFlash;
    setChapterFlash(null);
    goTo(nextId);
  }

  // 通过后:标记完成 → 显示成功横幅 → 2 秒后自动进入下一步(可手动立即进入)
  function handlePassed(status: "passed" | "correct") {
    const chapterDone = markDone(step?.id ?? currentId, status);
    // 章末步完成:markDone 已接管(章节横幅 + 2500ms 后跳转),不再抢定时器
    if (chapterDone) return;
    if (!next) return;
    setPassedFlash(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      setPassedFlash(false);
      goTo(next);
    }, 2000);
  }

  function jumpNext() {
    if (!next) return;
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setPassedFlash(false);
    goTo(next);
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
      {mobileNav && (
        <div
          className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNav(false)}
        />
      )}
      <CourseSidebar
        course={course}
        currentStepId={currentId}
        progress={progress}
        onNavigate={(id) => {
          goTo(id);
          setMobileNav(false);
        }}
        onClearProgress={clearAllProgress}
        className={`fixed inset-y-0 left-0 z-40 -translate-x-full transition-transform duration-300 lg:static lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 ${
          mobileNav ? "translate-x-0" : ""
        }`}
      />
      <div className="min-w-0 flex-1">
        {/* 进度条 */}
        <div className="border-b border-line bg-card/70 px-6 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-4">
            <button
              onClick={() => setMobileNav(true)}
              className="shrink-0 rounded-lg border border-line p-1.5 text-ink-soft transition hover:bg-bg-subtle hover:text-ink lg:hidden"
              aria-label="打开课程目录"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <Link
              href="/"
              className="hidden shrink-0 rounded-lg border border-line p-1.5 text-ink-soft transition hover:bg-bg-subtle hover:text-ink lg:hidden"
              aria-label="返回课程列表"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </Link>
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
              <span className="flex items-center gap-1.5">
                <span className="rounded-full border border-green/30 bg-green-soft px-2.5 py-0.5 text-xs font-medium text-green">
                  ✓ 已完成
                </span>
                <button
                  onClick={() => unmark(step.id)}
                  className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
                  title="撤销完成状态,重新学习"
                >
                  标记为未完成
                </button>
              </span>
            )}
          </div>

          {/* 通过成功横幅 */}
          {passedFlash && next && (
            <div className="fade-up mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-green/30 bg-green-soft px-5 py-4">
              <span className="text-sm font-semibold text-green">
                ✓ 全部通过!即将进入下一步
              </span>
              <button
                onClick={jumpNext}
                className="rounded-xl bg-green px-5 py-2 text-sm font-semibold text-white transition hover:bg-green-700"
              >
                进入下一步 →
              </button>
            </div>
          )}

          {/* 章节完成横幅 */}
          {chapterFlash && (
            <div className="fade-up mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent-soft px-5 py-4">
              <span className="text-sm font-semibold text-accent">
                🎉 本章完成!即将进入下一章《{chapterFlash.title}》
              </span>
              <button
                onClick={jumpChapter}
                className="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                进入下一章 →
              </button>
            </div>
          )}
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
                seedBefore={step.seedBefore}
                seedAfter={step.seedAfter}
                onPassed={() => handlePassed("passed")}
              />
              {!step.tests && (
                <button
                  onClick={() => {
                    const chapterDone = markDone(step.id, "done");
                    if (next && !chapterDone)
                      window.setTimeout(() => goTo(next), 700);
                  }}
                  className="mt-4 rounded-xl border border-line px-4 py-2 text-sm text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
                >
                  {next ? "完成本节,继续 →" : "标记为已完成"}
                </button>
              )}
            </div>
          )}

          {step.type === "quiz" &&
            (step.questions && step.questions.length > 0 ? (
              <QuizView
                questions={step.questions}
                onComplete={() => handlePassed("correct")}
              />
            ) : (
              <button
                onClick={() => {
                  const chapterDone = markDone(step.id, "done");
                  if (next && !chapterDone)
                    window.setTimeout(() => goTo(next), 700);
                }}
                className="rounded-xl border border-line px-4 py-2 text-sm text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
              >
                {next ? "完成本节,继续 →" : "标记为已完成"}
              </button>
            ))}

          {step.type === "lesson" && (
            <button
              onClick={() => {
                const chapterDone = markDone(step.id, "done");
                if (next && !chapterDone)
                  window.setTimeout(() => goTo(next), 700);
              }}
              className="rounded-xl border border-line px-4 py-2 text-sm text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
            >
              {next ? "完成本节,继续 →" : "标记为已完成"}
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

          {/* 追加章节 */}
          <div className="mt-10 rounded-2xl border border-dashed border-line p-6">
            <h3 className="font-serif text-base font-bold">扩展课程</h3>
            <p className="mt-1 text-xs text-ink-soft">
              由 AI 为这门课程追加一个全新章节(3-5 个步骤)
            </p>
            <form
              className="mt-3 flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!appendTitle.trim() || appending) return;
                setAppending(true);
                setAppendMsg("");
                try {
                  const res = await fetch(`/api/courses/${course.id}/chapters`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title: appendTitle.trim() }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error ?? "追加失败");
                  setAppendMsg("章节已追加,刷新中...");
                  window.location.reload();
                } catch (err) {
                  setAppendMsg(err instanceof Error ? err.message : "追加失败");
                } finally {
                  setAppending(false);
                }
              }}
            >
              <input
                value={appendTitle}
                onChange={(e) => setAppendTitle(e.target.value)}
                placeholder="新章节标题,例如:高阶技巧"
                className="flex-1 rounded-xl border border-line bg-bg px-4 py-2.5 text-sm outline-none transition focus:border-accent"
              />
              <button
                type="submit"
                disabled={appending || !appendTitle.trim()}
                className="shrink-0 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {appending ? "生成中..." : "追加章节"}
              </button>
            </form>
            {appendMsg && <p className="mt-2 text-xs text-ink-soft">{appendMsg}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
