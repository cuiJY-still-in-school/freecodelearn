#!/bin/bash
# SQLad build script
# Linux:   ./build.sh
# Windows: ./build.sh windows (requires cross-compilation setup)

set -e
cd "$(dirname "$0")"

echo "=== Installing frontend deps ==="
bun install --frozen-lockfile 2>/dev/null || bun install

echo "=== Building frontend ==="
bun run build

if [ "$1" = "windows" ]; then
  echo "=== Building Windows .exe ==="
  cd src-tauri
  cargo build --release --target x86_64-pc-windows-gnu
  echo "Output: src-tauri/target/x86_64-pc-windows-gnu/release/sqlad.exe"
  cp target/x86_64-pc-windows-gnu/release/sqlad.exe ~/桌面/ 2>/dev/null && echo "Copied to ~/桌面/" || true
else
  echo "=== Building Linux binary ==="
  cd src-tauri
  cargo build --release
  echo "Output: src-tauri/target/release/sqlad"
  cp target/release/sqlad ~/桌面/ 2>/dev/null && echo "Copied to ~/桌面/" || true
fi

echo "=== Done ==="
