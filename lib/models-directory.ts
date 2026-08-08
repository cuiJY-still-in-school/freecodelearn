// models.dev 模型目录:运行时在用户设备上实时拉取服务商列表,失败时降级到内置预设
// 数据来源 https://models.dev/api.json(社区维护,含各家 API 端点与模型)

export interface ProviderInfo {
  name: string;
  baseUrl: string;
  defaultModel: string;
  modelCount: number;
  /** 该服务商全部模型 id(models.dev 全量,用于模型选择) */
  models: string[];
}

// 兜底:models.dev 不可达时无内置服务商,仅保留 Custom 手动填写
export const FALLBACK_PROVIDERS: ProviderInfo[] = [];

// 始终显示的「自定义」预设:点击后清空字段,由用户手动填写端点与模型
export const CUSTOM_PROVIDER: ProviderInfo = {
  name: "Custom(自定义)",
  baseUrl: "",
  defaultModel: "",
  modelCount: 0,
  models: [],
};

const CACHE_KEY = "fcl-models-directory";
const CACHE_TTL_MS = 7 * 24 * 3600_000;
const FETCH_TIMEOUT_MS = 20_000;

interface RawModelsDirectory {
  // 官方结构:顶层即服务商 map;历史/包装结构:{ providers: {...} }
  providers?: Record<
    string,
    {
      name?: string;
      api?: string;
      auth?: string;
      models?: Record<string, { name?: string } | null> | null;
    }
  >;
  [key: string]: unknown;
}

// 拉取端点 fallback 链:官方优先,jsDelivr CDN 镜像兜底(国内可达)
const ENDPOINTS = [
  "https://models.dev/api.json",
  "https://cdn.jsdelivr.net/gh/JochenYang/models.dev@main/api.json",
  "https://fastly.jsdelivr.net/gh/JochenYang/models.dev@main/api.json",
  "https://cdn.jsdelivr.net/gh/symfony/models-dev@main/models-dev.json",
];

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
  // 兼容两种结构:顶层直接是服务商 map,或包在 providers 字段里
  let provs: RawModelsDirectory["providers"] | undefined;
  if (data && typeof data === "object") {
    if (data.providers && typeof data.providers === "object") provs = data.providers;
    else if (!Array.isArray(data) && typeof (data as Record<string, unknown>)["api"] === "undefined" && typeof (data as Record<string, unknown>)["models"] === "undefined") {
      // 顶层没有包装键时,把非 API 端点字段的对象当成服务商 map
      const candidate = data as unknown as Record<string, unknown>;
      const hasProviderShape = Object.values(candidate).some(
        (v) => v && typeof v === "object" && !Array.isArray(v)
      );
      if (hasProviderShape) provs = data as unknown as RawModelsDirectory["providers"];
    }
  }
  if (!provs) throw new Error("模型目录结构异常");
  const out: ProviderInfo[] = [];
  for (const key of Object.keys(provs)) {
    const p = provs[key];
    if (!p || typeof p !== "object") continue;
    const baseUrl = String(p.api ?? "").trim();
    if (!isHttpUrl(baseUrl)) continue;
    const modelIds = p.models ? Object.keys(p.models) : [];
    if (modelIds.length === 0) continue;
    const preferred = pickDefaultModel(p.models);
    out.push({
      name: String(p.name ?? key),
      baseUrl,
      defaultModel: preferred.id,
      modelCount: modelIds.length,
      models: modelIds,
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

async function fetchWithTimeout(url: string, ms: number): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 获取服务商目录:先缓存,再按 fallback 链实时拉取(models.dev 官方 → jsDelivr CDN
 * 镜像,共 4 个端点),全部失败降级到 Custom 手填。
 * force=true 时忽略缓存强制刷新(失败仍降级)。
 */
export async function fetchModelsDirectory(force = false): Promise<ProviderInfo[]> {
  if (!force) {
    const cached = readCache();
    if (cached) return cached;
  }
  let lastErr = "";
  for (const url of ENDPOINTS) {
    try {
      const text = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
      const providers = parseDirectory(text);
      if (providers.length > 0) {
        writeCache(providers);
        return providers;
      }
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      console.warn(`[models-directory] ${url} 失败:`, lastErr);
    }
  }
  console.warn("[models-directory] 所有端点不可达:", lastErr);
  return FALLBACK_PROVIDERS;
}
