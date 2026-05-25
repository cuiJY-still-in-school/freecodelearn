use std::process::Command;

use serde::Serialize;

const CON_NAME: &str = "clashlocal-hotspot";

#[derive(Serialize)]
pub struct HotspotStatus {
    pub active: bool,
    pub subnet: Option<String>,
    pub gateway: Option<String>,
}

/// 列出可用作 AP 的 WiFi 网卡(nmcli 看到的 wifi 设备)。
pub fn list_wifi_devices() -> Vec<String> {
    Command::new("nmcli")
        .args(["-t", "-f", "DEVICE,TYPE", "device"])
        .output()
        .ok()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .filter_map(|l| l.split_once(':'))
                .filter(|(_, t)| *t == "wifi")
                .map(|(d, _)| d.to_string())
                .collect()
        })
        .unwrap_or_default()
}

/// 用 nmcli 开热点。单网卡机器上 wlan0 进入 AP 可能中断上网(取决于驱动 AP+STA 并发)。
pub fn start(ifname: &str, band: &str, ssid: &str, password: &str) -> Result<(), String> {
    if ssid.is_empty() || password.len() < 8 {
        return Err("SSID 不能为空,且密码至少 8 位".into());
    }
    let if_ = if ifname.is_empty() { "wlan0" } else { ifname };
    let mut args: Vec<&str> = vec![
        "device", "wifi", "hotspot", "ifname", if_, "con-name", CON_NAME, "ssid", ssid,
        "password", password,
    ];
    if band == "bg" || band == "a" {
        args.push("band");
        args.push(band);
    }
    let out = Command::new("nmcli")
        .args(&args)
        .output()
        .map_err(|e| format!("调用 nmcli 失败: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "开启热点失败: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(())
}

pub fn stop() -> Result<(), String> {
    let _ = Command::new("nmcli")
        .args(["connection", "down", CON_NAME])
        .output();
    Ok(())
}

/// 推断热点子网(NetworkManager 共享模式默认 10.42.0.0/24)。
pub fn subnet(ifname: &str) -> Option<String> {
    let if_ = if ifname.is_empty() { "wlan0" } else { ifname };
    let out = Command::new("nmcli")
        .args(["-g", "IP4.ADDRESS", "device", "show", if_])
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&out.stdout);
    let addr = s.lines().map(str::trim).find(|l| l.starts_with("10.42."))?;
    let (ip, _mask) = addr.split_once('/')?;
    let mut parts: Vec<&str> = ip.split('.').collect();
    if parts.len() == 4 {
        parts[3] = "0";
        return Some(format!("{}/24", parts.join(".")));
    }
    None
}

pub fn status(ifname: &str) -> HotspotStatus {
    let active = Command::new("nmcli")
        .args(["-t", "-f", "NAME", "connection", "show", "--active"])
        .output()
        .ok()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .any(|l| l == CON_NAME)
        })
        .unwrap_or(false);
    let subnet = if active { subnet(ifname) } else { None };
    let gateway = subnet.as_ref().map(|s| s.replace(".0/24", ".1"));
    HotspotStatus {
        active,
        subnet,
        gateway,
    }
}
