// Electron preload:暴露安全的终端执行桥(仅桌面版可用)
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fclTerminal", {
  exec: (cmd) => ipcRenderer.invoke("fcl-exec", cmd),
});
