use serde::Serialize;

#[derive(Serialize)]
pub struct HotspotStatus {
    pub active: bool,
    pub subnet: Option<String>,
    pub gateway: Option<String>,
}

// ===== Linux / 其它类 Unix:NetworkManager(nmcli) =====
#[cfg(not(windows))]
mod imp {
    use super::HotspotStatus;
    use std::process::Command;

    const CON_NAME: &str = "clashlocal-hotspot";

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

    /// 本机局域网 IP(给"设备代理填 IP:7893"用):取物理网卡的全局 IPv4,
    /// 跳过 docker/veth/loopback 和 mihomo TUN 的 198.18 假地址。
    pub fn lan_ip() -> Option<String> {
        let out = Command::new("ip")
            .args(["-4", "-o", "addr", "show", "scope", "global"])
            .output()
            .ok()?;
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines() {
            let f: Vec<&str> = line.split_whitespace().collect();
            let dev = match f.get(1) {
                Some(d) => *d,
                None => continue,
            };
            if dev.starts_with("br-") || dev.starts_with("docker") || dev.starts_with("veth") {
                continue;
            }
            if let Some(pos) = f.iter().position(|x| *x == "inet") {
                if let Some(ipm) = f.get(pos + 1) {
                    let ip = ipm.split('/').next().unwrap_or("");
                    if ip.starts_with("198.18.") || ip.starts_with("127.") || ip.is_empty() {
                        continue;
                    }
                    return Some(ip.to_string());
                }
            }
        }
        None
    }

    fn dns53_busy() -> bool {
        Command::new("ss")
            .args(["-lun"])
            .output()
            .ok()
            .map(|o| {
                String::from_utf8_lossy(&o.stdout)
                    .lines()
                    .any(|l| l.contains(":53 "))
            })
            .unwrap_or(false)
    }

    /// 当有进程(如 Clash Verge 的 DNS)占着 0.0.0.0:53 时,NM 给热点起的 dnsmasq
    /// 绑不上 53 会导致 ip-config-unavailable。写 dnsmasq-shared.d 让其 DHCP-only
    /// (port=0)并通过 DHCP 派发上游 DNS,绕开冲突。需 root(pkexec),仅首次。
    fn ensure_dnsmasq_fix() -> Result<(), String> {
        let path = "/etc/NetworkManager/dnsmasq-shared.d/clashlocal.conf";
        if std::path::Path::new(path).exists() {
            return Ok(());
        }
        let script = "mkdir -p /etc/NetworkManager/dnsmasq-shared.d && printf 'port=0\\ndhcp-option=6,223.5.5.5,1.1.1.1\\n' > /etc/NetworkManager/dnsmasq-shared.d/clashlocal.conf";
        let tmp = std::env::temp_dir().join("clashlocal_dnsfix.sh");
        std::fs::write(&tmp, script).map_err(|e| format!("写脚本失败: {e}"))?;
        let out = Command::new("pkexec")
            .arg("bash")
            .arg(&tmp)
            .output()
            .map_err(|e| format!("pkexec 调用失败(需要授权): {e}"))?;
        let _ = std::fs::remove_file(&tmp);
        if !out.status.success() {
            return Err(format!(
                "写入 dnsmasq 修复失败: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }
        Ok(())
    }

    pub fn start(ifname: &str, band: &str, ssid: &str, password: &str) -> Result<(), String> {
        if ssid.is_empty() || password.len() < 8 {
            return Err("SSID 不能为空,且密码至少 8 位".into());
        }
        // 有进程占 53(如 Verge 的 DNS)时,先修复 NM 热点 dnsmasq 的 53 冲突
        if dns53_busy() {
            ensure_dnsmasq_fix()?;
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
}

// ===== Windows:netsh hostednetwork(共享网段默认 192.168.137.0/24)=====
#[cfg(windows)]
mod imp {
    use super::HotspotStatus;
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Output};

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    fn netsh(args: &[&str]) -> Result<Output, String> {
        Command::new("netsh")
            .args(args)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("调用 netsh 失败: {e}"))
    }

    pub fn list_wifi_devices() -> Vec<String> {
        netsh(&["wlan", "show", "interfaces"])
            .ok()
            .map(|o| {
                String::from_utf8_lossy(&o.stdout)
                    .lines()
                    .filter_map(|l| {
                        let l = l.trim();
                        if l.starts_with("Name") {
                            l.split(':').nth(1).map(|s| s.trim().to_string())
                        } else {
                            None
                        }
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn lan_ip() -> Option<String> {
        let out = Command::new("ipconfig")
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()?;
        let s = String::from_utf8_lossy(&out.stdout);
        for line in s.lines() {
            if line.contains("IPv4") {
                if let Some(ip) = line.split(':').nth(1) {
                    let ip = ip.trim();
                    if !ip.starts_with("169.254") && !ip.starts_with("127.") && !ip.is_empty() {
                        return Some(ip.to_string());
                    }
                }
            }
        }
        None
    }

    pub fn start(_ifname: &str, _band: &str, ssid: &str, password: &str) -> Result<(), String> {
        if ssid.is_empty() || password.len() < 8 {
            return Err("SSID 不能为空,且密码至少 8 位".into());
        }
        let set = netsh(&[
            "wlan",
            "set",
            "hostednetwork",
            "mode=allow",
            &format!("ssid={ssid}"),
            &format!("key={password}"),
        ])?;
        if !set.status.success() {
            return Err(format!(
                "配置热点失败: {}",
                String::from_utf8_lossy(&set.stdout).trim()
            ));
        }
        let st = netsh(&["wlan", "start", "hostednetwork"])?;
        if !st.status.success() {
            return Err(format!(
                "开启热点失败(部分网卡不支持 hostednetwork,可改用系统“移动热点”): {}",
                String::from_utf8_lossy(&st.stdout).trim()
            ));
        }
        Ok(())
    }

    pub fn stop() -> Result<(), String> {
        let _ = netsh(&["wlan", "stop", "hostednetwork"]);
        Ok(())
    }

    pub fn subnet(_ifname: &str) -> Option<String> {
        Some("192.168.137.0/24".into())
    }

    pub fn status(_ifname: &str) -> HotspotStatus {
        let active = netsh(&["wlan", "show", "hostednetwork"])
            .ok()
            .map(|o| {
                let t = String::from_utf8_lossy(&o.stdout);
                t.contains("Started") || t.contains("已启动")
            })
            .unwrap_or(false);
        HotspotStatus {
            active,
            subnet: active.then(|| "192.168.137.0/24".to_string()),
            gateway: active.then(|| "192.168.137.1".to_string()),
        }
    }
}

pub use imp::{lan_ip, list_wifi_devices, start, status, stop, subnet};
