const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");

const DEV_PORT = 3000;
let serverProcess = null;
let win = null;

function isDev() {
  return !app.isPackaged;
}

function getNextCmd() {
  if (isDev()) return null;
  return path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    "server",
    "node_modules",
    "next",
    "dist",
    "bin",
    "next"
  );
}

function getServerDir() {
  return path.join(process.resourcesPath, "app.asar.unpacked", "server");
}

function findFreePort(start) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      if (port > start + 20) return reject(new Error("无可用端口"));
      const srv = net.createServer();
      srv.once("error", () => {
        srv.close();
        tryPort(port + 1);
      });
      srv.listen(port, () => {
        const p = srv.address().port;
        srv.close(() => resolve(p));
      });
    };
    tryPort(start);
  });
}

function waitForServer(url, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      net
        .connect({ port: new URL(url).port, host: "127.0.0.1" })
        .on("connect", function () {
          this.destroy();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - started > timeoutMs) return reject(new Error("server 启动超时"));
          setTimeout(check, 300);
        });
    };
    check();
  });
}

async function startServer() {
  const port = await findFreePort(DEV_PORT);
  const env = {
    ...process.env,
    FCL_DATA_DIR: app.getPath("userData"),
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
  };

  if (isDev()) {
    serverProcess = spawn("npm", ["run", "start", "--", "-p", String(port)], {
      cwd: path.join(__dirname, ".."),
      env,
      stdio: "inherit",
    });
  } else {
    // 用 Electron 自带 Node 运行时(ELECTRON_RUN_AS_NODE)跑 next start
    serverProcess = spawn(
      process.execPath,
      [getNextCmd(), "start", "-p", String(port), "-H", "127.0.0.1"],
      {
        cwd: getServerDir(),
        env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
        stdio: "ignore",
      }
    );
  }
  serverProcess.on("exit", (code) => {
    if (code !== 0 && app.isReady()) {
      console.error("next server 退出 code=" + code);
    }
  });

  await waitForServer(`http://127.0.0.1:${port}`);
  return `http://127.0.0.1:${port}`;
}

function createWindow(url) {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    title: "FreeCodeLearn",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(url);

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith("http")) {
      shell.openExternal(target);
    }
    return { action: "deny" };
  });

  win.on("closed", () => {
    win = null;
  });
}

app.whenReady().then(async () => {
  try {
    const url = await startServer();
    createWindow(url);
  } catch (err) {
    console.error("启动失败:", err);
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && win === null) {
      startServer()
        .then((url) => createWindow(url))
        .catch(() => app.quit());
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
});
