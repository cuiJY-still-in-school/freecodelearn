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

interface AuthUser {
  id: string;
  login: string;
  name: string;
  avatar: string;
}

interface DeviceFlowState {
  userCode: string;
  verificationUri: string;
  deviceCode: string;
  interval: number;
  expiresIn: number;
}

export default function HomePage() {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  // 表单
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [chapters, setChapters] = useState(4);
  const [extra, setExtra] = useState("");
  const [formError, setFormError] = useState("");

  // 流程
  const [phase, setPhase] = useState<"input" | "generating" | "done">("input");
  const [outline, setOutline] = useState<CourseOutline | null>(null);
  const [generating, setGenerating] = useState(false);
  const [chapterStates, setChapterStates] = useState<ChapterState[]>([]);

  // 登录
  const [device, setDevice] = useState<DeviceFlowState | null>(null);
  const [deviceError, setDeviceError] = useState("");
  const [polling, setPolling] = useState(false);

  // 导入
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetch("/api/courses")
      .then((r) => r.json())
      .then((data) => {
        setCourses(data);
        setLoading(false);
      });
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setUser(data.user ?? null));
  }, []);

  async function refreshCourses() {
    const res = await fetch("/api/courses");
    setCourses(await res.json());
  }

  async function generateCourse(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, level, chapters, description: extra || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "大纲生成失败");
      setOutline(data);
      await generateAll(data);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "课程生成失败");
      setPhase("input");
    } finally {
      setGenerating(false);
    }
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

  // ---------- GitHub 登录(Device Flow) ----------

  async function startLogin() {
    setDeviceError("");
    try {
      const res = await fetch("/api/auth/device", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "发起登录失败");
      setDevice(data);
      setPolling(true);
      pollDevice(data);
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : "发起登录失败");
    }
  }

  async function pollDevice(state: DeviceFlowState) {
    const timeout = Date.now() + state.expiresIn * 1000;
    let interval = state.interval * 1000;
    while (Date.now() < timeout) {
      await new Promise((r) => setTimeout(r, interval));
      try {
        const res = await fetch("/api/auth/device/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceCode: state.deviceCode }),
        });
        const data = await res.json();
        if (data.ok && data.user) {
          setUser(data.user);
          setDevice(null);
          setPolling(false);
          return;
        }
        if (data.failed) {
          setDeviceError(data.message ?? "登录失败");
          setDevice(null);
          setPolling(false);
          return;
        }
        if (data.slowDown) interval += 5000;
      } catch {
        // 网络错误,继续轮询
      }
    }
    setDeviceError("授权超时,请重新发起登录");
    setDevice(null);
    setPolling(false);
  }

  async function logout() {
    await fetch("/api/auth/me", { method: "DELETE" });
    setUser(null);
  }

  async function togglePublish(c: CourseMeta) {
    if (!user) {
      setDeviceError("请先登录 GitHub 再发布课程");
      return;
    }
    setFormError("");
    try {
      const res = c.isPublic
        ? await fetch(`/api/courses/${c.id}/publish`, { method: "DELETE" })
        : await fetch(`/api/courses/${c.id}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "操作失败");
      await refreshCourses();
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : "发布失败");
    }
  }

  async function importCourse(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch("/api/courses/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? "导入失败");
      await refreshCourses();
      alert("课程导入成功!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "导入失败:文件不是有效的课程 JSON");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      {/* Hero */}
      <section className="mb-12 text-center">
        <div className="mb-6 flex justify-center">
          {user ? (
            <div className="flex items-center gap-3 rounded-full border border-line bg-card py-1.5 pl-1.5 pr-4 shadow-sm">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.login}
                  className="h-8 w-8 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
                  {user.login.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="text-sm font-medium">{user.name || user.login}</span>
              <button
                onClick={logout}
                className="text-xs text-ink-soft transition hover:text-red"
              >
                退出
              </button>
            </div>
          ) : (
            <button
              onClick={startLogin}
              className="flex items-center gap-2 rounded-full border border-line bg-card px-5 py-2 text-sm font-medium shadow-sm transition hover:border-accent/50 hover:text-accent"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.082-.73.082-.73 1.205.085 1.838 1.237 1.838 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12Z" />
              </svg>
              使用 GitHub 登录
            </button>
          )}
        </div>
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
              {importing ? "导入中..." : "⬆ 导入课程 JSON"}
            </span>
            <input
              type="file"
              accept=".json,application/json"
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
                  {c.isPublic && (
                    <span className="rounded-full bg-green-soft px-2.5 py-0.5 text-xs font-medium text-green">
                      公开
                    </span>
                  )}
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
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    togglePublish(c);
                  }}
                  className={`mt-3 w-full rounded-lg border py-2 text-xs font-medium transition ${
                    c.isPublic
                      ? "border-line text-ink-soft hover:border-red-200 hover:bg-red-soft hover:text-red"
                      : "border-line text-ink-soft hover:border-accent/50 hover:bg-accent/5 hover:text-accent"
                  }`}
                >
                  {c.isPublic
                    ? user?.login === c.ownerLogin
                      ? "取消公开"
                      : "已公开"
                    : "发布到 GitHub"}
                </button>
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

      {/* Device Flow 登录弹窗 */}
      {device && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
          onClick={() => {
            setDevice(null);
            setPolling(false);
          }}
        >
          <div
            className="fade-up w-full max-w-md rounded-2xl border border-line bg-card p-8 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-serif text-xl font-bold">GitHub 登录</h3>
            <p className="mt-2 text-sm text-ink-soft">
              在新窗口打开以下链接,输入设备码完成授权
            </p>
            <a
              href={device.verificationUri}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 block text-lg font-semibold text-accent underline underline-offset-4"
            >
              {device.verificationUri}
            </a>
            <div className="mt-5 rounded-xl border-2 border-dashed border-accent/40 bg-accent/5 py-4">
              <span className="font-mono text-3xl font-bold tracking-[0.3em] text-ink">
                {device.userCode}
              </span>
            </div>
            <p className="mt-4 flex items-center justify-center gap-2 text-sm text-ink-soft">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
              等待授权中...授权后自动进入
            </p>
            <button
              onClick={() => {
                setDevice(null);
                setPolling(false);
              }}
              className="mt-5 rounded-xl border border-line px-5 py-2 text-sm text-ink-soft transition hover:text-red"
            >
              取消
            </button>
          </div>
        </div>
      )}
      {deviceError && (
        <div className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit max-w-md rounded-xl border border-red-200 bg-card px-5 py-3 text-center text-sm text-red shadow-lg">
          {deviceError}
          <button
            onClick={() => setDeviceError("")}
            className="ml-3 text-ink-soft underline underline-offset-2 hover:text-red"
          >
            关闭
          </button>
        </div>
      )}
    </div>
  );
}
