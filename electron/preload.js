// Electron preload:暴露安全的终端执行桥(仅桌面版可用)
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fclTerminal", {
  exec: (cmd, extra) => ipcRenderer.invoke("fcl-exec", cmd, extra),
});
