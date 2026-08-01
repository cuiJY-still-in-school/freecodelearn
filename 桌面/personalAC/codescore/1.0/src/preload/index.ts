import { contextBridge, ipcRenderer } from 'electron'

// Expose all IPC calls as window.api.xxx
contextBridge.exposeInMainWorld('api', {
  // ==================== AUTH ====================
  auth: {
    register: (username: string, password: string, role: string) =>
      ipcRenderer.invoke('auth:register', username, password, role),
    login: (username: string, password: string) =>
      ipcRenderer.invoke('auth:login', username, password),
    logout: (token: string) => ipcRenderer.invoke('auth:logout', token),
    verifyToken: (token: string) => ipcRenderer.invoke('auth:verifyToken', token),
    bind: (token: string, studentId: string) => ipcRenderer.invoke('auth:bind', token, studentId)
  },

  // ==================== PLAN ====================
  plan: {
    create: (
      token: string,
      studentId: string,
      title: string,
      description: string,
      subjects: string[]
    ) => ipcRenderer.invoke('plan:create', token, studentId, title, description, subjects),
    getActive: (token: string, studentId: string) =>
      ipcRenderer.invoke('plan:getActive', token, studentId),
    list: (token: string, studentId: string) =>
      ipcRenderer.invoke('plan:list', token, studentId)
  },

  // ==================== RESOURCE ====================
  resource: {
    upload: (
      token: string,
      filePath: string,
      fileName: string,
      fileType: string,
      subject?: string
    ) => ipcRenderer.invoke('resource:upload', token, filePath, fileName, fileType, subject),
    list: (
      token: string,
      subject?: string,
      fileType?: string,
      page?: number,
      pageSize?: number
    ) => ipcRenderer.invoke('resource:list', token, subject, fileType, page, pageSize),
    delete: (token: string, resourceId: string) =>
      ipcRenderer.invoke('resource:delete', token, resourceId),
    openFileDialog: () => ipcRenderer.invoke('resource:openFileDialog')
  },

  // ==================== DATA ====================
  data: {
    recordLearning: (token: string, data: unknown) =>
      ipcRenderer.invoke('data:recordLearning', token, data),
    getSummary: (
      token: string,
      studentId: string,
      dateFrom: number,
      dateTo: number,
      subject?: string
    ) => ipcRenderer.invoke('data:getSummary', token, studentId, dateFrom, dateTo, subject)
  },

  // ==================== BOT ====================
  bot: {
    install: (token: string, botType: string, credential: string) =>
      ipcRenderer.invoke('bot:install', token, botType, credential),
    uninstall: (token: string, botConfigId: string) =>
      ipcRenderer.invoke('bot:uninstall', token, botConfigId),
    bindUser: (token: string, userId: string, botConfigId: string, platformUserId: string) =>
      ipcRenderer.invoke('bot:bindUser', token, userId, botConfigId, platformUserId),
    listBots: (token: string) => ipcRenderer.invoke('bot:listBots', token),
    sendMessage: (userId: string, content: string, messageType?: string) =>
      ipcRenderer.invoke('bot:sendMessage', userId, content, messageType)
  },

  // ==================== SETTINGS ====================
  settings: {
    getModels: () => ipcRenderer.invoke('settings:getModels'),
    saveAIConfig: (
      token: string,
      provider: string,
      modelId: string,
      apiKey: string,
      baseUrl?: string
    ) => ipcRenderer.invoke('settings:saveAIConfig', token, provider, modelId, apiKey, baseUrl),
    getAIConfig: () => ipcRenderer.invoke('settings:getAIConfig')
  },

  // ==================== WORKSPACE ====================
  workspace: {
    write: (subDir: string, fileName: string, content: string) =>
      ipcRenderer.invoke('workspace:write', subDir, fileName, content),
    read: (filePath: string) => ipcRenderer.invoke('workspace:read', filePath),
    list: (subDir: string) => ipcRenderer.invoke('workspace:list', subDir),
    delete: (filePath: string) => ipcRenderer.invoke('workspace:delete', filePath),
    getStats: () => ipcRenderer.invoke('workspace:getStats')
  },

  // ==================== AGENT ====================
  agent: {
    getLogs: (studentId: string, limit?: number) =>
      ipcRenderer.invoke('agent:getLogs', studentId, limit),
    setDoNotDisturb: (start: string, end: string) =>
      ipcRenderer.invoke('agent:setDoNotDisturb', start, end),
    clearDoNotDisturb: () => ipcRenderer.invoke('agent:clearDoNotDisturb'),
    runCycle: (studentId: string) => ipcRenderer.invoke('agent:runCycle', studentId)
  }
})
