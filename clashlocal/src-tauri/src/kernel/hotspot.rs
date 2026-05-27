use serde::Serialize;

#[derive(Serialize)]
pub struct HotspotStatus {
    pub active: bool,
    pub subnet: Option<String>,
    pub gateway: Option<String>,
}

/// 无线网卡能力探测结果,用于开热点前判断可行性并给出建议。
#[derive(Serialize, Default)]
pub struct WifiCapability {
    pub ifname: String,
    /// 是否成功探测到(iw 可用且解析到 phy)。
    pub detected: bool,
    /// 网卡支持 AP(热点)模式。
    pub ap_supported: bool,
    /// 可同时做 station(连 WiFi 上网)+ AP(发热点)。
    pub concurrent: bool,
    /// 虽可并发,但 AP 必须与当前 WiFi 同信道(单射频常见限制)。
    pub same_channel_only: bool,
    pub band_24: bool,
    pub band_5: bool,
    /// 当前作为 station 连接所在频段:"2.4GHz" / "5GHz" / ""(未连接)。
    pub sta_band: String,
    /// 严重级别:"ok" 可用 / "warn" 受限 / "block" 不可用 / "unknown" 探测失败。
    pub level: String,
    /// 给用户看的一句话诊断 + 建议。
    pub advice: String,
}

// ===== Linux / 其它类 Unix:NetworkManager(nmcli) =====
#[cfg(not(windows))]
mod imp {
    use super::{HotspotStatus, WifiCapability};
    use std::process::Command;

    const CON_NAME: &str = "clashlocal-hotspot";

    /// 从 sysfs 取接口对应的 phy 名(如 "phy0")。
    fn phy_of(ifname: &str) -> Option<String> {
        std::fs::read_to_string(format!("/sys/class/net/{ifname}/phy80211/name"))
            .ok()
            .map(|s| s.trim().to_string())
    }

    /// 收集 `iw phy ... info` 中某节(header 行后,缩进更深的若干行)。
    fn section_lines(text: &str, header: &str) -> Vec<String> {
        let mut out = Vec::new();
        let mut collecting = false;
        for line in text.lines() {
            if collecting {
                if line.starts_with("\t\t") || line.starts_with("    ") {
                    out.push(line.to_string());
                } else if line.trim().is_empty() {
                    continue;
                } else {
                    break;
                }
            } else if line.contains(header) {
                collecting = true;
            }
        }
        out
    }

    /// 解析 "total <= N" 里的 N。
    fn parse_total(s: &str) -> u32 {
        s.find("total <=")
            .map(|i| {
                s[i + "total <=".len()..]
                    .trim_start()
                    .chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect::<String>()
                    .parse()
                    .unwrap_or(0)
            })
            .unwrap_or(0)
    }

    /// 当前作为 station 连接所在频段(读 `iw dev <if> link` 的 freq)。
    fn sta_band(ifname: &str) -> String {
        Command::new("iw")
            .args(["dev", ifname, "link"])
            .output()
            .ok()
            .and_then(|o| {
                let t = String::from_utf8_lossy(&o.stdout).into_owned();
                t.lines()
                    .find_map(|l| l.trim().strip_prefix("freq:").map(|f| f.trim().to_string()))
            })
            .and_then(|f| f.parse::<u32>().ok())
            .map(|mhz| if mhz >= 4900 { "5GHz" } else { "2.4GHz" }.to_string())
            .unwrap_or_default()
    }

    /// 当前 station 连接的 (nmcli频段, 信道)。同射频网卡开热点必须锁到这个信道。
    fn sta_chan(ifname: &str) -> Option<(String, u32)> {
        let out = Command::new("iw").args(["dev", ifname, "link"]).output().ok()?;
        let t = String::from_utf8_lossy(&out.stdout);
        let mhz: u32 = t
            .lines()
            .find_map(|l| l.trim().strip_prefix("freq:").map(|f| f.trim().to_string()))?
            .split('.')
            .next()?
            .parse()
            .ok()?;
        if mhz >= 4900 {
            Some(("a".into(), (mhz - 5000) / 5))
        } else {
            Some(("bg".into(), (mhz.saturating_sub(2407)) / 5))
        }
    }

    pub fn wifi_capability(ifname: &str) -> WifiCapability {
        let if_ = if ifname.is_empty() { "wlan0" } else { ifname };
        let mut cap = WifiCapability {
            ifname: if_.to_string(),
            level: "unknown".into(),
            ..Default::default()
        };
        let phy = match phy_of(if_) {
            Some(p) => p,
            None => {
                cap.advice = format!("未找到无线网卡 {if_} 的 phy 信息(可能不是无线网卡)。");
                return cap;
            }
        };
        let out = match Command::new("iw").args(["phy", &phy, "info"]).output() {
            Ok(o) if o.status.success() => o,
            _ => {
                cap.advice = "无法运行 iw 检测网卡能力(可执行 sudo apt install iw 后重试)。".into();
                return cap;
            }
        };
        let text = String::from_utf8_lossy(&out.stdout);
        cap.detected = true;
        cap.band_24 = text.contains("Band 1:");
        cap.band_5 = text.contains("Band 2:");
        cap.sta_band = sta_band(if_);
        cap.ap_supported = section_lines(&text, "Supported interface modes:")
            .iter()
            .any(|l| l.trim() == "* AP");

        // 解析「valid interface combinations」判断能否 STA+AP 并发
        let combos = section_lines(&text, "interface combinations:").join(" ");
        for entry in combos.split('*').skip(1) {
            if entry.contains("managed") && entry.contains("AP") && parse_total(entry) >= 2 {
                cap.concurrent = true;
                if entry.contains("channels <= 1") {
                    cap.same_channel_only = true;
                }
            }
        }

        if !cap.ap_supported {
            cap.level = "block".into();
            cap.advice = "本网卡不支持 AP(热点)模式,无法开热点。请改用「局域网代理」共享。".into();
        } else if !cap.concurrent {
            cap.level = "block".into();
            cap.advice =
                "本网卡是单射频,不能边连 WiFi 上网边开热点(强行开会断网甚至卡死)。请改用「局域网代理」共享。"
                    .into();
        } else if cap.same_channel_only {
            cap.level = "warn".into();
            let b = if cap.sta_band.is_empty() {
                "当前 WiFi".to_string()
            } else {
                format!("当前 WiFi({})", cap.sta_band)
            };
            cap.advice = format!(
                "本网卡为单射频:开热点必须与{b}同信道,应用会自动把热点锁到该信道(你选的频段会被忽略)。若未连 WiFi 或仍失败,请改用「局域网代理」更稳。"
            );
        } else {
            cap.level = "ok".into();
            cap.advice = "本网卡支持边上网边开热点。".into();
        }
        cap
    }

    /// 把 nmcli 的原始报错翻译成对用户更友好的提示。
    fn friendly_nmcli_err(raw: &str, band: &str) -> String {
        let r = raw.trim();
        if r.contains("802.1X") || r.contains("请求方") || r.contains("supplicant") {
            let hint = if band == "a" {
                "5GHz 常因单射频不能与上网同时进行而失败,改 2.4GHz 或用「局域网代理」"
            } else {
                "多为单射频网卡无法并发,建议用「局域网代理」"
            };
            format!("网卡无法建立热点({hint}):{r}")
        } else if r.contains("ip-config-unavailable") || r.contains("IP configuration") {
            format!("热点 IP 配置失败(常因 53 端口被占,如 Clash Verge 的 DNS):{r}")
        } else if r.contains("not supported") || r.contains("不支持") {
            format!("本网卡不支持该热点配置,请改用「局域网代理」:{r}")
        } else {
            format!("开启热点失败:{r}")
        }
    }

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
        let if_ = if ifname.is_empty() { "wlan0" } else { ifname };
        // 开热点前先探测网卡能力:不支持 AP / 不能并发时直接拦截,避免把网卡搞卡
        let cap = wifi_capability(if_);
        if cap.detected && cap.level == "block" {
            return Err(cap.advice);
        }
        // 有进程占 53(如 Verge 的 DNS)时,先修复 NM 热点 dnsmasq 的 53 冲突
        if dns53_busy() {
            ensure_dnsmasq_fix()?;
        }

        // 频段/信道:同射频网卡(same_channel_only)必须与当前 WiFi 同信道,
        // 否则跨信道切换会失败甚至卡死。此时强制锁到 station 当前的频段+信道。
        let (mut use_band, mut channel): (String, Option<u32>) = (band.to_string(), None);
        if cap.detected && cap.same_channel_only {
            if let Some((b, ch)) = sta_chan(if_) {
                use_band = b;
                channel = Some(ch);
            }
        }

        let mut args: Vec<String> = vec![
            "device", "wifi", "hotspot", "ifname", if_, "con-name", CON_NAME, "ssid", ssid,
            "password", password,
        ]
        .into_iter()
        .map(String::from)
        .collect();
        if use_band == "bg" || use_band == "a" {
            args.push("band".into());
            args.push(use_band.clone());
        }
        if let Some(ch) = channel {
            args.push("channel".into());
            args.push(ch.to_string());
        }
        let out = Command::new("nmcli")
            .args(&args)
            .output()
            .map_err(|e| format!("调用 nmcli 失败: {e}"))?;
        if !out.status.success() {
            // nmcli 失败时清掉残留的连接档,避免越积越多
            let _ = Command::new("nmcli")
                .args(["connection", "delete", CON_NAME])
                .output();
            return Err(friendly_nmcli_err(
                &String::from_utf8_lossy(&out.stderr),
                band,
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

    /// 并发热点子网(本机做网关)。
    const AP_SUBNET: &str = "10.42.0.0/24";

    /// 并发热点:不切断本机原 WiFi,在同一网卡上加虚拟 AP 接口,锁到 station 当前
    /// 信道发热点;客户端经透明代理(tproxy_port)走 VPN。需已授权(走 helper 免密)。
    /// 仅 station 在 2.4GHz 时可用(5GHz 信道多为 No-IR 不能当 AP)。
    pub fn concurrent_start(
        ifname: &str,
        ssid: &str,
        password: &str,
        tproxy_port: u16,
    ) -> Result<(), String> {
        use crate::kernel::privilege;
        if ssid.is_empty() || password.len() < 8 || password.len() > 63 {
            return Err("SSID 不能为空,密码需 8–63 位".into());
        }
        // SSID/密码限制为安全字符,避免注入 hostapd 配置
        let ok = |s: &str| s.chars().all(|c| c.is_ascii_graphic() || c == ' ');
        if !ok(ssid) || !ok(password) {
            return Err("SSID/密码含不支持的字符(仅限可见 ASCII)".into());
        }
        let if_ = if ifname.is_empty() { "wlan0" } else { ifname };
        let (band, channel) = sta_chan(if_).ok_or_else(|| {
            "未检测到本机的 WiFi 连接;并发热点需要本机先连上一个 2.4GHz WiFi 作为上游。".to_string()
        })?;
        if band != "bg" {
            return Err(format!(
                "并发热点要求热点与本机 WiFi 同信道,而本机当前连的是 5GHz(无法当 AP)。请先把本机连到 2.4GHz 的 WiFi(同一个路由器的 2.4G 即可),再开并发热点。"
            ));
        }
        let ch = channel.to_string();
        privilege::run(&["apup", if_, ssid, password, &ch, AP_SUBNET])?;
        privilege::run(&["enable", AP_SUBNET, &tproxy_port.to_string()])?;
        Ok(())
    }

    pub fn concurrent_stop(ifname: &str) -> Result<(), String> {
        use crate::kernel::privilege;
        let if_ = if ifname.is_empty() { "wlan0" } else { ifname };
        let _ = privilege::run(&["apdown", if_]);
        let _ = privilege::run(&["disable"]);
        Ok(())
    }

    pub fn concurrent_active() -> bool {
        std::fs::read_to_string("/run/clashlocal-hostapd.pid")
            .ok()
            .and_then(|s| s.trim().parse::<u32>().ok())
            .map(|pid| std::path::Path::new(&format!("/proc/{pid}")).exists())
            .unwrap_or(false)
    }

    /// 本机 station 当前频段:"2.4GHz" / "5GHz" / ""(未连接)。供前端判断与引导。
    pub fn station_band(ifname: &str) -> String {
        let if_ = if ifname.is_empty() { "wlan0" } else { ifname };
        match sta_chan(if_) {
            Some((b, _)) if b == "bg" => "2.4GHz".into(),
            Some(_) => "5GHz".into(),
            None => String::new(),
        }
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
    use super::{HotspotStatus, WifiCapability};
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Output};

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    /// Windows 下不做 iw 级探测,交给 netsh 在启动时报错;给出通用建议。
    pub fn wifi_capability(ifname: &str) -> WifiCapability {
        WifiCapability {
            ifname: if ifname.is_empty() { "wlan".into() } else { ifname.into() },
            detected: false,
            level: "unknown".into(),
            advice: "Windows 下热点能力由系统决定;若开启失败,可改用系统「移动热点」或本应用的「局域网代理」共享。".into(),
            ..Default::default()
        }
    }

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

    pub fn concurrent_start(
        _ifname: &str,
        _ssid: &str,
        _password: &str,
        _tproxy_port: u16,
    ) -> Result<(), String> {
        Err("并发热点暂仅支持 Linux;Windows 请用系统「移动热点」或本应用的局域网代理。".into())
    }
    pub fn concurrent_stop(_ifname: &str) -> Result<(), String> {
        Ok(())
    }
    pub fn concurrent_active() -> bool {
        false
    }
    pub fn station_band(_ifname: &str) -> String {
        String::new()
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

pub use imp::{
    concurrent_active, concurrent_start, concurrent_stop, lan_ip, list_wifi_devices, start,
    station_band, status, stop, subnet, wifi_capability,
};
