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
  source_email?: string
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
  contextLength?: number
  supportsImages: boolean
  supportsTools: boolean
  cached?: boolean
}

export interface AIConfig {
  provider: string
  modelId: string
  modelName?: string
  apiKey: string
  apiKeyMasked?: string
  baseUrl?: string
}

export interface EmailConfig {
  email?: string
  imapHost?: string
  imapPort?: number
  configured: boolean
}

export interface EmailStatus {
  polling: boolean
  lastCheck: string | null
  error: string | null
}

export interface WorkspaceStats {
  usage: number
  limit: number
  usagePercent: number
  path: string
}

export interface RegisterFileParams {
  relativePath: string
  fileName: string
  fileType: string
  fileSize: number
  category: string
  studentId?: number
  sourceEmail?: string
  description?: string
  tags?: string[]
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

export interface SystemUser {
  id: string
  username: string
  role: string
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
  ): Promise<ApiResponse<{ message: string }>> => window.api.auth.bind(token, studentId),

  listUsers: (token: string): Promise<ApiResponse<SystemUser[]>> =>
    window.api.auth.listUsers(token)
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
    subject?: string,
    sourceEmail?: string
  ): Promise<ApiResponse<Resource>> =>
    window.api.resource.upload(token, filePath, fileName, fileType, subject, sourceEmail),

  list: (
    token: string,
    subject?: string,
    fileType?: string,
    page?: number,
    pageSize?: number
  ): Promise<ApiResponse<ResourceListData>> =>
    window.api.resource.list(token, subject, fileType, page, pageSize),

  delete: (token: string, resourceId: string): Promise<ApiResponse<{ message: string }>> =>
    window.api.resource.delete(token, resourceId)
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
    modelName: string,
    apiKey: string,
    baseUrl?: string
  ): Promise<ApiResponse<{ message: string }>> =>
    window.api.settings.saveAIConfig(token, provider, modelId, modelName, apiKey, baseUrl),

  getAIConfig: (): Promise<ApiResponse<AIConfig>> => window.api.settings.getAIConfig(),

  saveEmailConfig: (
    token: string,
    email: string,
    authCode: string,
    imapHost: string,
    imapPort: number
  ): Promise<ApiResponse<{ message: string }>> =>
    window.api.settings.saveEmailConfig(token, email, authCode, imapHost, imapPort),

  getEmailConfig: (token: string): Promise<ApiResponse<EmailConfig>> =>
    window.api.settings.getEmailConfig(token),

  testEmailConnection: (token: string): Promise<ApiResponse<{ message: string }>> =>
    window.api.settings.testEmailConnection(token)
}

// ==================== EMAIL ====================

export const emailApi = {
  getStatus: (): Promise<ApiResponse<EmailStatus>> => window.api.email.getStatus(),
  startPolling: (): Promise<ApiResponse<{ message: string }>> => window.api.email.startPolling(),
  stopPolling: (): Promise<ApiResponse<{ message: string }>> => window.api.email.stopPolling()
}

// ==================== WORKSPACE ====================

export const workspaceApi = {
  write: (
    relativePath: string,
    content: string
  ): Promise<ApiResponse<{ absolutePath: string }>> =>
    window.api.workspace.write(relativePath, content),

  read: (relativePath: string): Promise<ApiResponse<string>> =>
    window.api.workspace.read(relativePath),

  list: (relativePath: string): Promise<ApiResponse<unknown[]>> =>
    window.api.workspace.list(relativePath),

  delete: (relativePath: string): Promise<ApiResponse<{ message?: string }>> =>
    window.api.workspace.delete(relativePath),

  getStats: (): Promise<ApiResponse<WorkspaceStats>> => window.api.workspace.getStats(),

  getEffectiveLimit: (): Promise<ApiResponse<{ limit: number }>> =>
    window.api.workspace.getEffectiveLimit(),

  registerFile: (params: RegisterFileParams): Promise<ApiResponse<{ message: string }>> =>
    window.api.workspace.registerFile(params),

  cleanupTemp: (): Promise<ApiResponse<{ deleted: number; freedBytes: number }>> =>
    window.api.workspace.cleanupTemp()
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
