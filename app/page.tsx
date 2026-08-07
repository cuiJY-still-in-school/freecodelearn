"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CourseMeta } from "@/lib/store";
import type { CourseOutline } from "@/lib/types";
import { loadProgress } from "@/lib/progress";
import {
  streakDays,
  todaySteps,
  totalSteps,
} from "@/lib/activity";

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
  const [researchNote, setResearchNote] = useState("");

  // 联网检索阶段的真实进度:计划 → 逐词检索
  const [researchState, setResearchState] = useState<{
    plan: "running" | "done" | "failed";
    queries: string[];
    done: number;
    current: string;
  }>({ plan: "running", queries: [], done: 0, current: "" });

  // 提示
  const [notice, setNotice] = useState("");

  // 生成流程快照:生成中切换页面(设置/刷新)后恢复,不丢进度
  const SNAP_KEY = "fcl-gen-snapshot";
  interface GenSnapshot {
    topic: string;
    level: "beginner" | "intermediate" | "advanced";
    goal: string;
    extra: string;
    refDoc: { name: string; text: string } | null;
    refCourseId: string;
    refCourseSummary: string;
    researchNote: string;
    phase: "researching" | "preview" | "generating" | "done";
    outline: CourseOutline | null;
  }

  // 生成流程中持续快照到 sessionStorage(离开页面组件卸载后,回来可恢复)
  // 注意:phase==="input" 时不删快照——挂载时恢复逻辑可能尚未执行,避免竞态删掉待恢复数据
  const [justRestored, setJustRestored] = useState(false);
  useEffect(() => {
    if (justRestored) {
      // 刚恢复的快照不立即写回,避免每次回首页都被拉回生成流程
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 一次性消费恢复标记,仅复位布尔值,无级联
      setJustRestored(false);
      return;
    }
    if (phase === "input") return;
    if (phase === "done") {
      sessionStorage.removeItem(SNAP_KEY);
      return;
    }
    const snap: GenSnapshot = {
      topic,
      level,
      goal,
      extra,
      refDoc,
      refCourseId,
      refCourseSummary,
      researchNote,
      phase,
      outline,
    };
    try {
      sessionStorage.setItem(SNAP_KEY, JSON.stringify(snap));
    } catch {
      // 快照过大等写入失败:不阻塞主流程
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, outline, researchNote]);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 一次性 URL 回跳提示,非级联更新
      setConfiguredFlash(true);
      window.history.replaceState({}, "", "/");
      window.setTimeout(() => topicRef.current?.focus(), 600);
    }

    // 生成流程快照恢复:生成中去设置页/刷新,回来继续,不丢进度
    try {
      const raw = sessionStorage.getItem(SNAP_KEY);
      if (raw) {
        sessionStorage.removeItem(SNAP_KEY);
        const snap = JSON.parse(raw) as GenSnapshot;
        setTopic(snap.topic);
        setLevel(snap.level);
        setGoal(snap.goal);
        setExtra(snap.extra);
        setRefDoc(snap.refDoc ?? null);
        setRefCourseId(snap.refCourseId);
        setRefCourseSummary(snap.refCourseSummary);
        setResearchNote(snap.researchNote ?? "");
        if (snap.phase === "preview" && snap.outline) {
          setOutline(snap.outline);
          setPhase("preview");
          setJustRestored(true);
        } else if (snap.phase === "researching") {
          // 检索/大纲请求随页面离开中断:恢复后自动重跑;失败则回输入态展示错误,避免卡在转圈
          setPhase("researching");
          setJustRestored(true);
          window.setTimeout(() => {
            runGeneration(snap.topic, snap.level).catch((err: unknown) => {
              setPhase("input");
              setFormError(
                err instanceof Error
                  ? `恢复生成失败:${err.message}`
                  : "恢复生成失败,请重新提交"
              );
            });
          }, 0);
        } else if (snap.phase === "generating" && snap.outline) {
          // 首章生成中断:回到确认页重新确认
          setOutline(snap.outline);
          setPhase("preview");
          setJustRestored(true);
          setFormError(
            "第一章生成因页面切换而中断,确认大纲后将重新生成,后续章节仍会在学习时自动补齐"
          );
        }
        // done:课程已保存,回到输入态,列表可见
      }
    } catch {
      sessionStorage.removeItem(SNAP_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 恢复逻辑只需挂载时执行一次
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

  async function runGeneration(topicArg?: string, levelArg?: typeof level) {
    // ① 联网检索资料:先让 AI 制定查询计划,再逐词抓取(失败则跳过,不阻塞)
    const t = topicArg ?? topic;
    const lv = levelArg ?? level;
    setPhase("researching");
    setResearchNote("");
    setResearchState({ plan: "running", queries: [], done: 0, current: "" });
    let notes = "";
    let plan = { queries: [] as string[], sites: [] as string[] };
    try {
      const pr = await fetch("/api/ai/research/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: t,
          goal: goal.trim() || undefined,
        }),
      });
      plan = await pr.json().catch(() => plan);
      if (!Array.isArray(plan.queries) || plan.queries.length === 0) {
        throw new Error("empty plan");
      }
      setResearchState({
        plan: "done",
        queries: plan.queries,
        done: 0,
        current: "",
      });
      const sections: string[] = [];
      for (let i = 0; i < plan.queries.length; i++) {
        const q = plan.queries[i];
        setResearchState({
          plan: "done",
          queries: plan.queries,
          done: i,
          current: q,
        });
        const qr = await fetch("/api/ai/research/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q, sites: plan.sites }),
        });
        const qd = await qr.json().catch(() => null);
        const text = (qd?.text ?? "").toString().trim();
        if (text) sections.push(`【${q}】\n${text}`);
        setResearchState({
          plan: "done",
          queries: plan.queries,
          done: i + 1,
          current: "",
        });
      }
      notes = sections.join("\n\n").slice(0, 30000);
    } catch {
      setResearchState((s) => ({ ...s, plan: "failed" }));
      // 检索失败:继续走纯 AI 生成
    }
    setResearchNote(notes);

    // ② 生成大纲
    const res = await fetch("/api/ai/outline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: t,
        level: lv,
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

  // 大纲微调:章节标题/删除/排序(生成尚未开始,可安全修改)
  function patchOutlineChapter(ci: number, patch: Partial<CourseOutline["chapters"][number]>) {
    setOutline((o) =>
      o ? { ...o, chapters: o.chapters.map((c, i) => (i === ci ? { ...c, ...patch } : c)) } : o
    );
  }
  function moveChapter(ci: number, dir: -1 | 1) {
    setOutline((o) => {
      if (!o) return o;
      const chs = [...o.chapters];
      const j = ci + dir;
      if (j < 0 || j >= chs.length) return o;
      [chs[ci], chs[j]] = [chs[j], chs[ci]];
      return { ...o, chapters: chs };
    });
  }
  function removeChapter(ci: number) {
    if (!window.confirm("删除该章节后不可恢复,确认?")) return;
    setOutline((o) => (o ? { ...o, chapters: o.chapters.filter((_, i) => i !== ci) } : o));
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
    setFormError("");
    try {
      await generateAll(outline);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "课程生成失败");
      setPhase("preview");
    }
  }

  // 只生成第一章即进入课程(约 30-60 秒);其余章节在课程页后台逐章生成,边学边补
  async function generateAll(outlineData: CourseOutline) {
    setPhase("generating");
    const res = await fetch("/api/ai/chapter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outline: outlineData, chapterIndex: 0 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "第一章生成失败");

    const saveRes = await fetch("/api/ai/assemble", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outline: outlineData, chapters: [data.steps] }),
    });
    const saved = await saveRes.json();
    if (!saveRes.ok) throw new Error(saved.error ?? "课程保存失败");

    setPhase("done");
    await refreshCourses();
    router.push(`/courses/${saved.id}`);
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
              <p className="mt-1 text-sm text-ink-soft">
                {researchState.plan === "running"
                  ? "正在分析主题,制定资料查询计划..."
                  : researchState.plan === "failed"
                    ? "联网检索不可用,将继续纯 AI 生成"
                    : researchState.current
                      ? `正在联网检索:${researchState.current}`
                      : `检索完成,共 ${researchState.queries.length} 条知识点`}
              </p>
              <p className="mt-2 text-xs text-ink-soft/70">
                AI 会先联网查找相关知识点与最佳实践,再据此设计课程,内容更准确、不过时
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                  researchState.plan === "failed"
                    ? "bg-red-soft text-red"
                    : researchState.plan === "done"
                      ? "bg-green-soft text-green"
                      : "bg-accent-soft text-accent"
                }`}
              >
                {researchState.plan === "failed" ? "✗" : researchState.plan === "done" ? "✓" : "●"}
              </span>
              <span className="text-ink">制定查询计划</span>
              {researchState.plan === "done" && researchState.queries.length > 0 && (
                <span className="ml-auto text-ink-soft/60">
                  {researchState.done}/{researchState.queries.length}
                </span>
              )}
            </div>
            {researchState.plan === "done" &&
              researchState.queries.map((q, i) => (
                <div key={q} className="flex items-center gap-2 text-xs">
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                      i < researchState.done
                        ? "bg-green-soft text-green"
                        : i === researchState.done
                          ? "bg-accent-soft text-accent"
                          : "bg-bg-subtle text-ink-soft/50"
                    }`}
                  >
                    {i < researchState.done ? "✓" : i === researchState.done ? "●" : "○"}
                  </span>
                  <span
                    className={`truncate ${
                      i < researchState.done
                        ? "text-ink-soft"
                        : i === researchState.done
                          ? "text-ink"
                          : "text-ink-soft/50"
                    }`}
                  >
                    {q}
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
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-ink-soft">{ci + 1}</span>
                    <input
                      value={c.title}
                      onChange={(e) => patchOutlineChapter(ci, { title: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 py-1 text-sm font-bold text-ink outline-none transition focus:border-accent"
                      aria-label={`第 ${ci + 1} 章标题`}
                    />
                    <button
                      onClick={() => moveChapter(ci, -1)}
                      disabled={ci === 0}
                      className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs text-ink-soft transition hover:bg-bg-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                      title="上移章节"
                    >↑</button>
                    <button
                      onClick={() => moveChapter(ci, 1)}
                      disabled={ci === outline.chapters.length - 1}
                      className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs text-ink-soft transition hover:bg-bg-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                      title="下移章节"
                    >↓</button>
                    <button
                      onClick={() => removeChapter(ci)}
                      disabled={outline.chapters.length <= 1}
                      className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs text-red/70 transition hover:bg-red-soft hover:text-red disabled:cursor-not-allowed disabled:opacity-30"
                      title="删除章节"
                    >✕</button>
                  </div>
                  <textarea
                    value={c.description ?? ""}
                    onChange={(e) => patchOutlineChapter(ci, { description: e.target.value })}
                    placeholder="本章目标(可编辑)"
                    rows={1}
                    className="mt-2 w-full resize-none rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-ink-soft outline-none transition focus:border-accent"
                  />
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
              确认后先生成第一章(约 30-60 秒)即可开始学习
              {outline.chapters.length > 1
                ? `,其余 ${outline.chapters.length - 1} 章在你学习的同时自动生成`
                : "。"
              }
            </p>
          </div>
        </div>
      )}

      {/* 生成第一章 */}
      {phase === "generating" && outline && (
        <div className="fade-up mx-auto max-w-3xl">
          <div className="rounded-2xl border border-line bg-card p-8 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-serif text-xl font-bold">
                  正在生成第一章《{outline.chapters[0]?.title}》
                </h2>
                <p className="mt-1 text-sm text-ink-soft">
                  共 {outline.chapters.length} 章 · 第一章完成后立即开始学习
                  {outline.chapters.length > 1
                    ? `,其余 ${outline.chapters.length - 1} 章会在学习过程中自动生成`
                    : "。"
                  }
                </p>
                {formError && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-soft px-4 py-3 text-sm text-red">
                    {formError}
                  </div>
                )}
                <div className="mt-5 space-y-1.5">
                  {outline.chapters.map((c, ci) => (
                    <div key={ci} className="flex items-center gap-2 text-xs">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                          ci === 0
                            ? "bg-accent-soft text-accent"
                            : "bg-bg-subtle text-ink-soft/50"
                        }`}
                      >
                        {ci === 0 ? "●" : "○"}
                      </span>
                      <span className="truncate">{c.title}</span>
                      <span className="ml-auto shrink-0 text-ink-soft/60">
                        {ci === 0
                          ? "正在生成..."
                          : "学习时自动生成"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
        {/* 排序:进行中/未开始在前,已完成置后,同组内按创建时间倒序 */}
        {(() => {
          const courseRows = courses
            .map((c) => ({
              c,
              done: Object.values(loadProgress(c.id)).filter(Boolean).length,
            }))
            .sort((x, y) => {
              const xDone = x.c.pendingChapters === 0 && x.c.stepCount > 0 && x.done >= x.c.stepCount ? 1 : 0;
              const yDone = y.c.pendingChapters === 0 && y.c.stepCount > 0 && y.done >= y.c.stepCount ? 1 : 0;
              if (xDone !== yDone) return xDone - yDone;
              return y.c.createdAt.localeCompare(x.c.createdAt);
            });
          return (
        <>
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-2xl font-bold">课程列表</h2>
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
