#!/usr/bin/env bash
# 构建 server 运行时目录(供 Electron 打包为 extraResources)
set -e
cd "$(dirname "$0")/.."

echo "==> 1/4 next build"
npm run build > /tmp/fcl-server-package.log 2>&1 || { tail -20 /tmp/fcl-server-package.log; exit 1; }

echo "==> 2/4 准备 server/ 目录"
rm -rf server
mkdir -p server
cp package.json server/
cp -r .next server/

echo "==> 3/4 安装生产依赖(进入 server)"
cd server
npm install --omit=dev --no-audit --no-fund > /tmp/fcl-server-install.log 2>&1 || { tail -20 /tmp/fcl-server-install.log; exit 1; }
cd ..

echo "==> 4/4 完成:server/ 已就绪"
du -sh server
