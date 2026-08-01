const BASE = '/api'

function token(): string {
  return localStorage.getItem('syncToken') || ''
}

async function fetchApi(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-sync-token': token(),
      ...options.headers,
    },
  })
  return res.json()
}

// ── Auth ─────────────────────────────────────────
export const authApi = {
  // OTP
  sendOtp: (email: string) => fetchApi('/auth/send-otp', { method: 'POST', body: JSON.stringify({ email }) }),
  verifyOtp: (email: string, code: string, inviteCode?: string) => fetchApi('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, code, inviteCode }) }),
  // 密码
  login: (email: string, password: string) => fetchApi('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string, displayName: string) => fetchApi('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName }) }),
  setupPassword: (syncToken: string, password: string) => fetchApi('/auth/setup-password', { method: 'POST', body: JSON.stringify({ syncToken, password }) }),
  changePassword: (oldPassword: string, newPassword: string) => fetchApi('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) }),
  // Token
  loginToken: (syncToken: string) => fetchApi('/auth/login/token', { method: 'POST', body: JSON.stringify({ syncToken }) }),
  // 通用
  me: () => fetchApi('/auth/me'),
  students: () => fetchApi('/auth/students'),
  createStudent: (name: string, grade?: string) => fetchApi('/auth/students', { method: 'POST', body: JSON.stringify({ name, grade }) }),
  resetToken: () => fetchApi('/auth/reset-token', { method: 'POST' }),
  setup: (guardianName: string) => fetchApi('/auth/setup', { method: 'POST', body: JSON.stringify({ guardianName }) }),
  completeSetup: (displayName?: string, password?: string) => fetchApi('/auth/complete-setup', { method: 'POST', body: JSON.stringify({ displayName, password }) }),
  // 邀请
  joinInfo: (code: string) => fetchApi(`/auth/join/${code}`),
  joinActivate: (code: string, password: string, displayName?: string, email?: string) => fetchApi(`/auth/join/${code}`, { method: 'POST', body: JSON.stringify({ password, displayName, email }) }),
  // 学生管理
  resetStudentInvite: (studentId: string) => fetchApi(`/auth/students/${studentId}/reset-invite`, { method: 'POST' }),
  resetStudentToken: (studentId: string) => fetchApi(`/auth/students/${studentId}/reset-token`, { method: 'POST' }),
  // 绑定
  bindEmail: (email: string, code: string) => fetchApi('/auth/bind-email', { method: 'POST', body: JSON.stringify({ email, code }) }),
}

// ── Board ────────────────────────────────────────
export const boardApi = {
  get: (studentId?: string, mode: string = 'study') =>
    fetchApi(`/board?${studentId ? `studentId=${studentId}&` : ''}mode=${mode}`),
  addBlock: (blockType: string, content: any, studentId?: string, mode: string = 'study', position?: number) =>
    fetchApi('/board/blocks', { method: 'POST', body: JSON.stringify({ blockType, content, studentId, mode, position }) }),
  updateBlock: (id: string, content?: any, blockType?: string) =>
    fetchApi(`/board/blocks/${id}`, { method: 'PATCH', body: JSON.stringify({ content, blockType }) }),
  deleteBlock: (id: string) => fetchApi(`/board/blocks/${id}`, { method: 'DELETE' }),
  reorder: (blockIds: string[], studentId?: string, mode: string = 'study') =>
    fetchApi('/board/reorder', { method: 'POST', body: JSON.stringify({ blockIds, studentId, mode }) }),
}

// ── Companion ────────────────────────────────────
export const companionApi = {
  getState: (studentId?: string) => fetchApi(`/companion/state?${studentId ? `studentId=${studentId}` : ''}`),
  updateConfig: (companionName?: string, companionStyle?: string, studentId?: string) =>
    fetchApi('/companion/config', { method: 'POST', body: JSON.stringify({ companionName, companionStyle, studentId }) }),
}

// ── Chat (SSE stream with optional canvas image) ──
function streamChat(
  messages: Array<{ role: string; content: string }>,
  mode: string,
  canvasImage: string | null,
  studentId: string | undefined,
  onToken?: (t: string) => void,
  onBoardAction?: (a: any) => void,
  onCompanion?: (s: string) => void,
  onDone?: () => void,
  onError?: (e: string) => void,
) {
  const controller = new AbortController()
  const body: any = { messages, mode, studentId }
  if (canvasImage) body.canvasImage = canvasImage

  fetch(`${BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sync-token': token() },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) throw new Error('Stream failed')
    const reader = res.body?.getReader()
    if (!reader) throw new Error('No reader')
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (raw === '[DONE]') { onDone?.(); return }
        try {
          const p = JSON.parse(raw)
          if (p.token) onToken?.(p.token)
          if (p.board_action) onBoardAction?.(p.board_action)
          if (p.companion) onCompanion?.(p.companion)
          if (p.error) onError?.(p.error)
        } catch (_) {}
      }
    }
  }).catch(err => { if (err.name !== 'AbortError') onError?.(err.message) })
  return { abort: () => controller.abort() }
}

export const chatApi = {
  streamWithImage: streamChat,
}

// ── Homework ─────────────────────────────────────
export const homeworkApi = {
  list: (studentId?: string, status?: string) =>
    fetchApi(`/homework?${studentId ? `studentId=${studentId}&` : ''}${status ? `status=${status}` : ''}`),
  create: (subject: string, title: string, description?: string, difficulty?: string, studentId?: string) =>
    fetchApi('/homework', { method: 'POST', body: JSON.stringify({ subject, title, description, difficulty, studentId }) }),
  submit: (id: string, score?: number, reviewNotes?: string) =>
    fetchApi(`/homework/${id}/submit`, { method: 'POST', body: JSON.stringify({ score, reviewNotes }) }),
}

// ── Guardian ─────────────────────────────────────
export const guardianApi = {
  commands: () => fetchApi('/guardian/commands'),
  createCommand: (studentId: string, instruction: string, priority?: string) =>
    fetchApi('/guardian/commands', { method: 'POST', body: JSON.stringify({ studentId, instruction, priority }) }),
  deleteCommand: (id: string) => fetchApi(`/guardian/commands/${id}`, { method: 'DELETE' }),
  overview: (studentId?: string) =>
    fetchApi(`/guardian/overview${studentId ? `/${studentId}` : ''}`),
}

// ── Settings ─────────────────────────────────────
export const settingsApi = {
  getAI: () => fetchApi('/settings/ai'),
  saveAI: (provider: string, modelId: string, modelName: string, apiKey: string, baseUrl?: string) =>
    fetchApi('/settings/ai', { method: 'POST', body: JSON.stringify({ provider, modelId, modelName, apiKey, baseUrl }) }),
}
