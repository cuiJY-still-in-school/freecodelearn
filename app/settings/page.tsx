"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import {
  FALLBACK_PROVIDERS,
  fetchModelsDirectory,
  type ProviderInfo,
} from "@/lib/models-directory";

// 自建可滚动搜索下拉(datalist 在桌面端有滚动与报错问题,弃用)
function SearchDropdown({
  options,
  placeholder,
  value,
  onPick,
  disabled,
  emptyHint,
}: {
  options: { value: string; sub?: string }[];
  placeholder: string;
  value: string;
  onPick: (v: string) => void;
  disabled?: boolean;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // 未打开时显示外部选中值,打开时显示搜索词
  const display = open ? q : value;
  const filtered = q
    ? options.filter(
        (o) =>
          o.value.toLowerCase().includes(q.toLowerCase()) ||
          (o.sub ?? "").toLowerCase().includes(q.toLowerCase())
      )
    : options;
  return (
    <div className="relative mb-3">
      <input
        value={display}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQ("");
          setOpen(true);
        }}
        onClick={() => {
          setQ("");
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-xl border border-line bg-bg px-4 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {open && !disabled && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-line bg-card py-1 shadow-lg">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-ink-soft">
              {emptyHint ?? "无匹配项"}
            </li>
          ) : (
            filtered.map((o) => (
              <li
                key={o.value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(o.value);
                  setOpen(false);
                  setQ("");
                }}
                className="cursor-pointer px-3 py-2 text-sm text-ink transition hover:bg-accent-soft/50"
              >
                <span className="block">{o.value}</span>
                {o.sub && (
                  <span className="block truncate text-[11px] text-ink-soft">
                    {o.sub}
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [theme, setThemeState] = useState<Theme>("system");
  const [provider, setProvider] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [parseMethod, setParseMethod] = useState<"openai" | "anthropic">("openai");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // 服务商目录(models.dev 实时数据,失败降级内置预设)
  const [presets, setPresets] = useState<ProviderInfo[] | null>(null);
  const [presetSource, setPresetSource] = useState<"models.dev" | "builtin">("models.dev");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderInfo | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [catalogMode, setCatalogMode] = useState(true);

  // 连接测试
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | {
    ok: boolean;
    ms?: number;
    preview?: string;
    error?: string;
  }>(null);

  useEffect(() => {
    setThemeState(getTheme());
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
  }, []);

  // 实时拉取服务商目录(缓存 7 天,失败降级内置)
  useEffect(() => {
    fetchModelsDirectory().then((providers) => {
      setPresets(providers);
      if (providers === FALLBACK_PROVIDERS) setPresetSource("builtin");
    });
  }, []);

  // 服务商选择:选中即填充表单;手输不匹配则视为自定义名称,不覆盖端点
  function onProviderPick(raw: string) {
    const hit = presets?.find((p) => p.name === raw.trim());
    if (!hit) return;
    setSelectedProvider(hit);
    setSelectedModel(hit.defaultModel);
    setProvider(hit.name);
    setBaseUrl(hit.baseUrl);
    setModel(hit.defaultModel);
    setParseMethod(hit.name === "Anthropic" ? "anthropic" : "openai");
  }

  function onModelPick(raw: string) {
    const m = raw.trim();
    if (m && selectedProvider?.models.includes(m)) {
      setSelectedModel(m);
      setModel(m);
    }
  }

  async function refreshDirectory() {
    setRefreshing(true);
    const providers = await fetchModelsDirectory(true);
    setPresets(providers);
    setPresetSource(providers === FALLBACK_PROVIDERS ? "builtin" : "models.dev");
    setRefreshing(false);
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-1 font-serif text-3xl font-bold tracking-tight">
        AI 服务设置
      </h1>
      <p className="mb-8 text-sm text-ink-soft">
        选择服务商预设或手动填写。解析方法决定请求协议:OpenAI 兼容或 Anthropic 兼容。
      </p>

      {typeof window !== "undefined" && window.location.search.includes("first=1") && (
        <div className="pop mb-6 rounded-2xl border border-accent/25 bg-accent/5 px-5 py-4 text-sm leading-relaxed text-ink">
          👋 欢迎使用 FreeCodeLearn!首次使用需要先配置 AI 服务(任意 OpenAI 兼容或
          Anthropic 接口均可)。填写下方信息并点「测试连接」验证成功后,就可以回到首页生成课程了。
        </div>
      )}

      {apiKey && (
        <div className="mb-6 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-line bg-card px-3 py-1 text-ink-soft">
            当前生效:{provider || "自定义"}
          </span>
          <span
            className={`rounded-full px-3 py-1 font-medium ${
              parseMethod === "anthropic"
                ? "border border-orange-200 bg-orange-50 text-orange-700"
                : "border border-green/30 bg-green-soft text-green"
            }`}
          >
            {parseMethod === "anthropic" ? "Anthropic 协议" : "OpenAI 协议"}
          </span>
          <span className="rounded-full border border-line bg-card px-3 py-1 font-mono text-ink-soft">
            {model}
          </span>
        </div>
      )}

      <form
        onSubmit={save}
        className="rounded-2xl border border-line bg-card p-6 shadow-sm"
      >
        <label className="mb-1.5 block text-sm font-medium text-ink">
          外观主题
        </label>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {([
            ["system", "跟随系统"],
            ["light", "浅色"],
            ["dark", "深色"],
          ] as [Theme, string][]).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setThemeState(v);
                setTheme(v);
              }}
              className={`rounded-xl border px-4 py-2.5 text-sm transition ${
                theme === v
                  ? "border-accent bg-accent-soft font-semibold text-accent"
                  : "border-line bg-bg text-ink-soft hover:border-accent/40 hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="mb-1.5 block text-sm font-medium text-ink">
          服务商名称(Provider)
        </label>
        <input
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder="DeepSeek / OpenAI / Anthropic / 自定义..."
          className="mb-4 w-full rounded-xl border border-line bg-bg px-4 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <div className="mb-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setCatalogMode(true)}
            className={`rounded-xl border px-4 py-2.5 text-sm transition ${
              catalogMode
                ? "border-accent bg-accent-soft font-semibold text-accent"
                : "border-line bg-bg text-ink-soft hover:border-accent/40 hover:text-ink"
            }`}
          >
            AI 服务商目录
          </button>
          <button
            type="button"
            onClick={() => setCatalogMode(false)}
            className={`rounded-xl border px-4 py-2.5 text-sm transition ${
              !catalogMode
                ? "border-accent bg-accent-soft font-semibold text-accent"
                : "border-line bg-bg text-ink-soft hover:border-accent/40 hover:text-ink"
            }`}
          >
            手动配置(Custom)
          </button>
        </div>

        {catalogMode ? (
          <div className="mb-4 rounded-xl border border-line bg-bg-subtle/60 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium text-ink">
                AI 服务商(models.dev)
              </label>
              <button
                type="button"
                onClick={refreshDirectory}
                disabled={refreshing}
                className="rounded-full border border-dashed border-line px-3 py-1 text-xs text-ink-soft transition hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                title="重新拉取 models.dev 最新服务商与模型"
              >
                {refreshing ? "刷新中..." : "🔄 更新目录"}
              </button>
            </div>

            {presets === null ? (
              <span className="flex items-center gap-2 text-xs text-ink-soft">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                正在获取 models.dev 模型目录...
              </span>
            ) : (
              <>
                <label className="mb-1 block text-xs text-ink-soft">
                  服务商(可输入名称搜索,共 {presets.length} 家)
                </label>
                <SearchDropdown
                  options={presets.map((p) => ({
                    value: p.name,
                    sub: `${p.baseUrl} · ${p.modelCount} 个模型`,
                  }))}
                  placeholder="如 DeepSeek / OpenAI / Anthropic / 通义..."
                  value={selectedProvider?.name ?? ""}
                  onPick={onProviderPick}
                />

                <label className="mb-1 block text-xs text-ink-soft">
                  模型(服务商全部模型,可输入搜索)
                </label>
                <SearchDropdown
                  options={selectedProvider
                    ? selectedProvider.models.map((m) => ({ value: m }))
                    : []}
                  placeholder={
                    selectedProvider
                      ? `共 ${selectedProvider.modelCount} 个模型,点击选择`
                      : "先在上方选择服务商"
                  }
                  value={selectedModel}
                  onPick={onModelPick}
                  disabled={!selectedProvider}
                  emptyHint="该服务商无匹配模型"
                />

                <span className="text-[11px] text-ink-soft/70">
                  {presetSource === "models.dev"
                    ? `数据来自 models.dev,7 天缓存;选中后自动填入下方表单,补 API Key 即可`
                    : "models.dev 暂不可达,可切换到「手动配置」填写"}
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="mb-4 rounded-xl border border-line bg-bg-subtle/60 p-4 text-sm text-ink-soft">
            手动配置模式:请在下方表单直接填写服务商名称、Base URL、
            API Key 与模型(适用于任何 OpenAI 兼容或 Anthropic 兼容接口)。
            也可以切换回「AI 服务商目录」一键选择。
          </div>
        )}
        <label className="mb-1.5 block text-sm font-medium text-ink">
          协议格式(parseMethod)
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
          API Key(密钥)
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
          模型(model)
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
        {saved &&
          typeof window !== "undefined" &&
          window.location.search.includes("first=1") && (
            <div className="pop mb-4 rounded-2xl border border-green/30 bg-green-soft px-5 py-4">
              <p className="text-sm font-semibold text-green">
                ✅ 配置成功,可以开始学习之旅了
              </p>
              <p className="mt-1 text-xs text-green/80">
                输入一个想学的主题,几分钟后就能拿到一门可学的课程
              </p>
              <Link
                href="/?configured=1"
                className="mt-3 inline-block rounded-xl bg-green px-5 py-2 text-xs font-semibold text-white transition hover:bg-green-700"
              >
                去生成第一门课 →
              </Link>
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

    </div>
  );
}
