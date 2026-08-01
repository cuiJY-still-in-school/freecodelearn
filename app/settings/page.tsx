"use client";

import { useEffect, useState } from "react";

const PRESETS: {
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  parseMethod: "openai" | "anthropic";
  hint: string;
}[] = [
  {
    name: "OpenCode Zen(免费)",
    provider: "OpenCode Zen",
    baseUrl: "https://opencode.ai/zen/v1",
    model: "deepseek-v4-flash-free",
    parseMethod: "openai",
    hint: "免费额度约 100 次/天,无需信用卡",
  },
  {
    name: "OpenAI",
    provider: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    parseMethod: "openai",
    hint: "",
  },
  {
    name: "Anthropic Claude",
    provider: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-20250514",
    parseMethod: "anthropic",
    hint: "使用 Anthropic Messages API 协议",
  },
  {
    name: "DeepSeek",
    provider: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    parseMethod: "openai",
    hint: "",
  },
  {
    name: "Moonshot Kimi",
    provider: "Moonshot",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "kimi-k2",
    parseMethod: "openai",
    hint: "",
  },
  {
    name: "通义千问",
    provider: "阿里云",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    parseMethod: "openai",
    hint: "",
  },
  {
    name: "本地 Ollama",
    provider: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3",
    parseMethod: "openai",
    hint: "需先 ollama pull 一个模型",
  },
];

export default function SettingsPage() {
  const [provider, setProvider] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [parseMethod, setParseMethod] = useState<"openai" | "anthropic">("openai");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // 连接测试
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | {
    ok: boolean;
    ms?: number;
    preview?: string;
    error?: string;
  }>(null);

  // GitHub 设置
  const [ghClientId, setGhClientId] = useState("");
  const [ghRepo, setGhRepo] = useState("freecodelearn-courses");
  const [ghSaved, setGhSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setProvider(d.provider ?? "自定义");
        setBaseUrl(d.baseUrl ?? "");
        setApiKey(d.apiKey ?? "");
        setModel(d.model ?? "");
        setParseMethod(d.parseMethod === "anthropic" ? "anthropic" : "openai");
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
        body: JSON.stringify({ provider, baseUrl, apiKey, model, parseMethod }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存失败");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ai/test", { method: "POST" });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, error: "网络错误,无法连接服务" });
    } finally {
      setTesting(false);
    }
  }

  function applyPreset(p: (typeof PRESETS)[number]) {
    setProvider(p.provider);
    setBaseUrl(p.baseUrl);
    setModel(p.model);
    setParseMethod(p.parseMethod);
    setSaved(false);
    setError("");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-1 font-serif text-3xl font-bold tracking-tight">
        AI 服务设置
      </h1>
      <p className="mb-8 text-sm text-ink-soft">
        选择服务商预设或手动填写。解析方法决定请求协议:OpenAI 兼容或 Anthropic 兼容。
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
          Provider(服务商)
        </label>
        <input
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder="OpenCode Zen / OpenAI / Anthropic / 自定义..."
          className="mb-4 w-full rounded-xl border border-line bg-bg px-4 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <label className="mb-1.5 block text-sm font-medium text-ink">
          解析方法(协议格式)
        </label>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {[
            { v: "openai" as const, l: "OpenAI 兼容", d: "/chat/completions · Bearer" },
            { v: "anthropic" as const, l: "Anthropic 兼容", d: "/messages · x-api-key" },
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setParseMethod(o.v)}
              className={`rounded-xl border px-3 py-2.5 text-left transition ${
                parseMethod === o.v
                  ? "border-accent bg-accent-soft"
                  : "border-line bg-bg hover:border-accent/40"
              }`}
            >
              <span className="block text-sm font-medium">{o.l}</span>
              <span className="block text-[11px] text-ink-soft">{o.d}</span>
            </button>
          ))}
        </div>
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
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-xl bg-ink py-3 text-sm font-semibold text-bg transition hover:bg-accent disabled:opacity-40"
          >
            保存配置
          </button>
          <button
            type="button"
            onClick={testConnection}
            disabled={testing}
            className="rounded-xl border border-accent/40 bg-accent-soft px-5 py-3 text-sm font-semibold text-accent transition hover:bg-accent hover:text-white disabled:opacity-50"
          >
            {testing ? "测试中..." : "测试连接"}
          </button>
        </div>
        {testResult && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              testResult.ok
                ? "border-green/20 bg-green-soft text-green"
                : "border-red/20 bg-red-soft text-red"
            }`}
          >
            {testResult.ok ? (
              <>
                ✓ 连接成功({testResult.ms}ms):AI 回复「{testResult.preview}」
              </>
            ) : (
              <>✗ 连接失败:{testResult.error}</>
            )}
          </div>
        )}
      </form>

      <div className="mt-6 rounded-2xl border border-line bg-card p-5 text-sm text-ink-soft">
        <p className="mb-2 font-semibold text-ink">也可以使用环境变量</p>
        <pre className="overflow-x-auto rounded-xl bg-[#1f1e1d] p-4 font-mono text-xs text-[#e8e6e1]">
          {`AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o
AI_PROVIDER=OpenAI
AI_PARSE_METHOD=openai   # 或 anthropic`}
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
