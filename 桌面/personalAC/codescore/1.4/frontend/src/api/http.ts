// HTTP API 层 — 替代 1.2 的 Electron IPC window.api.*

// 返回当前用户对应的 studentId：学生返回自身 id，监护人返回第一个学生 id
export async function getEffectiveStudentId(): Promise<string | null> {
  const me = await fetch('/api/auth/me', {
    headers: { 'x-sync-token': localStorage.getItem('syncToken') || '' }
  }).then(r => r.json()).catch(() => null)
  if (!me?.success || !me.data) return null
  if (me.data.role === 'student') return me.data.id as string
  const students = await fetch('/api/auth/students', {
    headers: { 'x-sync-token': localStorage.getItem('syncToken') || '' }
  }).then(r => r.json()).catch(() => null)
  return students?.data?.[0]?.id ?? null
}

const BASE = '/api'

// ── 本地 Workspace 代理（pac CLI 启动）────────────────────────────────
const PROXY_BASE = 'http://127.0.0.1:7474/api'
let _proxyAvailable = false
let _proxyProbed = false

export function probeWorkspaceProxy(): void {
  if (_proxyProbed) return
  _proxyProbed = true
  const token = getSyncToken()
  if (!token) return

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 1500)

  fetch('http://127.0.0.1:7474/status', {
    headers: { 'x-sync-token': token },
    signal: controller.signal
  })
    .then(r => r.json())
    .then(d => { if (d?.success) _proxyAvailable = true })
    .catch(() => {})
    .finally(() => clearTimeout(timer))
}

function workspaceBase(): string {
  return _proxyAvailable ? PROXY_BASE : BASE
}

function getSyncToken(): string {
  return localStorage.getItem('syncToken') || ''
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  baseOverride?: string
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const base = baseOverride ?? BASE
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-sync-token': getSyncToken()
      },
      body: body ? JSON.stringify(body) : undefined
    })
    return await res.json()
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '网络错误' }
  }
}

const get = <T>(path: string, base?: string) => request<T>('GET', path, undefined, base)
const post = <T>(path: string, body?: unknown, base?: string) => request<T>('POST', path, body, base)
const del = <T>(path: string, base?: string) => request<T>('DELETE', path, undefined, base)

// ---------------------------------------------------------------------------

export interface UserInfo {
  id: string
  username: string
  displayName: string | null
  role: string
  studentName: string | null
  studentGrade: string | null
  guardianId: string | null
  hasSetPassword: boolean
}

export interface StudentRecord {
  id: string; name: string; grade: string | null; token: string; hasSetPassword: boolean
  inviteCode: string | null
}

export const authApi = {
  // Token 登录（首次 / 恢复）
  login: (syncToken: string) =>
    post<UserInfo & { needsSetup?: boolean }>('/auth/login', { syncToken }),
  // 密码登录（常规）
  loginWithPassword: (username: string, password: string) =>
    post<UserInfo & { needsSetup?: boolean; syncToken?: string }>('/auth/login/password', { username, password }),
  // 首次登录后设置用户名+密码
  setupAccount: (username: string, password: string) =>
    post('/auth/setup-account', { username, password }),
  // 修改密码
  changePassword: (oldPassword: string, newPassword: string) =>
    post('/auth/change-password', { oldPassword, newPassword }),
  me: () => get<UserInfo>('/auth/me'),
  setup: (guardianName: string) =>
    post('/auth/setup', { guardianName }),
  listStudents: () => get<StudentRecord[]>('/auth/students'),
  createStudent: (name: string, grade?: string, subjects?: string[]) =>
    post<StudentRecord>('/auth/students', { name, grade, subjects }),
  deleteStudent: (id: string) => del(`/auth/students/${id}`),
  resetToken: () => post('/auth/reset-token')
}

export const settingsApi = {
  getModels: () => get('/settings/models'),
  saveAIConfig: (provider: string, modelId: string, modelName: string, apiKey: string, baseUrl?: string) =>
    post('/settings/ai', { provider, modelId, modelName, apiKey, baseUrl }),
  getAIConfig: () => get('/settings/ai'),
  saveWolframConfig: (appId: string) => post('/settings/wolfram', { appId }),
  getWolframConfig: () => get('/settings/wolfram'),
  testWolframConfig: (appId: string) => post('/settings/wolfram/test', { appId })
}

export const planApi = {
  create: (title: string, description: string, subjects: string[]) =>
    post('/plans', { title, description, subjects }),
  getActive: () => get('/plans/active'),
  list: () => get('/plans')
}

export const agentApi = {
  getLogs: (limit?: number) => get(`/agent/logs${limit ? `?limit=${limit}` : ''}`),
  getTasks: (status?: string, page?: number, pageSize?: number) =>
    get(`/agent/tasks?${new URLSearchParams({
      ...(status ? { status } : {}),
      page: String(page || 1),
      pageSize: String(pageSize || 20)
    })}`),
  runCycle: () => post('/agent/run'),
  runProactiveReport: () => post('/agent/report'),
  setDoNotDisturb: (start: string, end: string) => post('/agent/dnd', { start, end }),
  clearDoNotDisturb: () => del('/agent/dnd')
}

export interface MsgImage {
  type: 'image'
  data: string      // base64
  mediaType: string
}
export interface MsgText { type: 'text'; text: string }
export type MsgContent = string | Array<MsgText | MsgImage>

export interface ApiMessage {
  role: 'user' | 'assistant'
  content: MsgContent
}

export const chatApi = {
  send: (message: string) => post('/chat/send', { message }),

  stream(
    messages: ApiMessage[],
    onToken: (token: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
    onThinking?: (toolName: string, display: string) => void,
    options?: { sandbox?: boolean }
  ): AbortController {
    const controller = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(`${BASE}/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-sync-token': getSyncToken() },
          body: JSON.stringify({ messages, ...(options?.sandbox ? { sandbox: true } : {}) }),
          signal: controller.signal
        })
        if (!res.ok || !res.body) {
          if (res.status === 429) onError('发送太频繁，请稍等片刻再试')
          else if (res.status === 401) onError('登录已过期，请重新登录')
          else onError(`请求失败（${res.status}）`)
          return
        }
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) { onDone(); break }
          buf += dec.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (raw === '[DONE]') { onDone(); return }
            try {
              const p = JSON.parse(raw)
              if (p.ping) continue
              if (p.token != null) onToken(p.token)
              else if (p.tool) onThinking?.(p.tool, p.display ?? p.tool)
              else if (p.thinking) onThinking?.('thinking', p.thinking)
              else if (p.error) { onError(p.error); return }
            } catch {}
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') onError((err as Error).message || '网络错误')
      }
    })()
    return controller
  }
}

export interface StudentGoal {
  exam_type: string | null
  exam_date: number | null
  school_progress: string | null
  guardian_notes: string | null
}

export const goalsApi = {
  get: () => get<StudentGoal>('/goals'),
  save: (data: { examType?: string; examDate?: number; schoolProgress?: string; guardianNotes?: string }) =>
    post('/goals', data)
}

export const dataApi = {
  recordLearning: (data: unknown) => post('/data/learning', data),
  getSummary: (dateFrom: number, dateTo: number, subject?: string) =>
    get(`/data/summary?dateFrom=${dateFrom}&dateTo=${dateTo}${subject ? `&subject=${subject}` : ''}`)
}

export const workspaceApi = {
  write: (relativePath: string, content: string) =>
    post('/workspace/write', { relativePath, content }, workspaceBase()),
  read: (relativePath: string) =>
    get(`/workspace/read?path=${encodeURIComponent(relativePath)}`, workspaceBase()),
  list: (relativePath: string) =>
    get(`/workspace/list?path=${encodeURIComponent(relativePath)}`, workspaceBase()),
  delete: (relativePath: string) =>
    del(`/workspace/delete?path=${encodeURIComponent(relativePath)}`, workspaceBase()),
  getStats: () =>
    get('/workspace/stats', workspaceBase()),
  cleanupTemp: () =>
    post('/workspace/cleanup-temp', undefined, workspaceBase())
}

export interface AIModel {
  id: string; name: string; provider: string; baseUrl?: string
  contextLength?: number; supportsImages: boolean; supportsTools: boolean
}
export interface AIConfig {
  provider: string; modelId: string; modelName?: string
  apiKey: string; apiKeyMasked?: string; baseUrl?: string
}
export interface Plan {
  id: string; student_id: string; title: string; description: string
  subjects: string[]; status: 'active' | 'archived'
  create_time: number; update_time: number
}
export interface SummaryData {
  totalSessions: number; totalMinutes: number; averageScore: number
  subjects: string[]; recentTopics: string[]
  weakPoints?: Array<{ topic: string; subject: string; weakness_score: number }>
}
export interface AgentLog {
  id: string; student_id: string; action_type: string; action_detail: string
  trigger_type: string; model_used: string; status: string
  error_message: string; create_time: number
}
export interface AgentTask {
  id: string; task_type: string; student_id: string; status: string
  trigger_type: string; input_summary: string; output: string
  error: string; started_at: number; completed_at: number; create_time: number
}
export interface WorkspaceStats {
  fileCount: number; totalSize: number; diskFree: number; diskTotal: number
  usage?: number; warning?: boolean
}
export interface UdpBotStatus { running: boolean; port: number; sessions?: number; uptime?: number }
export const botApi = { listBots: () => Promise.resolve({ success: true, data: [] }) }
export const udpApi = { getStatus: () => Promise.resolve({ success: true, data: { running: false, port: 0 } }) }

export const notifyApi = {
  getMessages: (limit?: number) => get(`/notify/messages${limit ? `?limit=${limit}` : ''}`)
}

export interface SRSItem {
  id: string; topic: string; subject: string; confidence: number
  srsInterval: number; srsEase: number; srsReps: number
  srsDueAt: number | null; lastPracticed: number | null
}

export const srsApi = {
  getDue: () => get<SRSItem[]>('/srs/due'),
  getCount: () => get<{ count: number }>('/srs/count'),
  review: (id: string, grade: number) => post(`/srs/${id}/review`, { grade })
}

export interface GradedProblem {
  index: number; question: string; studentAnswer: string
  correct: boolean; score: number; maxScore: number
  explanation: string; errorType?: string
}
export interface HomeworkResult {
  problems: GradedProblem[]; totalScore: number; maxTotal: number
  percentage: number; summary: string; weakTopics: string[]
}

export const homeworkApi = {
  grade: (image: string, mimeType: string, subject?: string) =>
    post<HomeworkResult>('/homework/grade', { image, mimeType, subject })
}

export const reportApi = {
  weeklyUrl: () => `${BASE}/report/weekly`,
  weeklyJson: () => get('/report/weekly/json')
}
