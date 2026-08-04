"use client";

import { useEffect, useRef, useState } from "react";
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

const COVER_GRADIENTS = [
  "from-[#f6e7d9] to-[#ecd9c6]",
  "from-[#f0e4d2] to-[#e8cfb8]",
  "from-[#f3e0d8] to-[#e5c9b4]",
  "from-[#efe3cf] to-[#dcc9a8]",
  "from-[#f0e2d3] to-[#d8c0ad]",
  "from-[#f2e6d6] to-[#e2d0ba]",
];

function coverIndex(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % COVER_GRADIENTS.length;
}

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
  const [chapters, setChapters] = useState(4);
  const [extra, setExtra] = useState("");
  const [formError, setFormError] = useState("");

  // 流程
  const [phase, setPhase] = useState<"input" | "preview" | "generating" | "done">("input");
  const [outline, setOutline] = useState<CourseOutline | null>(null);
  const [generating, setGenerating] = useState(false);
  const [chapterStates, setChapterStates] = useState<ChapterState[]>([]);

  // 提示
  const [notice, setNotice] = useState("");

  // 导入
  const [importing, setImporting] = useState(false);

  // AI 配置状态
  const [aiConfigured, setAiConfigured] = useState(true);

  // 配置成功回跳提示(/?configured=1)
  const [configuredFlash, setConfiguredFlash] = useState(
    () => typeof window !== "undefined" && window.location.search.includes("configured=1")
  );
  const topicRef = useRef<HTMLInputElement>(null);

  // 无关主题确认
  const [guardPending, setGuardPending] = useState<{
    topic: string;
    reason: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/courses")
      .then((r) => r.json())
      .then((data) => {
        setCourses(data);
        setLoading(false);
      });
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const configured = Boolean(d?.apiKey);
        setAiConfigured(configured);
        if (!configured && !sessionStorage.getItem("fcl-ai-guide-shown")) {
          sessionStorage.setItem("fcl-ai-guide-shown", "1");
          router.push("/settings?first=1");
        }
      })
      .catch(() => {});
    // 配置成功回跳:显示成功横幅、聚焦输入框、清理 URL
    if (window.location.search.includes("configured=1")) {
      setConfiguredFlash(true);
      window.history.replaceState({}, "", "/");
      window.setTimeout(() => topicRef.current?.focus(), 600);
    }
  }, [router]);

  async function refreshCourses() {
    const res = await fetch("/api/courses");
    setCourses(await res.json());
  }

  async function generateCourse(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setGenerating(true);
    try {
      // 主题相关度把关:无关主题(如烹饪)提示用户,但允许硬生成
      const guardRes = await fetch("/api/ai/guard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const guardData = await guardRes.json().catch(() => null);
      if (guardData && guardData.relevant === false) {
        setGuardPending({ topic, reason: guardData.reason ?? "" });
        return;
      }
      await runGeneration();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "课程生成失败");
      setPhase("input");
    } finally {
      setGenerating(false);
    }
  }

  async function runGeneration() {
    const res = await fetch("/api/ai/outline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, level, chapters, description: extra || undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "大纲生成失败");
    setOutline(data);
    // 进入大纲确认:先看 AI 理解的主题与章节结构,确认后再生成全部章节
    setPhase("preview");
  }

  async function regenerateOutline() {
    setOutline(null);
    setFormError("");
    await runGeneration();
  }

  async function confirmOutline() {
    if (!outline) return;
    await generateAll(outline);
  }

  async function generateAll(outlineData: CourseOutline) {
    setPhase("generating");
    const states = outlineData.chapters.map(() => ({ status: "working" as const }));
    setChapterStates(states);

    const results = await Promise.all(
      outlineData.chapters.map(async (_, i) => {
        try {
          const res = await fetch("/api/ai/chapter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ outline: outlineData, chapterIndex: i }),
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
          body: JSON.stringify({ outline: outlineData, chapters: results }),
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

  // ---------- .fcl 导出 / 导入 ----------

  async function exportCourse(c: CourseMeta) {
    try {
      const res = await fetch(`/api/courses/${c.id}`);
      const data = await res.json();
      const fcl = {
        type: "freecodelearn-course",
        version: 1,
        exportedAt: new Date().toISOString(),
        course: data,
        progress: loadProgress(c.id),
      };
      const blob = new Blob([JSON.stringify(fcl, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${c.title.replace(/[\\/:*?"<>|]/g, "_")}.fcl`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice("已导出 .fcl 文件(含课程与学习进度)");
    } catch {
      setNotice("导出失败");
    }
  }

  async function importCourse(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      // .fcl 打包格式:含 course + progress
      const isFcl =
        data?.type === "freecodelearn-course" && data?.course && data?.progress;
      const coursePayload = isFcl ? data.course : data;
      const progressPayload = isFcl ? data.progress : null;

      const res = await fetch("/api/courses/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coursePayload),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? "导入失败");

      if (progressPayload) {
        const course = await (await fetch(`/api/courses/${out.id}`)).json();
        const keys = new Set(
          (course.chapters ?? []).flatMap((ch: { steps: { id: string }[] }) =>
            (ch.steps ?? []).map((s) => s.id)
          )
        );
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(progressPayload)) {
          if (keys.has(k) && v) clean[k] = String(v);
        }
        localStorage.setItem(`fcl-progress-${out.id}`, JSON.stringify(clean));
      }

      await refreshCourses();
      setNotice(isFcl ? "导入成功,课程与学习进度已恢复" : "课程导入成功!");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "导入失败:文件不是有效的课程文件");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      {/* AI 未配置横幅 */}
      {!aiConfigured && (
        <div className="fade-up mx-auto mb-8 flex max-w-2xl items-center justify-between gap-4 rounded-2xl border border-amber/40 bg-amber-50 px-5 py-4">
          <div className="text-sm text-amber-800">
            <p className="font-semibold">尚未配置 AI 服务,无法生成课程</p>
            <p className="mt-0.5 text-xs text-amber-700/80">
              去设置页填入 Provider / Base URL / API Key 即可开始
            </p>
          </div>
          <Link
            href="/settings"
            className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-700"
          >
            去配置
          </Link>
        </div>
      )}

      {/* 配置成功横幅 */}
      {configuredFlash && (
        <div className="fade-up mx-auto mb-8 flex max-w-2xl items-center justify-between gap-4 rounded-2xl border border-green/30 bg-green-soft px-5 py-4">
          <div className="text-sm text-green">
            <p className="font-semibold">AI 服务配置成功</p>
            <p className="mt-0.5 text-xs text-green/80">
              输入主题,生成你的第一门课程吧
            </p>
          </div>
          <button
            onClick={() => setConfiguredFlash(false)}
            className="shrink-0 rounded-xl bg-green px-4 py-2 text-xs font-semibold text-white transition hover:bg-green-700"
          >
            开始
          </button>
        </div>
      )}

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
          onSubmit={generateCourse}
          id="generate"
          className="fade-up mx-auto max-w-2xl rounded-2xl border border-line bg-card p-8 shadow-sm"
        >
          <label className="mb-1.5 block text-sm font-medium text-ink">
            想学什么?
          </label>
          <input
            ref={topicRef}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="例如:JavaScript 数组方法、Python 爬虫入门、Git 与 GitHub"
            className="mb-5 w-full rounded-xl border border-line bg-bg px-4 py-3 text-[15px] outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            required
          />
          <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[
              { label: "难度", value: level, set: (v: string) => setLevel(v as typeof level), options: [["beginner", "入门"], ["intermediate", "进阶"], ["advanced", "高级"]] },
              { label: "章节数", value: chapters, set: (v: string) => setChapters(Math.max(1, Math.min(12, Number(v) || 4))), options: [["4", "4 章"], ["6", "6 章"], ["8", "8 章"]] },
            ].map((f) => (
              <div key={f.label} className="max-w-[12rem]">
                <label className="mb-1 block text-sm text-ink-soft">{f.label}</label>
                {f.label === "章节数" ? (
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none transition focus:border-accent"
                  />
                ) : (
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
                )}
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
            disabled={generating || !topic.trim()}
            className="w-full rounded-xl bg-ink py-3 text-[15px] font-semibold text-bg transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-bg/30 border-t-bg" />
                正在生成课程...
              </span>
            ) : (
              "生成课程"
            )}
          </button>
          <p className="mt-3 text-center text-xs text-ink-soft">
            输入主题即可,编程语言由 AI 自动判断 —— 生成完成后直接进入学习
          </p>
          <label className="mt-4 block cursor-pointer text-center text-xs text-ink-soft transition hover:text-accent">
            <span className="inline-flex items-center gap-1">
              {importing ? "导入中..." : "⬆ 导入 .fcl 课程"}
            </span>
            <input
              type="file"
              accept=".fcl,.json,application/json"
              className="hidden"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importCourse(f);
                e.target.value = "";
              }}
            />
          </label>
        </form>
      )}

      {/* 大纲确认 */}
      {phase === "preview" && outline && (
        <div className="fade-up mx-auto max-w-3xl">
          <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium tracking-wide text-accent">
                  大纲已生成 · 请确认
                </p>
                <h2 className="mt-1 font-serif text-2xl font-bold">{outline.title}</h2>
                <p className="mt-1 text-sm text-ink-soft">{outline.description}</p>
              </div>
              <span className="shrink-0 rounded-full border border-line bg-bg-subtle px-3 py-1 text-xs text-ink-soft">
                {outline.language} · {outline.chapters.length} 章 · 约{" "}
                {outline.estimatedMinutes} 分钟
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {outline.chapters.map((c, ci) => (
                <div key={ci} className="rounded-xl border border-line bg-bg-subtle/50 p-4">
                  <h3 className="text-sm font-bold text-ink">
                    {ci + 1}. {c.title}
                  </h3>
                  {c.description && (
                    <p className="mt-0.5 text-xs text-ink-soft">{c.description}</p>
                  )}
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

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={confirmOutline}
                className="flex-1 rounded-xl bg-ink py-3 text-sm font-semibold text-bg transition hover:bg-accent"
              >
                确认大纲,开始生成课程 →
              </button>
              <button
                onClick={regenerateOutline}
                className="rounded-xl border border-line px-5 py-3 text-sm font-medium text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
              >
                ↻ 换个大纲
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-ink-soft">
              确认后将并行生成全部章节(通常 1-2 分钟),中途可对失败章节单独重试
            </p>
          </div>
        </div>
      )}

      {/* 并行生成 */}
      {phase === "generating" && outline && (
        <div className="fade-up mx-auto max-w-3xl">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="mb-1 font-serif text-2xl font-bold">
                {allDone ? "课程生成完成" : "正在编写《" + outline.title + "》"}
              </h2>
              <p className="text-sm text-ink-soft">
                {allDone
                  ? "所有章节已完成,正在保存..."
                  : failedCount > 0
                    ? `${failedCount} 章生成失败,可单独重试`
                    : "各章节并行生成中,通常 1-2 分钟"}
              </p>
            </div>
            {failedCount > 0 && (
              <button
                onClick={() => {
                  setOutline(null);
                  setPhase("input");
                }}
                className="rounded-xl border border-line px-4 py-2 text-xs font-medium text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
              >
                ← 放弃,返回修改
              </button>
            )}
          </div>

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
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-2xl font-bold">课程列表</h2>
          {!loading && courses.length > 0 && (
            <span className="text-xs text-ink-soft">
              共 {courses.length} 门
              {(() => {
                const doneCount = courses.filter((c) => {
                  const prog = loadProgress(c.id);
                  const done = Object.values(prog).filter(Boolean).length;
                  return c.stepCount > 0 && done >= c.stepCount;
                }).length;
                return doneCount > 0 ? ` · 已完成 ${doneCount} 门` : "";
              })()}
            </span>
          )}
        </div>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-line bg-card p-5">
                <div className="-mx-5 -mt-5 mb-4 h-16 rounded-t-2xl bg-line/60" />
                <div className="mb-3 h-4 w-24 rounded bg-line/60" />
                <div className="mb-2 h-5 w-3/4 rounded bg-line/60" />
                <div className="h-4 w-full rounded bg-line/40" />
                <div className="mt-4 h-3 w-1/3 rounded bg-line/40" />
              </div>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-card/50 p-10 text-center">
            <span className="text-4xl">📚</span>
            <p className="mt-3 font-serif text-lg font-bold">还没有课程</p>
            <p className="mt-1 text-sm text-ink-soft">
              在上方输入主题一键生成,或导入 .fcl 课程文件
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs">
              <a
                href="#generate"
                className="rounded-xl bg-ink px-5 py-2.5 font-semibold text-bg transition hover:bg-accent"
              >
                去生成课程
              </a>
              <label className="cursor-pointer rounded-xl border border-line px-5 py-2.5 font-medium text-ink-soft transition hover:border-accent/50 hover:text-accent">
                {importing ? "导入中..." : "导入 .fcl 课程"}
                <input
                  type="file"
                  accept=".fcl,.json,application/json"
                  className="hidden"
                  disabled={importing}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importCourse(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <Link
                href="/settings"
                className="rounded-xl border border-line px-5 py-2.5 font-medium text-ink-soft transition hover:border-accent/50 hover:text-accent"
              >
                检查 AI 设置
              </Link>
            </div>
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
                <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      exportCourse(c);
                    }}
                    className="rounded-lg p-1.5 text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
                    title="导出 .fcl(课程+进度)"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => deleteCourse(c.id, e)}
                    className="rounded-lg p-1.5 text-ink-soft transition hover:bg-red-soft hover:text-red"
                    title="删除课程"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    </svg>
                  </button>
                </div>
                <div
                  className={`mb-4 -mx-5 -mt-5 flex h-16 items-end rounded-t-2xl bg-gradient-to-br px-5 pb-2.5 ${COVER_GRADIENTS[coverIndex(c.id)]}`}
                >
                  <span className="font-serif text-3xl font-bold text-ink/25">
                    {c.title.trim().charAt(0)}
                  </span>
                </div>
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

      {notice && (
        <div className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit max-w-md rounded-xl border border-line bg-card px-5 py-3 text-center text-sm text-ink shadow-lg">
          {notice}
          <button
            onClick={() => setNotice("")}
            className="ml-3 text-ink-soft underline underline-offset-2 hover:text-red"
          >
            关闭
          </button>
        </div>
      )}

      {guardPending && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-xl">
            <span className="text-3xl">🍳</span>
            <h3 className="mt-3 font-serif text-xl font-bold text-ink">
              这个主题似乎与编程学习无关
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              「{guardPending.topic}」不太符合本产品的定位(生成编程/技术课程)。
              {guardPending.reason ? `AI 判断:${guardPending.reason}` : ""}
              课程质量可能不达预期,仍要继续生成吗?
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setGuardPending(null)}
                className="flex-1 rounded-xl border border-line py-2.5 text-sm font-medium text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
              >
                换个主题
              </button>
              <button
                onClick={async () => {
                  setGuardPending(null);
                  setGenerating(true);
                  setFormError("");
                  try {
                    await runGeneration();
                  } catch (err) {
                    setFormError(err instanceof Error ? err.message : "课程生成失败");
                    setPhase("input");
                  } finally {
                    setGenerating(false);
                  }
                }}
                className="flex-1 rounded-xl bg-ink py-2.5 text-sm font-semibold text-bg transition hover:bg-accent"
              >
                仍然生成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
