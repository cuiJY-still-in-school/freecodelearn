"use client";

import { useEffect, useState } from "react";

const PRESETS = [
  {
    name: "OpenCode Zen(免费)",
    baseUrl: "https://opencode.ai/zen/v1",
    model: "deepseek-v4-flash-free",
    hint: "免费额度约 100 次/天,无需信用卡",
  },
  {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    hint: "",
  },
  {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    hint: "",
  },
  {
    name: "Moonshot Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "kimi-k2",
    hint: "",
  },
  {
    name: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    hint: "",
  },
  {
    name: "本地 Ollama",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3",
    hint: "需先 ollama pull 一个模型",
  },
];

export default function SettingsPage() {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // GitHub 设置
  const [ghClientId, setGhClientId] = useState("");
  const [ghRepo, setGhRepo] = useState("freecodelearn-courses");
  const [ghSaved, setGhSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setBaseUrl(d.baseUrl ?? "");
        setApiKey(d.apiKey ?? "");
        setModel(d.model ?? "");
      })
      .finally(() => setLoading(false));
    fetch("/api/github-settings")
      .then((r) => r.json())
      .then((d) => {
        setGhClientId(d.clientId ?? "");
        setGhRepo(d.repoName ?? "freecodelearn-courses");
      });
  }, []);

  async function saveGithub(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/github-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: ghClientId, repoName: ghRepo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存失败");
      setGhSaved(true);
      setTimeout(() => setGhSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey, model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存失败");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  function applyPreset(p: (typeof PRESETS)[number]) {
    setBaseUrl(p.baseUrl);
    setModel(p.model);
    setSaved(false);
    setError("");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-1 font-serif text-3xl font-bold tracking-tight">
        AI 服务设置
      </h1>
      <p className="mb-8 text-sm text-ink-soft">
        支持任何 OpenAI 兼容协议的服务。选一个预设,或手动填写。
      </p>

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            onClick={() => applyPreset(p)}
            title={p.hint}
            className={`rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition ${
              baseUrl === p.baseUrl
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-ink-soft hover:border-accent/40 hover:text-ink"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <form
        onSubmit={save}
        className="rounded-2xl border border-line bg-card p-6 shadow-sm"
      >
        <label className="mb-1.5 block text-sm font-medium text-ink">
          Base URL
        </label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
          className="mb-4 w-full rounded-xl border border-line bg-bg px-4 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <label className="mb-1.5 block text-sm font-medium text-ink">
          API Key
        </label>
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          type="password"
          placeholder="sk-..."
          className="mb-4 w-full rounded-xl border border-line bg-bg px-4 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          required
        />
        <label className="mb-1.5 block text-sm font-medium text-ink">
          模型
        </label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="gpt-4o / deepseek-chat / qwen-plus / llama3..."
          className="mb-6 w-full rounded-xl border border-line bg-bg px-4 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          required
        />

        {error && (
          <div className="mb-4 rounded-xl border border-red/20 bg-red-soft px-4 py-3 text-sm text-red">
            {error}
          </div>
        )}
        {saved && (
          <div className="pop mb-4 rounded-xl border border-green/20 bg-green-soft px-4 py-3 text-sm text-green">
            ✓ 已保存
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-ink py-3 text-sm font-semibold text-bg transition hover:bg-accent disabled:opacity-40"
        >
          保存配置
        </button>
      </form>

      <div className="mt-6 rounded-2xl border border-line bg-card p-5 text-sm text-ink-soft">
        <p className="mb-2 font-semibold text-ink">也可以使用环境变量</p>
        <pre className="overflow-x-auto rounded-xl bg-[#1f1e1d] p-4 font-mono text-xs text-[#e8e6e1]">
          {`AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o`}
        </pre>
        <p className="mt-3 text-xs text-ink-soft">
          环境变量优先级低于网页设置。密钥仅保存在本机
          <code className="mx-1 rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-xs">
            data/settings.json
          </code>
          ,不会上传。
        </p>
      </div>

      <h2 className="mb-1 mt-12 font-serif text-2xl font-bold tracking-tight">
        GitHub 关联
      </h2>
      <p className="mb-6 text-sm text-ink-soft">
        填写 GitHub OAuth App 的 Client ID(无需注册回调,使用设备码授权)。登录后可将课程发布到你的 GitHub 仓库。
      </p>
      <form
        onSubmit={saveGithub}
        className="rounded-2xl border border-line bg-card p-6 shadow-sm"
      >
        <label className="mb-1.5 block text-sm font-medium text-ink">
          GitHub Client ID
        </label>
        <input
          value={ghClientId}
          onChange={(e) => setGhClientId(e.target.value)}
          placeholder="例如:Ov23li..."
          className="mb-4 w-full rounded-xl border border-line bg-bg px-4 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <label className="mb-1.5 block text-sm font-medium text-ink">
          公开课程仓库名
        </label>
        <input
          value={ghRepo}
          onChange={(e) => setGhRepo(e.target.value)}
          placeholder="freecodelearn-courses"
          className="mb-4 w-full rounded-xl border border-line bg-bg px-4 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <p className="mb-4 text-xs text-ink-soft">
          发布课程时自动创建该仓库(如不存在),课程 JSON 存到
          <code className="mx-1 rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-xs">
            courses/课程id.json
          </code>
        </p>
        {ghSaved && (
          <div className="pop mb-4 rounded-xl border border-green/20 bg-green-soft px-4 py-3 text-sm text-green">
            ✓ 已保存
          </div>
        )}
        <button
          type="submit"
          className="w-full rounded-xl bg-ink py-3 text-sm font-semibold text-bg transition hover:bg-accent"
        >
          保存 GitHub 配置
        </button>
      </form>
    </div>
  );
}
