use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Manager;

fn d_ssid() -> String {
    "clashlocal".into()
}
fn d_pass() -> String {
    "clash12345".into()
}
fn d_ifname() -> String {
    "wlan0".into()
}
fn d_port() -> u16 {
    7893
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Settings {
    /// 透明代理(让热点设备自动走 VPN)。开启会给内核加 tproxy-port + fake-ip dns。
    #[serde(default)]
    pub transparent: bool,
    /// 混合端口(系统代理 + 局域网共享共用)。
    #[serde(default = "d_port")]
    pub mixed_port: u16,
    #[serde(default = "d_ssid")]
    pub hotspot_ssid: String,
    #[serde(default = "d_pass")]
    pub hotspot_password: String,
    /// 用作 AP 的网卡(默认 wlan0;有第二块网卡时可选它)。
    #[serde(default = "d_ifname")]
    pub hotspot_ifname: String,
    /// 热点频段:"" 自动 / "bg" 2.4GHz / "a" 5GHz。
    #[serde(default)]
    pub hotspot_band: String,
    /// 应用启动时自动拉起内核。
    #[serde(default)]
    pub auto_start_core: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            transparent: false,
            mixed_port: d_port(),
            hotspot_ssid: d_ssid(),
            hotspot_password: d_pass(),
            hotspot_ifname: d_ifname(),
            hotspot_band: String::new(),
            auto_start_core: false,
        }
    }
}

fn path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {e}"))?;
    std::fs::create_dir_all(&dir).ok();
    Ok(dir.join("settings.json"))
}

pub fn load(app: &tauri::AppHandle) -> Settings {
    path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(app: &tauri::AppHandle, s: &Settings) -> Result<(), String> {
    let json = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    std::fs::write(path(app)?, json).map_err(|e| format!("写入设置失败: {e}"))
}
