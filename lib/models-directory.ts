// models.dev 模型目录:运行时在用户设备上实时拉取服务商列表,失败时降级到内置预设
// 数据来源 https://models.dev/api.json(社区维护,含各家 API 端点与模型)

export interface ProviderInfo {
  name: string;
  baseUrl: string;
  defaultModel: string;
  modelCount: number;
}

// 内置兜底预设(models.dev 不可达时使用)
export const FALLBACK_PROVIDERS: ProviderInfo[] = [
  { name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat", modelCount: 1 },
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini", modelCount: 1 },
  { name: "Anthropic", baseUrl: "https://api.anthropic.com", defaultModel: "claude-sonnet-4-20250514", modelCount: 1 },
  { name: "通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", defaultModel: "qwen-plus", modelCount: 1 },
  { name: "Kimi", baseUrl: "https://api.moonshot.cn/v1", defaultModel: "moonshot-v1-8k", modelCount: 1 },
  { name: "Ollama(本地)", baseUrl: "http://127.0.0.1:11434/v1", defaultModel: "qwen2.5", modelCount: 1 },
];

const CACHE_KEY = "fcl-models-directory";
const CACHE_TTL_MS = 7 * 24 * 3600_000;
const FETCH_TIMEOUT_MS = 20_000;

interface RawModelsDirectory {
  providers?: Record<
    string,
    {
      name?: string;
      api?: string;
      auth?: string;
      models?: Record<string, { name?: string } | null> | null;
    }
  >;
}

/** 从模型列表里挑最常用的默认模型(优先常见对话模型名,否则取第一个) */
function pickDefaultModel(models: Record<string, unknown> | null | undefined): {
  id: string;
  count: number;
} {
  const ids = Object.keys(models ?? {});
  if (ids.length === 0) return { id: "", count: 0 };
  const PREF = [
    "deepseek-chat",
    "gpt-4o-mini",
    "gpt-4o",
    "claude-sonnet",
    "claude-3-5-sonnet",
    "qwen-plus",
    "moonshot",
    "kimi",
    "llama3",
    "llama-3",
  ];
  for (const p of PREF) {
    const hit = ids.find((id) => id.includes(p));
    if (hit) return { id: hit, count: ids.length };
  }
  return { id: ids[0], count: ids.length };
}

function isHttpUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseDirectory(raw: string): ProviderInfo[] {
  let data: RawModelsDirectory;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("模型目录数据解析失败");
  }
  const provs = data?.providers;
  if (!provs || typeof provs !== "object") throw new Error("模型目录结构异常");
  const out: ProviderInfo[] = [];
  for (const key of Object.keys(provs)) {
    const p = provs[key];
    if (!p || typeof p !== "object") continue;
    const baseUrl = String(p.api ?? "").trim();
    if (!isHttpUrl(baseUrl)) continue;
    const { id, count } = pickDefaultModel(p.models);
    if (!id) continue;
    out.push({
      name: String(p.name ?? key),
      baseUrl,
      defaultModel: id,
      modelCount: count,
    });
  }
  if (out.length === 0) throw new Error("模型目录无可用服务商");
  return out.sort((a, b) => a.name.localeCompare(b.name, "zh"));
}

function readCache(): ProviderInfo[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fetchedAt: number; providers: ProviderInfo[] };
    if (
      typeof parsed?.fetchedAt === "number" &&
      Date.now() - parsed.fetchedAt < CACHE_TTL_MS &&
      Array.isArray(parsed.providers) &&
      parsed.providers.length > 0
    ) {
      return parsed.providers;
    }
  } catch {
    // 缓存损坏则忽略
  }
  return null;
}

function writeCache(providers: ProviderInfo[]): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), providers })
    );
  } catch {
    // 忽略存储异常
  }
}

/**
 * 获取服务商目录:先缓存,再实时拉取 models.dev,失败降级内置预设。
 * force=true 时忽略缓存强制刷新(失败仍降级)。
 */
export async function fetchModelsDirectory(force = false): Promise<ProviderInfo[]> {
  if (!force) {
    const cached = readCache();
    if (cached) return cached;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch("https://models.dev/api.json", {
        signal: ctrl.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`models.dev 请求失败 (${res.status})`);
    const text = await res.text();
    const providers = parseDirectory(text);
    writeCache(providers);
    return providers;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[models-directory] 拉取失败,使用内置预设:", msg);
    return FALLBACK_PROVIDERS;
  }
}
