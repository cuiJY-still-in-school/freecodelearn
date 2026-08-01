#!/usr/bin/env node
'use strict'

/**
 * 构建脚本：编译服务端 TS + 构建前端，输出到 local/dist/ 和 local/public/
 * 运行方式：node scripts/build.js
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const ROOT      = path.join(__dirname, '..')
const REPO_ROOT = path.join(ROOT, '..')          // codescore/
const SERVER_SRC = path.join(REPO_ROOT, '1.4', 'server')
const FRONTEND_SRC = path.join(REPO_ROOT, '1.4', 'frontend')
const DIST_OUT   = path.join(ROOT, 'dist')
const PUBLIC_OUT = path.join(ROOT, 'public')

function run(cmd, cwd) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}

function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(dest, { recursive: true })
  // Use cp -r for speed
  execSync(`cp -r "${src}/." "${dest}"`, { stdio: 'inherit' })
}

// ── 1. 编译服务端 ────────────────────────────────────────────────────
console.log('\n=== [1/2] 编译服务端 ===')
run('npx tsc', SERVER_SRC)
copyDir(path.join(SERVER_SRC, 'dist'), DIST_OUT)
console.log(`  ✓ 服务端 → ${DIST_OUT}`)

// ── 2. 构建前端 ──────────────────────────────────────────────────────
console.log('\n=== [2/2] 构建前端 ===')
// 确保前端依赖已安装
if (!fs.existsSync(path.join(FRONTEND_SRC, 'node_modules'))) {
  run('npm install', FRONTEND_SRC)
}
run('npm run build', FRONTEND_SRC)
copyDir(path.join(FRONTEND_SRC, 'dist'), PUBLIC_OUT)
console.log(`  ✓ 前端   → ${PUBLIC_OUT}`)

// ── 3. 写入版本戳 ────────────────────────────────────────────────────
const ver = { v: Date.now() }
fs.writeFileSync(path.join(PUBLIC_OUT, 'version.json'), JSON.stringify(ver))
console.log(`  ✓ 版本戳 → ${ver.v}`)

console.log('\n✓ 构建完成！运行: npm start  或  personalac\n')
