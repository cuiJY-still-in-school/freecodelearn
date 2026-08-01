"""
PersonalAC 学生端客户端打包脚本
运行方式：python build.py [win|linux|mac] [--upload SERVER_URL TOKEN]
前置要求：pip install pyinstaller>=6.0.0
"""

import json
import os
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

VERSION = "1.5.2"

_COMMON_HIDDEN = [
    "pkgutil", "importlib.metadata", "importlib.resources",
    "psutil", "requests", "requests.adapters", "requests.auth",
    "charset_normalizer",
    "PyQt6.QtSvgWidgets",
    "comtypes", "comtypes.client", "comtypes.gen",
]

_EXCLUDES = [
    "matplotlib", "numpy", "pandas", "scipy", "PIL", "Pillow",
    "cv2", "sklearn", "tensorflow", "torch",
    "PyQt6.QtWebEngineWidgets", "PyQt6.QtWebEngineCore",
    "PyQt6.QtBluetooth", "PyQt6.QtNfc", "PyQt6.QtPositioning",
    "PyQt6.QtSensors", "PyQt6.QtSerialPort",
    "unittest", "test", "doctest",
]


def run(cmd: list[str], cwd: str | None = None) -> int:
    print(f"\n>>> {' '.join(cmd)}\n")
    return subprocess.run(cmd, cwd=cwd).returncode


def _base_args(name: str = "personalac-student") -> list[str]:
    args = [
        sys.executable, "-m", "PyInstaller",
        "--name", name,
        "--clean",
        "--noconfirm",
        "--add-data", f"common{os.pathsep}common",
        "--add-data", f"student{os.pathsep}student",
        "--collect-submodules", "common",
        "--collect-submodules", "student",
    ]
    for m in _COMMON_HIDDEN:
        args += ["--hidden-import", m]
    for m in _EXCLUDES:
        args += ["--exclude-module", m]
    return args


def build_windows() -> bool:
    """Windows: 单文件 exe，含版本资源"""
    args = _base_args()
    args += ["--onefile", "--noconsole"]

    for m in ["win32com", "win32gui", "win32process",
              "win32api", "win32con", "pywintypes",
              "win32security", "win32event"]:
        args += ["--hidden-import", m]

    version_file = Path("build/version_info.txt")
    version_file.parent.mkdir(exist_ok=True)
    _v = VERSION.replace(".", ", ")
    version_file.write_text(f"""
VSVersionInfo(
  ffi=FixedFileInfo(filevers=({_v}, 0), prodvers=({_v}, 0),
    mask=0x3f, flags=0x0, OS=0x40004, fileType=0x1,
    subtype=0x0, date=(0, 0)),
  kids=[
    StringFileInfo([StringTable('040904B0', [
      StringStruct('CompanyName', 'PersonalAC'),
      StringStruct('FileDescription', 'PersonalAC 学生端'),
      StringStruct('FileVersion', '{VERSION}'),
      StringStruct('ProductName', 'PersonalAC Student'),
      StringStruct('ProductVersion', '{VERSION}'),
    ])]),
    VarFileInfo([VarStruct('Translation', [0x0409, 1200])])
  ]
)
""".strip())
    args += ["--version-file", str(version_file)]
    args.append("student.py")

    if run(args) != 0:
        print("[ERROR] Windows build failed")
        return False

    src = Path("dist/personalac-student.exe")
    out = Path(f"dist/personalac-student-win64-{VERSION}.exe")
    shutil.copy2(src, out)
    plain = Path("dist/personalac-student-win64.exe")
    shutil.copy2(src, plain)

    mb = plain.stat().st_size / 1024 / 1024
    print(f"[OK] {plain}  ({mb:.1f} MB)")
    return True


def build_linux() -> bool:
    """Linux: 单文件二进制"""
    args = _base_args()
    args += ["--onefile"]
    args.append("student.py")

    if run(args) != 0:
        print("[ERROR] Linux build failed")
        return False

    src = Path("dist/personalac-student")
    out = Path(f"dist/personalac-student-linux-{VERSION}")
    shutil.copy2(src, out)
    plain = Path("dist/personalac-student-linux")
    shutil.copy2(src, plain)
    plain.chmod(0o755)

    mb = plain.stat().st_size / 1024 / 1024
    print(f"[OK] {plain}  ({mb:.1f} MB)")
    return True


def build_mac() -> bool:
    """macOS: 单文件二进制（windowed）"""
    args = _base_args()
    args += [
        "--onefile", "--windowed",
        "--osx-bundle-identifier", "com.personalac.student",
    ]
    args.append("student.py")

    if run(args) != 0:
        print("[ERROR] Mac build failed")
        return False

    src = Path("dist/personalac-student")
    out = Path(f"dist/personalac-student-mac-{VERSION}")
    shutil.copy2(src, out)
    plain = Path("dist/personalac-student-mac")
    shutil.copy2(src, plain)
    plain.chmod(0o755)

    mb = plain.stat().st_size / 1024 / 1024
    print(f"[OK] {plain}  ({mb:.1f} MB)")
    return True


def build_install_sh(server_url: str = "__SERVER_URL__") -> Path:
    """生成跨平台 install.sh（Linux + macOS）"""
    script = f"""\
#!/bin/sh
# PersonalAC 学生端安装脚本 (Linux / macOS)
# 用法: curl -fsSL {server_url}/download/install.sh | sh
set -e

SERVER_URL="{server_url}"
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
"""
    out = Path("dist/install.sh")
    out.write_text(script)
    out.chmod(0o755)
    print(f"[OK] {out}")
    return out


def upload_to_server(file_path: Path, platform: str, server_url: str, token: str) -> bool:
    CHUNK_SIZE = 10 * 1024 * 1024
    file_size = file_path.stat().st_size
    total = max(1, (file_size + CHUNK_SIZE - 1) // CHUNK_SIZE)

    print(f"\n==> 上传 {file_path.name}  ({file_size / 1024 / 1024:.1f} MB, {total} 块) → {server_url}")

    base = server_url.rstrip("/")
    with open(file_path, "rb") as f:
        for i in range(total):
            chunk = f.read(CHUNK_SIZE)
            url = f"{base}/download/upload-chunk?platform={platform}&chunk={i}&total={total}&version={VERSION}"
            req = urllib.request.Request(url, data=chunk, method="POST")
            req.add_header("x-sync-token", token)
            req.add_header("Content-Type", "application/octet-stream")
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    result = json.loads(resp.read())
                    if not result.get("success"):
                        print(f"\n[ERROR] 块 {i + 1}/{total} 失败: {result.get('error')}")
                        return False
                    print(f"  {i + 1}/{total} ✓", end="\r", flush=True)
            except Exception as e:
                print(f"\n[ERROR] 上传失败: {e}")
                return False

    print(f"\n[OK] 上传完成 v{VERSION}")
    return True


if __name__ == "__main__":
    argv = sys.argv[1:]

    upload_url: str | None = None
    upload_token: str | None = None
    if "--upload" in argv:
        idx = argv.index("--upload")
        try:
            upload_url = argv[idx + 1]
            upload_token = argv[idx + 2]
            argv = argv[:idx] + argv[idx + 3:]
        except IndexError:
            print("[ERROR] 用法：--upload SERVER_URL TOKEN")
            sys.exit(1)

    plat = argv[0] if argv else sys.platform
    print(f"PersonalAC Student Client — Build v{VERSION}")
    print("=" * 48)

    if plat in ("win", "win32", "windows"):
        ok = build_windows()
        built_file = Path("dist/personalac-student-win64.exe")
        platform_key = "windows"
    elif plat in ("linux",):
        ok = build_linux()
        built_file = Path("dist/personalac-student-linux")
        platform_key = "linux"
    elif plat in ("mac", "darwin", "macos"):
        ok = build_mac()
        built_file = Path("dist/personalac-student-mac")
        platform_key = "mac"
    else:
        # 自动检测
        if sys.platform == "darwin":
            ok = build_mac()
            built_file = Path("dist/personalac-student-mac")
            platform_key = "mac"
        elif sys.platform.startswith("linux"):
            ok = build_linux()
            built_file = Path("dist/personalac-student-linux")
            platform_key = "linux"
        else:
            ok = build_windows()
            built_file = Path("dist/personalac-student-win64.exe")
            platform_key = "windows"

    if ok:
        # 生成 install.sh（含服务器 URL，如果提供）
        build_install_sh(upload_url or "__SERVER_URL__")

    if ok and upload_url and upload_token:
        upload_to_server(built_file, platform_key, upload_url, upload_token)

    sys.exit(0 if ok else 1)
