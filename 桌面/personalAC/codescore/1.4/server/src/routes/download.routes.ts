import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

function downloadsDir(): string {
  return path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'downloads')
}

interface PlatformInfo {
  available: boolean
  filename: string
  size: number
  url: string | null
  version: string | null
}

function readVersion(dir: string, platform: string): string | null {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(dir, `${platform}.version.json`), 'utf8'))
    return v.version || null
  } catch { return null }
}

function fileStat(p: string): { size: number } | null {
  try { return { size: fs.statSync(p).size } } catch { return null }
}

function getWindowsInfo(): PlatformInfo {
  const dir = downloadsDir()
  const exePath = path.join(dir, 'personalac-student-win64.exe')
  const stat = fileStat(exePath)
  return {
    available: !!stat,
    filename: 'personalac-student-win64.exe',
    size: stat?.size ?? 0,
    url: stat ? '/download/windows' : null,
    version: stat ? readVersion(dir, 'windows') : null,
  }
}

function getLinuxInfo(): PlatformInfo {
  const dir = downloadsDir()
  const binPath = path.join(dir, 'personalac-student-linux')
  const stat = fileStat(binPath)
  return {
    available: !!stat,
    filename: 'personalac-student-linux',
    size: stat?.size ?? 0,
    url: stat ? '/download/linux-bin' : null,
    version: stat ? readVersion(dir, 'linux') : null,
  }
}

function getMacInfo(): PlatformInfo {
  const dir = downloadsDir()
  const binPath = path.join(dir, 'personalac-student-mac')
  const stat = fileStat(binPath)
  return {
    available: !!stat,
    filename: 'personalac-student-mac',
    size: stat?.size ?? 0,
    url: stat ? '/download/mac-bin' : null,
    version: stat ? readVersion(dir, 'mac') : null,
  }
}

function getAndroidInfo(): PlatformInfo {
  const dir = downloadsDir()
  const apkPath = path.join(dir, 'personalac-student.apk')
  const stat = fileStat(apkPath)
  return {
    available: !!stat,
    filename: 'personalac-student.apk',
    size: stat?.size ?? 0,
    url: stat ? '/download/android' : null,
    version: stat ? readVersion(dir, 'android') : null,
  }
}

// ── GET /download/info ────────────────────────────────────────────────────
router.get('/info', (_req, res) => {
  res.json({
    windows: getWindowsInfo(),
    linux: getLinuxInfo(),
    mac: getMacInfo(),
    android: getAndroidInfo(),
  })
})

// ── GET /download/install.sh ──────────────────────────────────────────────
// 动态生成，注入当前服务器地址
router.get('/install.sh', (req, res) => {
  const serverUrl = `${req.protocol}://${req.get('host')}`
  const linuxInfo = getLinuxInfo()
  const macInfo = getMacInfo()

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="install.sh"')
  res.send(`#!/bin/sh
# PersonalAC 学生端安装脚本 (Linux / macOS)
# 用法: curl -fsSL ${serverUrl}/download/install.sh | sh
set -e

SERVER_URL="${serverUrl}"
BIN_DIR="$HOME/.local/bin"
BIN="$BIN_DIR/personalac-student"
PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')

if [ "$PLATFORM" != "linux" ] && [ "$PLATFORM" != "darwin" ]; then
    echo "错误：不支持的平台 $PLATFORM" >&2
    exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
    echo "错误：需要 curl，请先安装" >&2
    exit 1
fi

# 检查服务端是否有对应平台的二进制
LINUX_AVAILABLE="${linuxInfo.available ? '1' : '0'}"
MAC_AVAILABLE="${macInfo.available ? '1' : '0'}"

if [ "$PLATFORM" = "linux" ] && [ "$LINUX_AVAILABLE" != "1" ]; then
    echo "错误：服务器上暂无 Linux 客户端，请联系管理员上传" >&2
    exit 1
fi
if [ "$PLATFORM" = "darwin" ] && [ "$MAC_AVAILABLE" != "1" ]; then
    echo "错误：服务器上暂无 macOS 客户端，请联系管理员上传" >&2
    exit 1
fi

mkdir -p "$BIN_DIR"
echo "==> 下载 PersonalAC 学生端 ($PLATFORM)..."
curl -fsSL "$SERVER_URL/download/$PLATFORM-bin" -o "$BIN"
chmod +x "$BIN"

# 开机自启
if [ "$PLATFORM" = "linux" ]; then
    AUTOSTART="$HOME/.config/autostart"
    mkdir -p "$AUTOSTART"
    cat > "$AUTOSTART/personalac-student.desktop" << EOF
[Desktop Entry]
Type=Application
Name=PersonalAC
Exec=$BIN
Hidden=false
X-GNOME-Autostart-enabled=true
EOF
    echo "==> 已配置开机自启 (XDG autostart)"
elif [ "$PLATFORM" = "darwin" ]; then
    AGENTS="$HOME/Library/LaunchAgents"
    mkdir -p "$AGENTS"
    PLIST="$AGENTS/com.personalac.student.plist"
    cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.personalac.student</string>
    <key>ProgramArguments</key><array><string>$BIN</string></array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><false/>
</dict>
</plist>
EOF
    launchctl load "$PLIST" 2>/dev/null || true
    echo "==> 已配置开机自启 (LaunchAgent)"
fi

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    echo ""
    echo "提示：将以下内容加入 ~/.bashrc 或 ~/.zshrc:"
    echo "  export PATH=\\"\\$HOME/.local/bin:\\$PATH\\""
    ;;
esac

echo ""
echo "==> 安装完成！运行: personalac-student"
`)
})

// ── 二进制下载 ────────────────────────────────────────────────────────────
router.get('/windows', (_req, res) => {
  const p = path.join(downloadsDir(), 'personalac-student-win64.exe')
  if (fs.existsSync(p)) return void res.download(p, 'personalac-student.exe')
  res.status(404).json({ error: '客户端文件尚未上传' })
})

router.get('/linux-bin', (_req, res) => {
  const p = path.join(downloadsDir(), 'personalac-student-linux')
  if (fs.existsSync(p)) return void res.download(p, 'personalac-student')
  res.status(404).json({ error: '客户端文件尚未上传' })
})

router.get('/mac-bin', (_req, res) => {
  const p = path.join(downloadsDir(), 'personalac-student-mac')
  if (fs.existsSync(p)) return void res.download(p, 'personalac-student')
  res.status(404).json({ error: '客户端文件尚未上传' })
})

router.get('/android', (_req, res) => {
  const p = path.join(downloadsDir(), 'personalac-student.apk')
  if (fs.existsSync(p)) return void res.download(p, 'personalac-student.apk')
  res.status(404).json({ error: 'APK 尚未上传' })
})

// ── 上传（单次） ──────────────────────────────────────────────────────────
function platformFilename(platform: string): string {
  if (platform === 'mac')     return 'personalac-student-mac'
  if (platform === 'linux')   return 'personalac-student-linux'
  if (platform === 'android') return 'personalac-student.apk'
  return 'personalac-student-win64.exe'
}

router.post(
  '/upload',
  requireAuth,
  (req, res, next) => {
    let data = Buffer.alloc(0)
    req.on('data', (chunk: Buffer) => { data = Buffer.concat([data, chunk]) })
    req.on('end', () => { (req as { rawBody?: Buffer }).rawBody = data; next() })
    req.on('error', next)
  },
  (req, res) => {
    const role = (req as AuthRequest).userRole
    if (role !== 'guardian' && role !== 'teacher' && role !== 'admin') {
      res.status(403).json({ success: false, error: '仅管理员可上传' }); return
    }
    const body = (req as { rawBody?: Buffer }).rawBody
    if (!body || body.length === 0) {
      res.status(400).json({ success: false, error: '未收到文件内容' }); return
    }
    const platform = (req.query.platform as string) || 'windows'
    const version = (req.query.version as string) || null
    const dir = downloadsDir()
    fs.mkdirSync(dir, { recursive: true })
    const dest = path.join(dir, platformFilename(platform))
    const tmp = dest + '.tmp'
    try {
      fs.writeFileSync(tmp, body)
      fs.renameSync(tmp, dest)
      if (version) fs.writeFileSync(path.join(dir, `${platform}.version.json`), JSON.stringify({ version }))
      res.json({ success: true, message: `上传成功（${(body.length / 1024 / 1024).toFixed(1)} MB）` })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  }
)

// ── 分块上传 ──────────────────────────────────────────────────────────────
router.post(
  '/upload-chunk',
  requireAuth,
  (req, res, next) => {
    let data = Buffer.alloc(0)
    req.on('data', (chunk: Buffer) => { data = Buffer.concat([data, chunk]) })
    req.on('end', () => { (req as { rawBody?: Buffer }).rawBody = data; next() })
    req.on('error', next)
  },
  (req, res) => {
    const role = (req as AuthRequest).userRole
    if (role !== 'guardian' && role !== 'teacher' && role !== 'admin') {
      res.status(403).json({ success: false, error: '仅管理员可上传' }); return
    }
    const body = (req as { rawBody?: Buffer }).rawBody
    if (!body || body.length === 0) {
      res.status(400).json({ success: false, error: '未收到分块内容' }); return
    }
    const platform = (req.query.platform as string) || 'windows'
    const version = (req.query.version as string) || null
    const chunkIdx = parseInt(req.query.chunk as string)
    const total = parseInt(req.query.total as string)
    if (isNaN(chunkIdx) || isNaN(total) || total < 1) {
      res.status(400).json({ success: false, error: '缺少 chunk / total 参数' }); return
    }
    const dir = downloadsDir()
    fs.mkdirSync(dir, { recursive: true })
    const dest = path.join(dir, platformFilename(platform))
    const chunkPath = `${dest}.part${chunkIdx}`
    try {
      fs.writeFileSync(chunkPath, body)
      const allArrived = Array.from({ length: total }, (_, i) => `${dest}.part${i}`)
        .every(p => fs.existsSync(p))
      if (!allArrived) {
        res.json({ success: true, message: `分块 ${chunkIdx + 1}/${total} 已接收` }); return
      }
      const tmp = dest + '.tmp'
      const out = fs.openSync(tmp, 'w')
      for (let i = 0; i < total; i++) {
        const p = `${dest}.part${i}`
        fs.writeSync(out, fs.readFileSync(p))
        fs.unlinkSync(p)
      }
      fs.closeSync(out)
      fs.renameSync(tmp, dest)
      if (version) fs.writeFileSync(path.join(dir, `${platform}.version.json`), JSON.stringify({ version }))
      const sizeMB = (fs.statSync(dest).size / 1024 / 1024).toFixed(1)
      res.json({ success: true, message: `上传成功（${sizeMB} MB，共 ${total} 块）` })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  }
)

export default router
