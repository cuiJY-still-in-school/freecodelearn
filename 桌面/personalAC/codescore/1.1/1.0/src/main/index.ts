import { app, BrowserWindow, Tray, Menu, nativeImage, powerMonitor } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import log from 'electron-log'
import { initDatabase, closeDatabase } from './database'
import { registerIpcHandlers } from './ipc/handlers'
import { AgentEngine } from './agent'

log.initialize({ preload: true })
log.info('App starting...')

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let agentEngine: AgentEngine | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (tray) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  try {
    // Try to load tray icon; use empty image as fallback
    let trayIcon = nativeImage.createEmpty()
    try {
      trayIcon = nativeImage.createFromPath(join(__dirname, '../../resources/tray-icon.png'))
    } catch {
      log.warn('Tray icon not found, using empty image')
    }

    tray = new Tray(trayIcon)
    tray.setToolTip('PersonalAC - 个性化学习辅助系统')

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          tray = null
          app.quit()
        }
      }
    ])

    tray.setContextMenu(contextMenu)

    tray.on('double-click', () => {
      if (mainWindow?.isVisible()) {
        mainWindow.focus()
      } else {
        mainWindow?.show()
      }
    })

    log.info('System tray created')
  } catch (err) {
    log.error('Failed to create tray:', err)
  }
}

function setupPowerMonitor(): void {
  powerMonitor.on('resume', () => {
    log.info('System resumed from sleep')
    agentEngine?.getScheduler().compensateMissedTasks()
  })

  powerMonitor.on('suspend', () => {
    log.info('System going to sleep')
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.personalac.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize database
  try {
    initDatabase()
    log.info('Database initialized')
  } catch (err) {
    log.error('Failed to initialize database:', err)
    app.quit()
    return
  }

  // Register IPC handlers
  registerIpcHandlers()

  // Initialize Agent Engine
  agentEngine = new AgentEngine()
  agentEngine.init()

  // Create main window
  createWindow()

  // Create system tray
  createTray()

  // Setup power monitor
  setupPowerMonitor()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      mainWindow?.show()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // On Linux/Windows, if tray exists keep running; otherwise quit
    if (!tray) {
      app.quit()
    }
  }
})

app.on('before-quit', () => {
  log.info('App quitting...')
  agentEngine?.destroy()
  closeDatabase()
  tray?.destroy()
})

app.on('will-quit', () => {
  log.info('App will quit')
})
