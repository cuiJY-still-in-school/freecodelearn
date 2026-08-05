const { app, BrowserWindow, shell, ipcMain } = require("electron");
const { spawn, exec } = require("child_process");
const path = require("path");
const net = require("net");

const DEV_PORT = 3000;
let serverProcess = null;
let win = null;

// 终端练习白名单:仅允许常见安全命令(不包含 rm/mv/dd/重定向等危险操作)
const ALLOWED_TERMINAL_CMDS = new Set([
  "git", "python", "python3", "pip", "pip3", "node", "npm", "npx",
  "ls", "pwd", "echo", "cat", "mkdir", "touch", "cd", "cp", "grep",
  "find", "head", "tail", "whoami", "uname", "tree", "clear",
]);

function isDev() {
  return !app.isPackaged;
}

function getNextCmd() {
  if (isDev()) return null;
  return path.join(
    process.resourcesPath,
    "server",
    "node_modules",
    "next",
    "dist",
    "bin",
    "next"
  );
}

function getServerDir() {
  return path.join(process.resourcesPath, "server");
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
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadURL(url);

  // target=_blank / window.open → 默认浏览器打开
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith("http")) {
      shell.openExternal(target);
    }
    return { action: "deny" };
  });

  // 页面内普通超链接点击 → 站外跳转交给默认浏览器,避免在应用内打开
  win.webContents.on("will-navigate", (event, target) => {
    try {
      const own = new URL(win.webContents.getURL());
      const t = new URL(target);
      if (t.origin !== own.origin) {
        event.preventDefault();
        shell.openExternal(target);
      }
    } catch {
      // 非法 URL 忽略
    }
  });

  win.on("closed", () => {
    win = null;
  });
}

// 终端练习:白名单内命令在本机执行,返回真实输出(15s 超时,工作目录为用户数据目录)
// 课程可声明额外允许的命令(allowedCommands)与禁用的命令(blockedCommands)
ipcMain.handle("fcl-exec", async (_event, cmdRaw, extra) => {
  const cmd = String(cmdRaw ?? "").trim();
  if (!cmd) return { ok: false, error: "空命令" };
  const allowed = new Set(ALLOWED_TERMINAL_CMDS);
  const extraAllowed = Array.isArray(extra?.allowed)
    ? extra.allowed.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const blocked = new Set(
    Array.isArray(extra?.blocked)
      ? extra.blocked.map((s) => String(s).trim()).filter(Boolean)
      : []
  );
  for (const c of extraAllowed) allowed.add(c.replace(/^.*[\\/]/, ""));
  // 多行/&& 拼接的命令逐段校验,每段首词必须:课程未禁用,且在(默认 ∪ 课程扩展)白名单内
  const segments = cmd
    .split(/\n|&&/i)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const seg of segments) {
    const first = seg.split(/\s+/)[0].replace(/^.*[\\/]/, "");
    if (blocked.has(first)) {
      return { ok: false, error: `命令「${first}」已被本课程禁用` };
    }
    if (!allowed.has(first)) {
      return { ok: false, error: `命令「${first}」不在允许列表中(为安全起见仅支持常见练习命令)` };
    }
  }
  const cwd =
    process.env.FCL_DATA_DIR ?? (app.isPackaged ? app.getPath("userData") : process.cwd());
  const joined = segments.join(" && ");
  return new Promise((resolve) => {
    exec(joined, { timeout: 15000, cwd }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        code: err && typeof err.code === "number" ? err.code : 0,
        stdout: stdout ?? "",
        stderr: (err?.stderr ?? stderr ?? "").trim(),
        error: err && !err.code ? String(err.message ?? err).slice(0, 500) : undefined,
      });
    });
  });
});

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
