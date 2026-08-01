// Type-safe wrappers around window.api IPC calls

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface UserInfo {
  id: string
  username: string
  role: string
}

export interface AuthData {
  token: string
  userId: string
  username: string
  role: string
  message?: string
}

export interface Plan {
  id: string
  student_id: string
  title: string
  description: string
  subjects: string[]
  status: 'active' | 'archived'
  create_time: number
  update_time: number
}

export interface Resource {
  id: string
  uploader_id: string
  uploader_name?: string
  file_name: string
  file_path: string
  file_type: string
  file_size: number
  subject?: string
  create_time: number
}

export interface ResourceListData {
  total: number
  items: Resource[]
}

export interface LearningRecordInput {
  studentId: string
  subject: string
  topic: string
  score?: number
  durationMinutes?: number
  note?: string
  recordDate?: number
}

export interface SummaryData {
  totalSessions: number
  totalMinutes: number
  avgScore: number | null
  bySubject: Array<{
    subject: string
    sessions: number
    totalMinutes: number
    avgScore: number | null
  }>
  weakPoints: Array<{
    subject: string
    topic: string
    weakness_score: number
    attempt_count: number
  }>
}

export interface BotConfig {
  id: string
  bot_type: string
  status: 'active' | 'inactive'
  installed_by: string
  installed_by_name?: string
  binding_count?: number
  create_time: number
}

export interface AIModel {
  id: string
  name: string
  provider: string
  supportsVision: boolean
  contextLength?: number
}

export interface AIConfig {
  provider: string
  modelId: string
  apiKey: string
  apiKeyMasked?: string
  baseUrl?: string
}

export interface AgentLog {
  id: string
  action_type: string
  action_detail: string | null
  trigger_type: string
  model_used: string | null
  status: string
  create_time: number
}

// ==================== AUTH ====================

export const authApi = {
  register: (
    username: string,
    password: string,
    role: string
  ): Promise<ApiResponse<AuthData>> => window.api.auth.register(username, password, role),

  login: (username: string, password: string): Promise<ApiResponse<AuthData>> =>
    window.api.auth.login(username, password),

  logout: (token: string): Promise<ApiResponse<{ message: string }>> =>
    window.api.auth.logout(token),

  verifyToken: (token: string): Promise<ApiResponse<UserInfo>> =>
    window.api.auth.verifyToken(token),

  bind: (
    token: string,
    studentId: string
  ): Promise<ApiResponse<{ message: string }>> => window.api.auth.bind(token, studentId)
}

// ==================== PLAN ====================

export const planApi = {
  create: (
    token: string,
    studentId: string,
    title: string,
    description: string,
    subjects: string[]
  ): Promise<ApiResponse<Plan>> =>
    window.api.plan.create(token, studentId, title, description, subjects),

  getActive: (token: string, studentId: string): Promise<ApiResponse<Plan | null>> =>
    window.api.plan.getActive(token, studentId),

  list: (token: string, studentId: string): Promise<ApiResponse<Plan[]>> =>
    window.api.plan.list(token, studentId)
}

// ==================== RESOURCE ====================

export const resourceApi = {
  upload: (
    token: string,
    filePath: string,
    fileName: string,
    fileType: string,
    subject?: string
  ): Promise<ApiResponse<Resource>> =>
    window.api.resource.upload(token, filePath, fileName, fileType, subject),

  list: (
    token: string,
    subject?: string,
    fileType?: string,
    page?: number,
    pageSize?: number
  ): Promise<ApiResponse<ResourceListData>> =>
    window.api.resource.list(token, subject, fileType, page, pageSize),

  delete: (token: string, resourceId: string): Promise<ApiResponse<{ message: string }>> =>
    window.api.resource.delete(token, resourceId),

  openFileDialog: (): Promise<ApiResponse<string | null>> => window.api.resource.openFileDialog()
}

// ==================== DATA ====================

export const dataApi = {
  recordLearning: (
    token: string,
    data: LearningRecordInput
  ): Promise<ApiResponse<unknown>> => window.api.data.recordLearning(token, data),

  getSummary: (
    token: string,
    studentId: string,
    dateFrom: number,
    dateTo: number,
    subject?: string
  ): Promise<ApiResponse<SummaryData>> =>
    window.api.data.getSummary(token, studentId, dateFrom, dateTo, subject)
}

// ==================== BOT ====================

export const botApi = {
  install: (
    token: string,
    botType: string,
    credential: string
  ): Promise<ApiResponse<{ id: string; bot_type: string; status: string }>> =>
    window.api.bot.install(token, botType, credential),

  uninstall: (
    token: string,
    botConfigId: string
  ): Promise<ApiResponse<{ message: string }>> =>
    window.api.bot.uninstall(token, botConfigId),

  bindUser: (
    token: string,
    userId: string,
    botConfigId: string,
    platformUserId: string
  ): Promise<ApiResponse<{ message: string }>> =>
    window.api.bot.bindUser(token, userId, botConfigId, platformUserId),

  listBots: (token: string): Promise<ApiResponse<BotConfig[]>> =>
    window.api.bot.listBots(token),

  sendMessage: (
    userId: string,
    content: string,
    messageType?: string
  ): Promise<ApiResponse<{ message: string; messageId: string }>> =>
    window.api.bot.sendMessage(userId, content, messageType)
}

// ==================== SETTINGS ====================

export const settingsApi = {
  getModels: (): Promise<ApiResponse<AIModel[]>> => window.api.settings.getModels(),

  saveAIConfig: (
    token: string,
    provider: string,
    modelId: string,
    apiKey: string,
    baseUrl?: string
  ): Promise<ApiResponse<{ message: string }>> =>
    window.api.settings.saveAIConfig(token, provider, modelId, apiKey, baseUrl),

  getAIConfig: (): Promise<ApiResponse<AIConfig>> => window.api.settings.getAIConfig()
}

// ==================== WORKSPACE ====================

export const workspaceApi = {
  write: (
    subDir: string,
    fileName: string,
    content: string
  ): Promise<ApiResponse<{ path: string }>> =>
    window.api.workspace.write(subDir, fileName, content),

  read: (filePath: string): Promise<ApiResponse<string>> => window.api.workspace.read(filePath),

  list: (subDir: string): Promise<ApiResponse<unknown[]>> => window.api.workspace.list(subDir),

  delete: (filePath: string): Promise<ApiResponse<{ message: string }>> =>
    window.api.workspace.delete(filePath),

  getStats: (): Promise<
    ApiResponse<{ totalSize: number; totalSizeMB: string; fileCount: number; root: string }>
  > => window.api.workspace.getStats()
}

// ==================== AGENT ====================

export const agentApi = {
  getLogs: (studentId: string, limit?: number): Promise<ApiResponse<AgentLog[]>> =>
    window.api.agent.getLogs(studentId, limit),

  setDoNotDisturb: (
    start: string,
    end: string
  ): Promise<ApiResponse<{ message: string }>> =>
    window.api.agent.setDoNotDisturb(start, end),

  clearDoNotDisturb: (): Promise<ApiResponse<{ message: string }>> =>
    window.api.agent.clearDoNotDisturb(),

  runCycle: (studentId: string): Promise<ApiResponse<{ message: string }>> =>
    window.api.agent.runCycle(studentId)
}
