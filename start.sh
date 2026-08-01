#!/usr/bin/env bash
# 一键构建并启动 freecodelearn
# 用法: ./start.sh [--dev]   --dev 以开发模式启动(热更新,不构建)
set -euo pipefail
cd "$(dirname "$0")"

# 1. 确保端口干净(残留的 next-server 会导致 .next 混合产物)
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "next start" 2>/dev/null || true
pkill -9 -f "npm run start" 2>/dev/null || true
sleep 1

if [ "${1:-}" = "--dev" ]; then
  exec npm run dev
fi

# 2. 干净构建(rm -rf 防增量产物污染)
rm -rf .next
npm run build

# 3. 启动
nohup npm run start > /tmp/fcl-server.log 2>&1 &
sleep 3
if curl -sf -o /dev/null http://localhost:3000/; then
  echo "✓ freecodelearn 已启动: http://localhost:3000  (日志: /tmp/fcl-server.log)"
else
  echo "✗ 启动失败,查看日志: /tmp/fcl-server.log"
  tail -20 /tmp/fcl-server.log
  exit 1
fi
