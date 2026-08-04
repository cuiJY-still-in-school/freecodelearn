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
  const [goal, setGoal] = useState("");
  const [extra, setExtra] = useState("");
  const [formError, setFormError] = useState("");

  // 定制化:参考文档 + 参考课程
  const [refDoc, setRefDoc] = useState<{ name: string; text: string } | null>(null);
  const [refDocError, setRefDocError] = useState("");
  const [refCourseId, setRefCourseId] = useState("");
  const [refCourseSummary, setRefCourseSummary] = useState("");

  // 流程
  const [phase, setPhase] = useState<"input" | "researching" | "preview" | "generating" | "done">("input");
  const [outline, setOutline] = useState<CourseOutline | null>(null);
  const [generating, setGenerating] = useState(false);
  const [chapterStates, setChapterStates] = useState<ChapterState[]>([]);
  const [researchNote, setResearchNote] = useState("");

  // 联网检索阶段的轮转文案
  const RESEARCH_MSGS = [
    "正在分析主题与知识点...",
    "正在制定资料查询计划...",
    "正在联网查找资料...",
    "正在整理资料要点...",
  ];
  const [researchMsgIdx, setResearchMsgIdx] = useState(0);
  useEffect(() => {
    if (phase !== "researching") return;
    const t = window.setInterval(
      () => setResearchMsgIdx((i) => (i + 1) % RESEARCH_MSGS.length),
      6000
    );
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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
    // ① 联网检索资料(AI 制定查询计划 + Bing 抓取,失败则跳过,不阻塞)
    setPhase("researching");
    setResearchNote("");
    let notes = "";
    try {
      const rr = await fetch("/api/ai/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          goal: goal.trim() || undefined,
        }),
      });
      const rd = await rr.json().catch(() => null);
      notes = rd?.notes ?? "";
    } catch {
      // 检索失败:继续走纯 AI 生成
    }
    setResearchNote(notes);

    // ② 生成大纲
    const res = await fetch("/api/ai/outline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        level,
        goal: goal.trim() || undefined,
        description: extra || undefined,
        researchNotes: notes || undefined,
        referenceDoc: refDoc?.text,
        referenceCourse: refCourseSummary || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "大纲生成失败");
    setOutline(data);
    // 进入大纲确认:先看 AI 理解的主题与章节结构,确认后再生成全部章节
    setPhase("preview");
  }

  // 参考课程:拉取详情,构造结构摘要供 AI 模仿
  async function selectRefCourse(id: string) {
    setRefCourseId(id);
    setRefCourseSummary("");
    if (!id) return;
    try {
      const res = await fetch(`/api/courses/${id}`);
      const c = await res.json();
      const summary = [
        `标题:${c.title}`,
        `语言:${c.language} · 难度:${c.level}`,
        ...(c.chapters ?? []).map(
          (ch: { title: string; steps: { title: string; type: string }[] }, i: number) =>
            `第${i + 1}章《${ch.title}》(${ch.steps.length} 步):` +
            ch.steps.map((s) => `${s.title}[${s.type}]`).join("、")
        ),
      ].join("\n");
      setRefCourseSummary(summary.slice(0, 6000));
    } catch {
      setRefCourseId("");
      setFormError("读取参考课程失败,请重试");
    }
  }

  // 参考文档:读取文本(支持 txt/md/json 与常见代码文件)
  async function loadRefDoc(f: File) {
    setRefDocError("");
    if (!/\.(txt|md|json|js|ts|py|html|css|sql|csv|yml|yaml|sh|go|rs|java|c|cpp)$/i.test(f.name)) {
      setRefDocError("暂不支持该文件类型,请使用 txt / md / 代码文件");
      return;
    }
    if (f.size > 512 * 1024) {
      setRefDocError("文件过大(限 512KB),请截取核心内容后重试");
      return;
    }
    try {
      const text = await f.text();
      setRefDoc({ name: f.name, text: text.slice(0, 30000) });
    } catch {
      setRefDocError("读取文件失败,请重试");
    }
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
    setFormError("");
    assemblingRef.current = false;
    setPhase("generating");
    const states = outlineData.chapters.map(() => ({ status: "working" as const }));
    setChapterStates(states);

    await Promise.all(
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
        } catch (err) {
          const msg = err instanceof Error ? err.message : "生成失败";
          setChapterStates((prev) =>
            prev.map((s, si) => (si === i ? { status: "error", error: msg } : s))
          );
        }
      })
    );
    // 保存与跳转由下面的 useEffect 统一处理(含重试后全部成功的场景)
  }

  // 全部章节就绪后自动组装保存(首轮生成与章节重试共用此路径)
  const assemblingRef = useRef(false);
  const allDone = chapterStates.every((s) => s.status === "done");
  useEffect(() => {
    if (phase !== "generating" || !outline || !allDone || chapterStates.length === 0) return;
    if (assemblingRef.current) return;
    assemblingRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/ai/assemble", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outline,
            chapters: chapterStates.map((s) => s.steps),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "保存失败");
        setPhase("done");
        await refreshCourses();
        router.push(`/courses/${data.id}`);
      } catch (err) {
        // 保存失败:允许再次触发,并回到大纲确认页让错误可见
        assemblingRef.current = false;
        setFormError(err instanceof Error ? err.message : "课程保存失败");
        setPhase("preview");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, outline, allDone, chapterStates]);

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
    localStorage.removeItem(`fcl-progress-${id}`);
    await fetch("/api/courses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await refreshCourses();
  }

  const failedCount = chapterStates.filter((s) => s.status === "error").length;
  const doneCount = chapterStates.filter((s) => s.status === "done").length;
  const totalCount = chapterStates.length;

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
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="学习目标(可选):希望学完后达到什么水平?如「能独立写出爬虫」—— AI 会据此决定课程章节数"
            className="mb-5 w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm outline-none transition focus:border-accent"
          />
          <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="max-w-[12rem]">
              <label className="mb-1 block text-sm text-ink-soft">难度</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as typeof level)}
                className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none transition focus:border-accent"
              >
                <option value="beginner">入门</option>
                <option value="intermediate">进阶</option>
                <option value="advanced">高级</option>
              </select>
            </div>
          </div>
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="补充说明(可选):希望侧重什么、包含哪些知识点..."
            className="mb-5 w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm outline-none transition focus:border-accent"
          />

          {/* 定制化:参考课程 + 参考文档 */}
          <div className="mb-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-soft">
                参考课程(可选)
              </label>
              <select
                value={refCourseId}
                onChange={(e) => selectRefCourse(e.target.value)}
                className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm outline-none transition focus:border-accent"
              >
                <option value="">不参考,全新设计</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              {refCourseSummary && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
                  已加载参考结构:{refCourseSummary.split("\n")[0]} ·
                  {refCourseSummary.split("\n").slice(2).length} 章 —— 新课程将模仿其结构
                  与步骤粒度
                </p>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-soft">
                参考文档(可选)
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-line bg-bg px-3 py-2.5 text-sm transition hover:border-accent/50">
                <span className="truncate text-ink-soft">
                  {refDoc ? `📄 ${refDoc.name}` : "上传文档供 AI 参考(txt / md / 代码)"}
                </span>
                <input
                  type="file"
                  accept=".txt,.md,.json,.js,.ts,.py,.html,.css,.sql,.csv,.yml,.yaml,.sh,.go,.rs,.java,.c,.cpp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) loadRefDoc(f);
                    e.target.value = "";
                  }}
                />
              </label>
              {refDoc && (
                <button
                  type="button"
                  onClick={() => setRefDoc(null)}
                  className="mt-1.5 text-[11px] text-red transition hover:text-red-700"
                >
                  移除文档
                </button>
              )}
              {refDocError && (
                <p className="mt-1.5 text-[11px] text-red">{refDocError}</p>
              )}
            </div>
          </div>
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
            输入主题即可,编程语言由 AI 自动判断 —— 生成前 AI 会先联网检索资料,再定制课程
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

      {/* 联网检索阶段 */}
      {phase === "researching" && (
        <div className="fade-up mx-auto max-w-2xl rounded-2xl border border-line bg-card p-10 shadow-sm">
          <div className="flex items-start gap-4">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            </span>
            <div className="min-w-0">
              <h3 className="font-serif text-lg font-bold text-ink">
                正在准备《{topic}》的资料
              </h3>
              <p className="mt-1 text-sm text-ink-soft">{RESEARCH_MSGS[researchMsgIdx]}</p>
              <p className="mt-2 text-xs text-ink-soft/70">
                AI 会先联网查找相关知识点与最佳实践,再据此设计课程,内容更准确、不过时
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-2">
            {RESEARCH_MSGS.map((m, i) => (
              <div key={m} className="flex items-center gap-2 text-xs">
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                    i < researchMsgIdx
                      ? "bg-green-soft text-green"
                      : i === researchMsgIdx
                        ? "bg-accent-soft text-accent"
                        : "bg-bg-subtle text-ink-soft/50"
                  }`}
                >
                  {i < researchMsgIdx ? "✓" : i === researchMsgIdx ? "●" : "○"}
                </span>
                <span
                  className={
                    i === researchMsgIdx ? "text-ink" : i < researchMsgIdx ? "text-ink-soft" : "text-ink-soft/50"
                  }
                >
                  {m}
                </span>
              </div>
            ))}
          </div>
        </div>
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
            <div className="mt-3 flex flex-wrap gap-2">
              {researchNote && (
                <span className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-[11px] text-accent">
                  🔍 已联网检索资料并应用于课程设计
                </span>
              )}
              {goal.trim() && (
                <span className="rounded-full border border-line bg-bg-subtle px-2.5 py-0.5 text-[11px] text-ink-soft">
                  🎯 目标:{goal.trim().slice(0, 40)}
                  {goal.trim().length > 40 ? "…" : ""}
                </span>
              )}
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
              {formError && (
                <div className="mb-4 w-full rounded-xl border border-red-200 bg-red-soft px-4 py-3 text-sm text-red">
                  {formError}
                </div>
              )}
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
                  assemblingRef.current = false;
                  setOutline(null);
                  setPhase("input");
                }}
                className="rounded-xl border border-line px-4 py-2 text-xs font-medium text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
              >
                ← 放弃,返回修改
              </button>
            )}
          </div>

          {/* 总进度 */}
          <div className="mb-6 rounded-2xl border border-line bg-card p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-ink">课程完成进度</span>
              <span className="text-ink-soft">
                {doneCount}/{totalCount} 章
                {failedCount > 0 && (
                  <span className="ml-2 text-red">{failedCount} 章失败</span>
                )}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{
                  width: `${totalCount ? (doneCount / totalCount) * 100 : 0}%`,
                }}
              />
            </div>
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
                  {pct >= 100 ? (
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
