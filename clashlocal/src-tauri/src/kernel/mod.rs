pub mod config;
pub mod downloader;
pub mod hotspot;
pub mod privilege;
pub mod process;
pub mod profiles;
pub mod settings;
pub mod transparent;

use serde::Serialize;
use std::path::PathBuf;
use tauri::Manager;

pub const CONTROLLER_HOST: &str = "127.0.0.1";
pub const CONTROLLER_PORT: u16 = 9091;
/// 透明代理用的 tproxy 端口与 fake-ip DNS 端口(热点设备零配置走 VPN,TCP+UDP)。
pub const TPROXY_PORT: u16 = 7894;
pub const DNS_PORT: u16 = 1153;

#[cfg(windows)]
pub const BIN_NAME: &str = "mihomo.exe";
#[cfg(not(windows))]
pub const BIN_NAME: &str = "mihomo";

/// 内核状态，返回给前端。
#[derive(Serialize, Clone, Debug)]
pub struct CoreInfo {
    pub present: bool,
    pub version: Option<String>,
    pub path: String,
}

/// 内核存放目录：<app_data_dir>/core
pub fn kernel_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {e}"))?
        .join("core");
    Ok(dir)
}

/// 内核二进制完整路径。
pub fn kernel_bin_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(kernel_dir(app)?.join(BIN_NAME))
}
