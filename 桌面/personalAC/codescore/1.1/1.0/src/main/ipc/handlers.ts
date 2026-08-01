import { ipcMain, dialog } from 'electron'
import * as authService from '../services/auth.service'
import * as planService from '../services/plan.service'
import * as resourceService from '../services/resource.service'
import * as dataService from '../services/data.service'
import * as botService from '../services/bot.service'
import * as settingsService from '../services/settings.service'
import * as workspaceService from '../services/workspace.service'
import { getAgentEngine } from '../agent'
import log from 'electron-log'

export function registerIpcHandlers(): void {
  // ==================== AUTH ====================

  ipcMain.handle('auth:register', async (_event, username: string, password: string, role: string) => {
    try {
      return authService.register(username, password, role as 'teacher' | 'guardian' | 'student')
    } catch (err) {
      log.error('IPC auth:register error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('auth:login', async (_event, username: string, password: string) => {
    try {
      return authService.login(username, password)
    } catch (err) {
      log.error('IPC auth:login error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('auth:logout', async (_event, token: string) => {
    try {
      return authService.logout(token)
    } catch (err) {
      log.error('IPC auth:logout error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('auth:verifyToken', async (_event, token: string) => {
    try {
      const result = authService.verifyToken(token)
      return { success: result.valid, data: result.user, error: result.valid ? undefined : 'Token 无效' }
    } catch (err) {
      log.error('IPC auth:verifyToken error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('auth:bind', async (_event, token: string, studentId: string) => {
    try {
      return authService.bindGuardian(token, studentId)
    } catch (err) {
      log.error('IPC auth:bind error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ==================== PLAN ====================

  ipcMain.handle(
    'plan:create',
    async (
      _event,
      token: string,
      studentId: string,
      title: string,
      description: string,
      subjects: string[]
    ) => {
      try {
        return planService.create(token, studentId, title, description, subjects)
      } catch (err) {
        log.error('IPC plan:create error:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle('plan:getActive', async (_event, token: string, studentId: string) => {
    try {
      return planService.getActive(token, studentId)
    } catch (err) {
      log.error('IPC plan:getActive error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('plan:list', async (_event, token: string, studentId: string) => {
    try {
      return planService.listPlans(token, studentId)
    } catch (err) {
      log.error('IPC plan:list error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ==================== RESOURCE ====================

  ipcMain.handle(
    'resource:upload',
    async (
      _event,
      token: string,
      filePath: string,
      fileName: string,
      fileType: string,
      subject?: string
    ) => {
      try {
        return await resourceService.upload(token, filePath, fileName, fileType, subject)
      } catch (err) {
        log.error('IPC resource:upload error:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(
    'resource:list',
    async (
      _event,
      token: string,
      subject?: string,
      fileType?: string,
      page?: number,
      pageSize?: number
    ) => {
      try {
        return resourceService.list(token, subject, fileType, page, pageSize)
      } catch (err) {
        log.error('IPC resource:list error:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle('resource:delete', async (_event, token: string, resourceId: string) => {
    try {
      return resourceService.deleteResource(token, resourceId)
    } catch (err) {
      log.error('IPC resource:delete error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Open file dialog for resource upload
  ipcMain.handle('resource:openFileDialog', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'txt', 'md'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, data: null }
      }
      return { success: true, data: result.filePaths[0] }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ==================== DATA ====================

  ipcMain.handle(
    'data:recordLearning',
    async (_event, token: string, data: dataService.LearningRecordInput) => {
      try {
        return dataService.recordLearning(token, data)
      } catch (err) {
        log.error('IPC data:recordLearning error:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(
    'data:getSummary',
    async (
      _event,
      token: string,
      studentId: string,
      dateFrom: number,
      dateTo: number,
      subject?: string
    ) => {
      try {
        return dataService.getSummary(token, studentId, dateFrom, dateTo, subject)
      } catch (err) {
        log.error('IPC data:getSummary error:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // ==================== BOT ====================

  ipcMain.handle(
    'bot:install',
    async (_event, token: string, botType: botService.BotType, credential: string) => {
      try {
        return botService.install(token, botType, credential)
      } catch (err) {
        log.error('IPC bot:install error:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle('bot:uninstall', async (_event, token: string, botConfigId: string) => {
    try {
      return botService.uninstall(token, botConfigId)
    } catch (err) {
      log.error('IPC bot:uninstall error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(
    'bot:bindUser',
    async (
      _event,
      token: string,
      userId: string,
      botConfigId: string,
      platformUserId: string
    ) => {
      try {
        return botService.bindUser(token, userId, botConfigId, platformUserId)
      } catch (err) {
        log.error('IPC bot:bindUser error:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle('bot:listBots', async (_event, token: string) => {
    try {
      return botService.listBots(token)
    } catch (err) {
      log.error('IPC bot:listBots error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(
    'bot:sendMessage',
    async (_event, userId: string, content: string, messageType?: string) => {
      try {
        return await botService.sendMessage(userId, content, messageType)
      } catch (err) {
        log.error('IPC bot:sendMessage error:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // ==================== SETTINGS ====================

  ipcMain.handle('settings:getModels', async () => {
    try {
      return await settingsService.getModels()
    } catch (err) {
      log.error('IPC settings:getModels error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(
    'settings:saveAIConfig',
    async (
      _event,
      token: string,
      provider: string,
      modelId: string,
      apiKey: string,
      baseUrl?: string
    ) => {
      try {
        return settingsService.saveAIConfig(token, provider, modelId, apiKey, baseUrl)
      } catch (err) {
        log.error('IPC settings:saveAIConfig error:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle('settings:getAIConfig', async () => {
    try {
      return settingsService.getAIConfig()
    } catch (err) {
      log.error('IPC settings:getAIConfig error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ==================== WORKSPACE ====================

  ipcMain.handle(
    'workspace:write',
    async (_event, subDir: string, fileName: string, content: string) => {
      try {
        const path = await workspaceService.write(subDir, fileName, content)
        return { success: true, data: { path } }
      } catch (err) {
        log.error('IPC workspace:write error:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle('workspace:read', async (_event, filePath: string) => {
    try {
      return workspaceService.read(filePath)
    } catch (err) {
      log.error('IPC workspace:read error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('workspace:list', async (_event, subDir: string) => {
    try {
      return workspaceService.list(subDir)
    } catch (err) {
      log.error('IPC workspace:list error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('workspace:delete', async (_event, filePath: string) => {
    try {
      return workspaceService.deleteFile(filePath)
    } catch (err) {
      log.error('IPC workspace:delete error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('workspace:getStats', async () => {
    try {
      return workspaceService.getStats()
    } catch (err) {
      log.error('IPC workspace:getStats error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ==================== AGENT ====================

  ipcMain.handle('agent:getLogs', async (_event, studentId: string, limit?: number) => {
    try {
      const engine = getAgentEngine()
      if (!engine) {
        return { success: false, error: 'Agent 引擎未初始化' }
      }
      const logs = engine.getRecentLogs(studentId, limit || 20)
      return { success: true, data: logs }
    } catch (err) {
      log.error('IPC agent:getLogs error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('agent:setDoNotDisturb', async (_event, start: string, end: string) => {
    try {
      const engine = getAgentEngine()
      if (!engine) {
        return { success: false, error: 'Agent 引擎未初始化' }
      }
      engine.setDoNotDisturb(start, end)
      return { success: true, data: { message: `免打扰已设置: ${start} - ${end}` } }
    } catch (err) {
      log.error('IPC agent:setDoNotDisturb error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('agent:clearDoNotDisturb', async () => {
    try {
      const engine = getAgentEngine()
      if (!engine) {
        return { success: false, error: 'Agent 引擎未初始化' }
      }
      engine.clearDoNotDisturb()
      return { success: true, data: { message: '免打扰已清除' } }
    } catch (err) {
      log.error('IPC agent:clearDoNotDisturb error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('agent:runCycle', async (_event, studentId: string) => {
    try {
      const engine = getAgentEngine()
      if (!engine) {
        return { success: false, error: 'Agent 引擎未初始化' }
      }
      engine.runAutonomousCycle(studentId)
      return { success: true, data: { message: 'Agent 周期已触发' } }
    } catch (err) {
      log.error('IPC agent:runCycle error:', err)
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  log.info('All IPC handlers registered')
}
