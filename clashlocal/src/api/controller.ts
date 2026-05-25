import { invoke } from '@tauri-apps/api/core'

export interface RuntimeConfig {
  mixed_port: number
  controller: string
  secret: string
}

let cached: RuntimeConfig | null = null

export async function getRuntime(): Promise<RuntimeConfig> {
  if (!cached) cached = await invoke<RuntimeConfig>('get_runtime_config')
  return cached
}

/** 调用 mihomo external-controller REST 接口(自动带 secret)。 */
export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const rt = await getRuntime()
  const res = await fetch(`http://${rt.controller}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${rt.secret}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`控制器 ${res.status}: ${body}`)
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/** 打开 mihomo 的 WebSocket 流(/traffic /logs /connections /memory)。 */
export async function openWs(path: string): Promise<WebSocket> {
  const rt = await getRuntime()
  const sep = path.includes('?') ? '&' : '?'
  return new WebSocket(`ws://${rt.controller}${path}${sep}token=${encodeURIComponent(rt.secret)}`)
}

export function fmtBytes(n: number): string {
  if (!n || n < 0) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`
  return `${(n / 1073741824).toFixed(2)} GB`
}
