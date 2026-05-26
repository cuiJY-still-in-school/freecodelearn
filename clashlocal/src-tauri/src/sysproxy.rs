//! 跨平台系统代理开关。非 Windows: gsettings(GNOME schema,XFCE 也可用);
//! Windows: reg.exe 写 WinINET 注册表。开启前备份、关闭还原,避免破坏用户原设置。

use std::path::PathBuf;

use tauri::Manager;

fn backup_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {e}"))?;
    std::fs::create_dir_all(&dir).ok();
    Ok(dir.join("sysproxy_backup.json"))
}

#[cfg(not(windows))]
mod imp {
    use super::backup_path;
    use serde::{Deserialize, Serialize};
    use std::process::Command;

    const SCHEMA: &str = "org.gnome.system.proxy";

    #[derive(Serialize, Deserialize, Default, Clone)]
    struct ProxyBackup {
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

    pub fn is_enabled(port: u16) -> bool {
        gget(SCHEMA, "mode") == "manual"
            && gget(&format!("{SCHEMA}.http"), "host") == "127.0.0.1"
            && gget(&format!("{SCHEMA}.http"), "port") == port.to_string()
    }

    pub fn enable(app: &tauri::AppHandle, port: u16) -> Result<(), String> {
        if !is_enabled(port) {
            let json = serde_json::to_string_pretty(&current()).map_err(|e| e.to_string())?;
            std::fs::write(backup_path(app)?, json).map_err(|e| format!("写入代理备份失败: {e}"))?;
        }
        let p = port.to_string();
        for sub in ["http", "https", "socks"] {
            gset(&format!("{SCHEMA}.{sub}"), "host", "127.0.0.1")?;
            gset(&format!("{SCHEMA}.{sub}"), "port", &p)?;
        }
        gset(SCHEMA, "mode", "manual")
    }

    pub fn disable(app: &tauri::AppHandle) -> Result<(), String> {
        if let Ok(s) = std::fs::read_to_string(backup_path(app)?) {
            if let Ok(b) = serde_json::from_str::<ProxyBackup>(&s) {
                for (sub, host, port) in [
                    ("http", &b.http_host, &b.http_port),
                    ("https", &b.https_host, &b.https_port),
                    ("socks", &b.socks_host, &b.socks_port),
                ] {
                    if !host.is_empty() {
                        let _ = gset(&format!("{SCHEMA}.{sub}"), "host", host);
                    }
                    if !port.is_empty() {
                        let _ = gset(&format!("{SCHEMA}.{sub}"), "port", port);
                    }
                }
                let mode = if b.mode.is_empty() { "none" } else { &b.mode };
                return gset(SCHEMA, "mode", mode);
            }
        }
        gset(SCHEMA, "mode", "none")
    }
}

#[cfg(windows)]
mod imp {
    use super::backup_path;
    use serde::{Deserialize, Serialize};
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Output};

    const KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings";
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    #[derive(Serialize, Deserialize, Default)]
    struct ProxyBackup {
        enable: String,
        server: String,
    }

    fn reg(args: &[&str]) -> Result<Output, String> {
        Command::new("reg")
            .args(args)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("调用 reg 失败: {e}"))
    }

    /// 读注册表值数据(reg query 输出:`    名称    类型    数据`)。
    fn reg_get(value: &str) -> Option<String> {
        let out = reg(&["query", KEY, "/v", value]).ok()?;
        if !out.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&out.stdout);
        for line in text.lines() {
            if let Some(pos) = line.find(value) {
                let rest = &line[pos + value.len()..];
                let parts: Vec<&str> = rest.split_whitespace().collect();
                if parts.len() >= 2 {
                    return Some(parts[1..].join(" "));
                }
            }
        }
        None
    }

    pub fn is_enabled(port: u16) -> bool {
        let en = reg_get("ProxyEnable").unwrap_or_default();
        let srv = reg_get("ProxyServer").unwrap_or_default();
        (en == "0x1" || en == "1") && srv == format!("127.0.0.1:{port}")
    }

    pub fn enable(app: &tauri::AppHandle, port: u16) -> Result<(), String> {
        if !is_enabled(port) {
            let b = ProxyBackup {
                enable: reg_get("ProxyEnable").unwrap_or_else(|| "0x0".into()),
                server: reg_get("ProxyServer").unwrap_or_default(),
            };
            let json = serde_json::to_string_pretty(&b).map_err(|e| e.to_string())?;
            std::fs::write(backup_path(app)?, json).map_err(|e| format!("写入代理备份失败: {e}"))?;
        }
        let server = format!("127.0.0.1:{port}");
        reg(&["add", KEY, "/v", "ProxyServer", "/t", "REG_SZ", "/d", &server, "/f"])?;
        reg(&["add", KEY, "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "1", "/f"])?;
        Ok(())
    }

    pub fn disable(app: &tauri::AppHandle) -> Result<(), String> {
        if let Ok(s) = std::fs::read_to_string(backup_path(app)?) {
            if let Ok(b) = serde_json::from_str::<ProxyBackup>(&s) {
                if !b.server.is_empty() {
                    let _ = reg(&[
                        "add", KEY, "/v", "ProxyServer", "/t", "REG_SZ", "/d", &b.server, "/f",
                    ]);
                }
                let dw = if b.enable == "0x1" || b.enable == "1" {
                    "1"
                } else {
                    "0"
                };
                reg(&["add", KEY, "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", dw, "/f"])?;
                return Ok(());
            }
        }
        reg(&["add", KEY, "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "0", "/f"])?;
        Ok(())
    }
}

pub use imp::{disable, enable, is_enabled};
