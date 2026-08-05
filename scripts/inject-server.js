// electron-builder afterPack:把 server 运行时完整目录(含 node_modules)注入打包产物 resources/
// 原因:electron-builder 的 extraResources 会对 from 目录做依赖收集,node_modules 不会原样复制,
// 而 server 需要用 Electron 自带 Node 运行 next,node_modules 必须完整存在且可执行。
const fs = require("fs");
const path = require("path");

exports.default = async function (context) {
  const { appOutDir } = context;
  const src = path.join(__dirname, "..", "server");
  const dest = path.join(appOutDir, "resources", "server");
  if (!fs.existsSync(src)) {
    console.warn("server/ 目录不存在,跳过注入(开发模式可忽略)");
    return;
  }
  fs.cpSync(src, dest, { recursive: true });
  const nextBin = path.join(
    dest,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next"
  );
  console.log(
    "server injected ->",
    dest,
    fs.existsSync(nextBin) ? "(next bin OK)" : "(WARN next bin 缺失)"
  );
};
