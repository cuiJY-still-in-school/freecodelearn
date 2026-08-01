"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CourseMeta } from "@/lib/store";
import type { CourseOutline } from "@/lib/ai";
import type { Step } from "@/lib/types";
import { loadProgress } from "@/lib/progress";

const LEVEL_LABEL: Record<string, string> = {
  beginner: "入门",
  intermediate: "进阶",
  advanced: "高级",
};

const STEP_TYPE_LABEL: Record<string, { label: string; cls: string; icon: string }> = {
  lesson: { label: "讲解", cls: "bg-blue-50 text-blue-700 border-blue-200", icon: "📖" },
  challenge: { label: "挑战", cls: "bg-purple-50 text-purple-700 border-purple-200", icon: "⌘" },
  quiz: { label: "测验", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: "✓" },
};

interface ChapterState {
  status: "pending" | "working" | "done" | "error";
  steps?: Step[];
  error?: string;
}

export default function HomePage() {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseMeta[]>([]);
  const [loading, setLoading] = useState(true);

  // 表单
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [language, setLanguage] = useState("JavaScript");
  const [chapters, setChapters] = useState(4);
  const [extra, setExtra] = useState("");
  const [formError, setFormError] = useState("");

  // 流程
  const [phase, setPhase] = useState<"input" | "outline" | "generating" | "done">("input");
  const [outline, setOutline] = useState<CourseOutline | null>(null);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [chapterStates, setChapterStates] = useState<ChapterState[]>([]);

  useEffect(() => {
    fetch("/api/courses")
      .then((r) => r.json())
      .then((data) => {
        setCourses(data);
        setLoading(false);
      });
  }, []);

  async function refreshCourses() {
    const res = await fetch("/api/courses");
    setCourses(await res.json());
  }

  async function generateOutline(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setOutlineLoading(true);
    try {
      const res = await fetch("/api/ai/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, level, language, chapters, description: extra || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "大纲生成失败");
      setOutline(data);
      setChapterStates(data.chapters.map(() => ({ status: "pending" })));
      setPhase("outline");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "大纲生成失败");
    } finally {
      setOutlineLoading(false);
    }
  }

  async function generateAll() {
    if (!outline) return;
    setPhase("generating");
    const states = outline.chapters.map(() => ({ status: "working" as const }));
    setChapterStates(states);

    const results = await Promise.all(
      outline.chapters.map(async (_, i) => {
        try {
          const res = await fetch("/api/ai/chapter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ outline, chapterIndex: i }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "生成失败");
          setChapterStates((prev) =>
            prev.map((s, si) => (si === i ? { status: "done", steps: data.steps } : s))
          );
          return data.steps as Step[];
        } catch (err) {
          const msg = err instanceof Error ? err.message : "生成失败";
          setChapterStates((prev) =>
            prev.map((s, si) => (si === i ? { status: "error", error: msg } : s))
          );
          return null;
        }
      })
    );

    if (results.every((r) => r !== null)) {
      try {
        const res = await fetch("/api/ai/assemble", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outline, chapters: results }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "保存失败");
        setPhase("done");
        await refreshCourses();
        router.push(`/courses/${data.id}`);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "课程保存失败");
      }
    }
  }

  async function retryChapter(i: number) {
    if (!outline) return;
    setChapterStates((prev) => prev.map((s, si) => (si === i ? { status: "working" } : s)));
    try {
      const res = await fetch("/api/ai/chapter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outline, chapterIndex: i }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成失败");
      setChapterStates((prev) =>
        prev.map((s, si) => (si === i ? { status: "done", steps: data.steps } : s))
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "生成失败";
      setChapterStates((prev) =>
        prev.map((s, si) => (si === i ? { status: "error", error: msg } : s))
      );
    }
  }

  async function deleteCourse(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("确定删除这门课程?进度也会一并清除。")) return;
    await fetch("/api/courses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await refreshCourses();
  }

  const allDone = chapterStates.every((s) => s.status === "done");
  const failedCount = chapterStates.filter((s) => s.status === "error").length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      {/* Hero */}
      <section className="mb-12 text-center">
        <h1 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">
          输入主题,生成一门
          <br className="sm:hidden" />{" "}
          <span className="text-accent">值得学习的课程</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-ink-soft">
          图文章节、代码挑战、自动判题与测验,几分钟内获得一门
          freeCodeCamp 风格的完整课程
        </p>
      </section>

      {/* 生成流程 */}
      {phase === "input" && (
        <form
          onSubmit={generateOutline}
          className="fade-up mx-auto max-w-2xl rounded-2xl border border-line bg-card p-8 shadow-sm"
        >
          <label className="mb-1.5 block text-sm font-medium text-ink">
            想学什么?
          </label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="例如:JavaScript 数组方法、Python 爬虫入门、Git 与 GitHub"
            className="mb-5 w-full rounded-xl border border-line bg-bg px-4 py-3 text-[15px] outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            required
          />
          <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[
              { label: "难度", value: level, set: (v: string) => setLevel(v as typeof level), options: [["beginner", "入门"], ["intermediate", "进阶"], ["advanced", "高级"]] },
              { label: "语言", value: language, set: setLanguage, options: ["JavaScript", "Python", "TypeScript", "Java", "Go", "Rust", "HTML/CSS", "SQL", "Shell"].map((l) => [l, l]) },
              { label: "章节数", value: String(chapters), set: (v: string) => setChapters(Number(v)), options: [["3", "3 章"], ["4", "4 章"], ["5", "5 章"], ["6", "6 章"]] },
            ].map((f) => (
              <div key={f.label}>
                <label className="mb-1 block text-sm text-ink-soft">{f.label}</label>
                <select
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none transition focus:border-accent"
                >
                  {(f.options as [string, string][]).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="补充说明(可选):希望侧重什么、包含哪些知识点..."
            className="mb-5 w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm outline-none transition focus:border-accent"
          />
          {formError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-soft px-4 py-3 text-sm text-red">
              {formError}
            </div>
          )}
          <button
            type="submit"
            disabled={outlineLoading || !topic.trim()}
            className="w-full rounded-xl bg-ink py-3 text-[15px] font-semibold text-bg transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {outlineLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-bg/30 border-t-bg" />
                正在设计课程大纲...
              </span>
            ) : (
              "生成课程大纲"
            )}
          </button>
          <p className="mt-3 text-center text-xs text-ink-soft">
            先设计大纲,确认后再生成完整内容 —— 生成进度一目了然
          </p>
        </form>
      )}

      {/* 大纲预览 */}
      {phase === "outline" && outline && (
        <div className="fade-up mx-auto max-w-3xl">
          <div className="mb-6 rounded-2xl border border-line bg-card p-6 shadow-sm">
            <div className="mb-1 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-serif text-2xl font-bold">{outline.title}</h2>
                <p className="mt-1 text-sm text-ink-soft">{outline.description}</p>
              </div>
              <span className="shrink-0 rounded-full border border-line bg-bg-subtle px-3 py-1 text-xs text-ink-soft">
                {LEVEL_LABEL[outline.level]} · {outline.language} · 约{" "}
                {outline.estimatedMinutes} 分钟
              </span>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={generateAll}
                className="rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-bg transition hover:bg-accent"
              >
                开始生成完整内容
              </button>
              <button
                onClick={() => setPhase("input")}
                className="rounded-xl border border-line px-5 py-2.5 text-sm text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
              >
                重新设计
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {outline.chapters.map((c, ci) => (
              <div
                key={ci}
                className="rounded-2xl border border-line bg-card p-5 shadow-sm"
              >
                <h3 className="mb-2 font-serif text-lg font-bold">
                  {ci + 1}. {c.title}
                </h3>
                <p className="mb-3 text-xs text-ink-soft">{c.description}</p>
                <div className="flex flex-wrap gap-2">
                  {c.steps.map((s, si) => {
                    const meta = STEP_TYPE_LABEL[s.type];
                    return (
                      <span
                        key={si}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${meta.cls}`}
                        title={s.brief}
                      >
                        <span>{meta.icon}</span>
                        {s.title}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 并行生成 */}
      {phase === "generating" && outline && (
        <div className="fade-up mx-auto max-w-3xl">
          <h2 className="mb-1 font-serif text-2xl font-bold">
            {allDone ? "课程生成完成" : "正在编写《" + outline.title + "》"}
          </h2>
          <p className="mb-6 text-sm text-ink-soft">
            {allDone
              ? "所有章节已完成,正在保存..."
              : failedCount > 0
                ? `${failedCount} 章生成失败,可单独重试`
                : "各章节并行生成中,通常 1-2 分钟"}
          </p>

          <div className="space-y-3">
            {outline.chapters.map((c, ci) => {
              const st = chapterStates[ci];
              return (
                <div
                  key={ci}
                  className="rounded-2xl border border-line bg-card p-5 shadow-sm transition"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-serif text-lg font-bold">
                      {ci + 1}. {c.title}
                    </h3>
                    <div className="flex items-center gap-2">
                      {st.status === "working" && (
                        <span className="flex items-center gap-1.5 text-xs text-ink-soft">
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                          编写中...
                        </span>
                      )}
                      {st.status === "done" && (
                        <span className="pop rounded-full bg-green-soft px-3 py-1 text-xs font-medium text-green">
                          ✓ {st.steps?.length} 个步骤
                        </span>
                      )}
                      {st.status === "error" && (
                        <button
                          onClick={() => retryChapter(ci)}
                          className="rounded-full border border-red-200 bg-red-soft px-3 py-1 text-xs font-medium text-red transition hover:bg-red/10"
                        >
                          ↻ 重试
                        </button>
                      )}
                      {st.status === "pending" && (
                        <span className="text-xs text-ink-soft">等待中</span>
                      )}
                    </div>
                  </div>
                  {st.status === "error" && st.error && (
                    <p className="mt-2 text-xs text-red">{st.error}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {c.steps.map((s, si) => (
                      <span
                        key={si}
                        className={`h-1.5 rounded-full transition-all duration-500 ${
                          st.status === "done"
                            ? "w-6 bg-green/60"
                            : st.status === "working"
                              ? "pulse-dot w-6 bg-accent/40"
                              : "w-6 bg-line"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 课程列表 */}
      <section className="mt-16">
        <h2 className="mb-5 font-serif text-2xl font-bold">课程列表</h2>
        {loading ? (
          <p className="text-ink-soft">加载中...</p>
        ) : courses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-card/50 p-14 text-center text-ink-soft">
            还没有课程 —— 从上面输入一个主题开始
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => {
              const prog = loadProgress(c.id);
              const done = Object.values(prog).filter(Boolean).length;
              const pct = c.stepCount
                ? Math.min(100, Math.round((done / c.stepCount) * 100))
                : 0;
              return (
              <Link
                key={c.id}
                href={`/courses/${c.id}`}
                className="group relative rounded-2xl border border-line bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
              >
                <button
                  onClick={(e) => deleteCourse(c.id, e)}
                  className="absolute right-3 top-3 rounded-lg p-1.5 text-ink-soft opacity-0 transition hover:bg-red-soft hover:text-red group-hover:opacity-100"
                  title="删除课程"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                </button>
                <div className="mb-3 flex items-center gap-2">
                  <span className="rounded-full border border-line bg-bg-subtle px-2.5 py-0.5 text-xs text-ink-soft">
                    {LEVEL_LABEL[c.level]}
                  </span>
                  <span className="text-xs text-ink-soft">
                    {c.chapterCount} 章 · {c.stepCount} 步
                  </span>
                </div>
                <h3 className="font-serif text-lg font-bold transition group-hover:text-accent">
                  {c.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-sm text-ink-soft">
                  {c.description}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-ink-soft">
                  <span>{c.language}</span>
                  <span>约 {c.estimatedMinutes} 分钟</span>
                </div>
                {pct > 0 && (
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-ink-soft">
                      {pct}%
                    </span>
                  </div>
                )}
              </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
