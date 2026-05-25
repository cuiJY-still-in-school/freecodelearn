use std::io::Read;
use std::path::Path;

use crate::kernel::{kernel_bin_path, kernel_dir, CoreInfo};

const REPO: &str = "MetaCubeX/mihomo";
const UA: &str = "clashlocal";

/// 按当前架构选择 mihomo release 资产文件名的匹配关键字。
/// amd64 用 compatible 版（GOAMD64=v1），兼容最广，避免老 CPU 非法指令崩溃。
fn asset_keyword() -> Result<&'static str, String> {
    let kw = match std::env::consts::ARCH {
        "x86_64" => "linux-amd64-compatible",
        "aarch64" => "linux-arm64",
        "arm" => "linux-armv7",
        other => return Err(format!("暂不支持的架构: {other}")),
    };
    Ok(kw)
}

#[derive(serde::Deserialize)]
struct Release {
    #[allow(dead_code)]
    tag_name: String,
    assets: Vec<Asset>,
}

#[derive(serde::Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(UA)
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))
}

async fn fetch_latest(c: &reqwest::Client) -> Result<Release, String> {
    let url = format!("https://api.github.com/repos/{REPO}/releases/latest");
    let resp = c
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("请求 GitHub 失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("GitHub 返回状态 {}", resp.status()));
    }
    resp.json::<Release>()
        .await
        .map_err(|e| format!("解析 release 失败: {e}"))
}

/// 从 GitHub 拉取最新 mihomo，下载 → 解压 → 安装到内核目录，返回安装后的状态。
pub async fn download_core(app: tauri::AppHandle) -> Result<CoreInfo, String> {
    let kw = asset_keyword()?;
    let c = http_client()?;
    let release = fetch_latest(&c).await?;

    let asset = release
        .assets
        .iter()
        .find(|a| a.name.contains(kw) && a.name.ends_with(".gz"))
        .ok_or_else(|| format!("未找到匹配的内核资产（关键字 {kw}）"))?;

    log::info!("下载 mihomo 资产: {}", asset.name);
    let bytes = c
        .get(&asset.browser_download_url)
        .send()
        .await
        .map_err(|e| format!("下载内核失败: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("读取内核数据失败: {e}"))?;

    let mut decoder = flate2::read::GzDecoder::new(&bytes[..]);
    let mut out = Vec::new();
    decoder
        .read_to_end(&mut out)
        .map_err(|e| format!("解压内核失败: {e}"))?;

    let dir = kernel_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {e}"))?;
    let bin = kernel_bin_path(&app)?;
    std::fs::write(&bin, &out).map_err(|e| format!("写入内核失败: {e}"))?;
    set_executable(&bin)?;

    Ok(detect_core(&app))
}

#[cfg(unix)]
fn set_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = std::fs::metadata(path)
        .map_err(|e| e.to_string())?
        .permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(path, perms).map_err(|e| format!("设置可执行权限失败: {e}"))
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

/// 检查内核是否存在并尝试读取版本（运行 `mihomo -v`）。
pub fn detect_core(app: &tauri::AppHandle) -> CoreInfo {
    let path = match kernel_bin_path(app) {
        Ok(p) => p,
        Err(_) => {
            return CoreInfo {
                present: false,
                version: None,
                path: String::new(),
            }
        }
    };
    let present = path.exists();
    let version = if present { read_version(&path) } else { None };
    CoreInfo {
        present,
        version,
        path: path.to_string_lossy().to_string(),
    }
}

fn read_version(path: &Path) -> Option<String> {
    let out = std::process::Command::new(path).arg("-v").output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    // mihomo -v 输出形如 "Mihomo Meta vX.Y.Z linux amd64 ..."
    text.split_whitespace()
        .find(|t| t.starts_with('v') && t.chars().nth(1).map_or(false, |c| c.is_ascii_digit()))
        .map(|s| s.to_string())
        .or_else(|| {
            let first = text.trim().lines().next().unwrap_or("").trim();
            (!first.is_empty()).then(|| first.to_string())
        })
}
