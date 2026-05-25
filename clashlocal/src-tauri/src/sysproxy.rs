//! Linux 系统代理开关(基于 GNOME gsettings,XFCE 下该 schema 同样可用)。
//! 开启前存档当前设置、关闭时还原,避免破坏用户已有(如 Clash Verge)的代理配置。

use std::path::PathBuf;
use std::process::Command;

use serde::{Deserialize, Serialize};
use tauri::Manager;

const SCHEMA: &str = "org.gnome.system.proxy";

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct ProxyBackup {
    mode: String,
    http_host: String,
    http_port: String,
    https_host: String,
    https_port: String,
    socks_host: String,
    socks_port: String,
}

fn gget(schema: &str, key: &str) -> String {
    Command::new("gsettings")
        .args(["get", schema, key])
        .output()
        .ok()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .trim()
                .trim_matches('\'')
                .to_string()
        })
        .unwrap_or_default()
}

fn gset(schema: &str, key: &str, val: &str) -> Result<(), String> {
    let st = Command::new("gsettings")
        .args(["set", schema, key, val])
        .status()
        .map_err(|e| format!("调用 gsettings 失败: {e}"))?;
    if st.success() {
        Ok(())
    } else {
        Err(format!("gsettings set {schema} {key} 失败"))
    }
}

fn backup_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {e}"))?;
    std::fs::create_dir_all(&dir).ok();
    Ok(dir.join("sysproxy_backup.json"))
}

fn current() -> ProxyBackup {
    ProxyBackup {
        mode: gget(SCHEMA, "mode"),
        http_host: gget(&format!("{SCHEMA}.http"), "host"),
        http_port: gget(&format!("{SCHEMA}.http"), "port"),
        https_host: gget(&format!("{SCHEMA}.https"), "host"),
        https_port: gget(&format!("{SCHEMA}.https"), "port"),
        socks_host: gget(&format!("{SCHEMA}.socks"), "host"),
        socks_port: gget(&format!("{SCHEMA}.socks"), "port"),
    }
}

/// 当前系统代理是否正指向 clashlocal(127.0.0.1:port)。
pub fn is_enabled(port: u16) -> bool {
    gget(SCHEMA, "mode") == "manual"
        && gget(&format!("{SCHEMA}.http"), "host") == "127.0.0.1"
        && gget(&format!("{SCHEMA}.http"), "port") == port.to_string()
}

/// 把系统代理指向 clashlocal;先存档当前(非自身)设置以便还原。
pub fn enable(app: &tauri::AppHandle, port: u16) -> Result<(), String> {
    if !is_enabled(port) {
        let cur = current();
        let json = serde_json::to_string_pretty(&cur).map_err(|e| e.to_string())?;
        std::fs::write(backup_path(app)?, json).map_err(|e| format!("写入代理备份失败: {e}"))?;
    }
    let p = port.to_string();
    for sub in ["http", "https", "socks"] {
        gset(&format!("{SCHEMA}.{sub}"), "host", "127.0.0.1")?;
        gset(&format!("{SCHEMA}.{sub}"), "port", &p)?;
    }
    gset(SCHEMA, "mode", "manual")?;
    Ok(())
}

/// 关闭系统代理:优先还原存档(恢复用户原有设置),否则置 none。
pub fn disable(app: &tauri::AppHandle) -> Result<(), String> {
    if let Ok(s) = std::fs::read_to_string(backup_path(app)?) {
        if let Ok(b) = serde_json::from_str::<ProxyBackup>(&s) {
            let triples = [
                ("http", &b.http_host, &b.http_port),
                ("https", &b.https_host, &b.https_port),
                ("socks", &b.socks_host, &b.socks_port),
            ];
            for (sub, host, port) in triples {
                if !host.is_empty() {
                    let _ = gset(&format!("{SCHEMA}.{sub}"), "host", host);
                }
                if !port.is_empty() {
                    let _ = gset(&format!("{SCHEMA}.{sub}"), "port", port);
                }
            }
            let mode = if b.mode.is_empty() { "none" } else { &b.mode };
            gset(SCHEMA, "mode", mode)?;
            return Ok(());
        }
    }
    gset(SCHEMA, "mode", "none")
}
