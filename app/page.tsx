"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CourseMeta } from "@/lib/store";
import { loadProgress } from "@/lib/progress";
import {
  streakDays,
  todaySteps,
  totalSteps,
} from "@/lib/activity";
import ChatGenerator from "@/components/chat-generator";

const LEVEL_LABEL: Record<string, string> = {
  beginner: "入门",
  intermediate: "进阶",
  advanced: "高级",
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

export default function HomePage() {

  const router = useRouter();
  const [courses, setCourses] = useState<CourseMeta[]>([]);
  const [loading, setLoading] = useState(true);
  // 课程列表搜索
  const [courseQuery, setCourseQuery] = useState("");
  // 筛选:语言 / 难度
  const [langFilter, setLangFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  // 排序方式:newest | progress | title
  const [courseSort, setCourseSort] = useState("newest");

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

  // 课程列表加载失败展示与重试
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch("/api/courses")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setCourses(data);
        setLoading(false);
        setLoadError(false);
      })
      .catch(() => {
        setLoading(false);
        setLoadError(true);
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
    // 配置成功回跳:显示成功横幅、清理 URL
    if (window.location.search.includes("configured=1")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 一次性 URL 回跳提示,非级联更新
      setConfiguredFlash(true);
      window.history.replaceState({}, "", "/");
    }
  }, [router]);

  async function refreshCourses() {
    try {
      const res = await fetch("/api/courses");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCourses(await res.json());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }

  // 聊天生成完成:刷新列表并进入课程
  function handleCourseCreated(id: string) {
    void refreshCourses();
    router.push(`/courses/${id}`);
  }

  async function deleteCourse(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("确定删除这门课程?进度也会一并清除。")) return;
    try {
      localStorage.removeItem(`fcl-progress-${id}`);
      // 一并清理该课程的复习调度与浏览位置残留
      localStorage.removeItem(`fcl-review-${id}`);
      localStorage.removeItem(`fcl-view-${id}`);
      const res = await fetch("/api/courses", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refreshCourses();
    } catch {
      setNotice("删除失败,请重试");
    }
  }

  async function renameCourse(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const c = courses.find((x) => x.id === id);
    if (!c) return;
    const title = prompt("重命名课程:", c.title);
    if (title === null) return;
    if (!title.trim()) {
      setNotice("课程名不能为空");
      return;
    }
    try {
      const res = await fetch("/api/courses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refreshCourses();
      setNotice("已重命名");
    } catch {
      setNotice("重命名失败,请重试");
    }
  }

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
        <div className="fade-up mx-auto mb-8 flex max-w-2xl items-center justify-between gap-4 rounded-2xl border border-amber/40 bg-amber-soft px-5 py-4">
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
          和 AI 聊聊你想学什么,
          <br className="sm:hidden" />{" "}
          <span className="text-accent">生成值得学习的课程</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-ink-soft">
          描述你想要的效果,AI 替你选择技术栈并规划课程;
          <br className="hidden sm:block" />
          图文章节、代码挑战、自动判题与测验,几分钟内获得一门
          freeCodeCamp 风格的完整课程
        </p>
      </section>

      {/* 聊天式课程生成 */}
      <ChatGenerator
        courseList={courses.map((c) => ({ id: c.id, title: c.title }))}
        onCourseCreated={handleCourseCreated}
      />

      {/* 学习统计 */}
      {(() => {
        const today = todaySteps();
        const streak = streakDays();
        const total = totalSteps();
        return (
          <section className="mt-10">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-line bg-card p-4">
                <p className="text-xs text-ink-soft">今日完成</p>
                <p className="mt-1 font-serif text-2xl font-bold text-accent">{today} <span className="text-sm font-normal text-ink-soft">步</span></p>
              </div>
              <div className="rounded-2xl border border-line bg-card p-4">
                <p className="text-xs text-ink-soft">连续学习</p>
                <p className="mt-1 font-serif text-2xl font-bold text-accent">{streak} <span className="text-sm font-normal text-ink-soft">天</span></p>
              </div>
              <div className="rounded-2xl border border-line bg-card p-4">
                <p className="text-xs text-ink-soft">累计完成</p>
                <p className="mt-1 font-serif text-2xl font-bold text-accent">{total} <span className="text-sm font-normal text-ink-soft">步</span></p>
              </div>
            </div>
          </section>
        );
      })()}

      {/* 课程列表 */}
      <section className="mt-16">
        {(() => {
          const languages = Array.from(
            new Set(courses.map((c) => c.language || "").filter(Boolean))
          ).sort((a, b) => a.localeCompare(b, "zh"));
          const LEVELS: { key: string; label: string }[] = [
            { key: "beginner", label: "入门" },
            { key: "intermediate", label: "进阶" },
            { key: "advanced", label: "高级" },
          ];
          const courseRows = courses
            .map((c) => ({
              c,
              done: Object.values(loadProgress(c.id)).filter(Boolean).length,
            }))
            .filter(({ c }) => {
              const q = courseQuery.trim().toLowerCase();
              if (q && !(c.title.toLowerCase().includes(q) || (c.language ?? "").toLowerCase().includes(q))) return false;
              if (langFilter !== "all" && (c.language || "") !== langFilter) return false;
              if (levelFilter !== "all" && (c.level || "") !== levelFilter) return false;
              return true;
            })
            .sort((x, y) => {
              const doneOf = (r: { c: CourseMeta; done: number }) =>
                r.c.pendingChapters === 0 && r.c.stepCount > 0 && r.done >= r.c.stepCount ? 1 : 0;
              if (courseSort === "title") return x.c.title.localeCompare(y.c.title, "zh");
              if (courseSort === "progress") {
                const xDone = doneOf(x), yDone = doneOf(y);
                if (xDone !== yDone) return xDone - yDone;
                const xPct = x.c.stepCount ? x.done / x.c.stepCount : 0;
                const yPct = y.c.stepCount ? y.done / y.c.stepCount : 0;
                return yPct - xPct;
              }
              const xDone = doneOf(x), yDone = doneOf(y);
              if (xDone !== yDone) return xDone - yDone;
              return y.c.createdAt.localeCompare(x.c.createdAt);
            });
          return (
        <>
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-2xl font-bold">课程列表</h2>
          <div className="flex flex-wrap items-center gap-2">
            {courses.length > 0 && (
              <>
              <input
                value={courseQuery}
                onChange={(e) => setCourseQuery(e.target.value)}
                placeholder="搜索课程 / 语言..."
                aria-label="搜索课程"
                className="w-36 rounded-lg border border-line bg-card px-3 py-1.5 text-xs outline-none transition focus:border-accent"
              />
              <select
                value={langFilter}
                onChange={(e) => setLangFilter(e.target.value)}
                aria-label="按语言筛选"
                className="rounded-lg border border-line bg-card px-2 py-1.5 text-xs outline-none transition focus:border-accent"
              >
                <option value="all">全部语言</option>
                {languages.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                aria-label="按难度筛选"
                className="rounded-lg border border-line bg-card px-2 py-1.5 text-xs outline-none transition focus:border-accent"
              >
                <option value="all">全部难度</option>
                {LEVELS.map((l) => (
                  <option key={l.key} value={l.key}>{l.label}</option>
                ))}
              </select>
              <select
                value={courseSort}
                onChange={(e) => setCourseSort(e.target.value)}
                aria-label="排序方式"
                className="rounded-lg border border-line bg-card px-2 py-1.5 text-xs outline-none transition focus:border-accent"
              >
                <option value="newest">最新创建</option>
                <option value="progress">学习进度</option>
                <option value="title">名称排序</option>
              </select>
              </>
            )}
            {!loading && courses.length > 0 && (
              <span className="text-xs text-ink-soft">
                共 {courses.length} 门
                {(() => {
                  const doneCount = courseRows.filter(
                    (r) =>
                      r.c.pendingChapters === 0 &&
                      r.c.stepCount > 0 &&
                      r.done >= r.c.stepCount
                  ).length;
                  return doneCount > 0 ? ` · 已完成 ${doneCount} 门` : "";
                })()}
              </span>
            )}
          </div>
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
        ) : loadError ? (
          <div className="rounded-2xl border border-dashed border-red/30 bg-card/50 p-10 text-center">
            <span className="text-4xl">⚠️</span>
            <p className="mt-3 font-serif text-lg font-bold">课程列表加载失败</p>
            <p className="mt-1 text-sm text-ink-soft">
              无法读取课程数据,请检查应用状态后重试
            </p>
            <button
              onClick={refreshCourses}
              className="mt-5 rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-bg transition hover:bg-accent"
            >
              重试
            </button>
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
            {courseRows.map(({ c, done }) => {
              const pct = c.stepCount
                ? Math.min(100, Math.round((done / c.stepCount) * 100))
                : 0;
              return (
              <Link
                key={c.id}
                href={`/courses/${c.id}`}
                className="group relative rounded-2xl border border-line bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
              >
                <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100">
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
                    onClick={(e) => renameCourse(c.id, e)}
                    className="rounded-lg p-1.5 text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
                    title="重命名课程"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
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
                  {pct >= 100 && c.pendingChapters === 0 ? (
                    <span className="rounded-full border border-green/30 bg-green-soft px-2.5 py-0.5 text-xs font-medium text-green">
                      ✓ 已完成
                    </span>
                  ) : pct > 0 ? (
                    <span className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
                      继续学习
                    </span>
                  ) : (
                    <span className="rounded-full border border-line bg-bg-subtle px-2.5 py-0.5 text-xs text-ink-soft">
                      {LEVEL_LABEL[c.level]}
                    </span>
                  )}
                  <span className="text-xs text-ink-soft">
                    {c.pendingChapters > 0
                      ? c.generationError
                        ? "章节生成失败 · "
                        : "章节生成中 · "
                      : ""}
                    {c.totalChapters} 章 · {c.stepCount} 步
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
        {courseRows.length === 0 && courses.length > 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-card/50 p-10 text-center">
            <span className="text-4xl">🔍</span>
            <p className="mt-3 font-serif text-lg font-bold">没有匹配的课程</p>
            <p className="mt-1 text-sm text-ink-soft">
              换个关键词试试,或清除搜索
            </p>
            <button
              onClick={() => setCourseQuery("")}
              className="mt-5 rounded-xl border border-line px-5 py-2.5 text-sm font-medium text-ink-soft transition hover:border-accent/50 hover:text-accent"
            >
              清除搜索
            </button>
          </div>
        )}
        </>
        );
        })()}
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

    </div>
  );
}
