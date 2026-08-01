// Global type declarations for the Electron preload API exposed via contextBridge

interface Window {
  api: {
    auth: {
      register(username: string, password: string, role: string): Promise<{ success: boolean; data?: unknown; error?: string }>
      login(username: string, password: string): Promise<{ success: boolean; data?: unknown; error?: string }>
      logout(token: string): Promise<{ success: boolean; data?: unknown; error?: string }>
      verifyToken(token: string): Promise<{ success: boolean; data?: unknown; error?: string }>
      bind(token: string, studentId: string): Promise<{ success: boolean; data?: unknown; error?: string }>
      listUsers(token: string): Promise<{ success: boolean; data?: unknown; error?: string }>
    }
    plan: {
      create(token: string, studentId: string, title: string, description: string, subjects: string[]): Promise<{ success: boolean; data?: unknown; error?: string }>
      getActive(token: string, studentId: string): Promise<{ success: boolean; data?: unknown; error?: string }>
      list(token: string, studentId: string): Promise<{ success: boolean; data?: unknown; error?: string }>
    }
    resource: {
      upload(token: string, filePath: string, fileName: string, fileType: string, subject?: string, sourceEmail?: string): Promise<{ success: boolean; data?: unknown; error?: string }>
      list(token: string, subject?: string, fileType?: string, page?: number, pageSize?: number): Promise<{ success: boolean; data?: unknown; error?: string }>
      delete(token: string, resourceId: string): Promise<{ success: boolean; data?: unknown; error?: string }>
    }
    data: {
      recordLearning(token: string, data: unknown): Promise<{ success: boolean; data?: unknown; error?: string }>
      getSummary(token: string, studentId: string, dateFrom: number, dateTo: number, subject?: string): Promise<{ success: boolean; data?: unknown; error?: string }>
    }
    bot: {
      install(token: string, botType: string, credential: string): Promise<{ success: boolean; data?: unknown; error?: string }>
      uninstall(token: string, botConfigId: string): Promise<{ success: boolean; data?: unknown; error?: string }>
      bindUser(token: string, userId: string, botConfigId: string, platformUserId: string): Promise<{ success: boolean; data?: unknown; error?: string }>
      listBots(token: string): Promise<{ success: boolean; data?: unknown; error?: string }>
      sendMessage(userId: string, content: string, messageType?: string): Promise<{ success: boolean; data?: unknown; error?: string }>
    }
    settings: {
      getModels(): Promise<{ success: boolean; data?: unknown; error?: string }>
      saveAIConfig(token: string, provider: string, modelId: string, modelName: string, apiKey: string, baseUrl?: string): Promise<{ success: boolean; data?: unknown; error?: string }>
      getAIConfig(): Promise<{ success: boolean; data?: unknown; error?: string }>
      saveEmailConfig(token: string, email: string, authCode: string, imapHost: string, imapPort: number): Promise<{ success: boolean; data?: unknown; error?: string }>
      getEmailConfig(token: string): Promise<{ success: boolean; data?: unknown; error?: string }>
      testEmailConnection(token: string): Promise<{ success: boolean; data?: unknown; error?: string }>
    }
    email: {
      getStatus(): Promise<{ success: boolean; data?: unknown; error?: string }>
      startPolling(): Promise<{ success: boolean; data?: unknown; error?: string }>
      stopPolling(): Promise<{ success: boolean; data?: unknown; error?: string }>
    }
    workspace: {
      write(relativePath: string, content: string): Promise<{ success: boolean; data?: unknown; error?: string }>
      read(relativePath: string): Promise<{ success: boolean; data?: unknown; error?: string }>
      list(relativePath: string): Promise<{ success: boolean; data?: unknown; error?: string }>
      delete(relativePath: string): Promise<{ success: boolean; data?: unknown; error?: string }>
      getStats(): Promise<{ success: boolean; data?: unknown; error?: string }>
      getEffectiveLimit(): Promise<{ success: boolean; data?: unknown; error?: string }>
      registerFile(params: unknown): Promise<{ success: boolean; data?: unknown; error?: string }>
      cleanupTemp(): Promise<{ success: boolean; data?: unknown; error?: string }>
    }
    agent: {
      getLogs(studentId: string, limit?: number): Promise<{ success: boolean; data?: unknown; error?: string }>
      setDoNotDisturb(start: string, end: string): Promise<{ success: boolean; data?: unknown; error?: string }>
      clearDoNotDisturb(): Promise<{ success: boolean; data?: unknown; error?: string }>
      runCycle(studentId: string): Promise<{ success: boolean; data?: unknown; error?: string }>
    }
  }
}
