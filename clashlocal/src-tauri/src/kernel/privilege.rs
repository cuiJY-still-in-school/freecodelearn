//! 一次性管理员授权(Linux):pkexec 装一个 root 拥有的网络助手脚本 + sudoers 免密,
//! 之后透明代理等特权网络操作走 `sudo -n 助手` 不再弹密码。授权本身只需一次。

#[cfg(target_os = "linux")]
mod imp {
    use std::process::Command;

    pub const HELPER: &str = "/usr/local/lib/clashlocal/clashlocal-net.sh";
    const SUDOERS: &str = "/etc/sudoers.d/clashlocal";

    /// root 助手脚本内容:
    /// - setcap/unsetcap <bin>:给内核加/去 CAP_NET_ADMIN(TUN、tproxy 都要)
    /// - enable <subnet> <tproxy> / disable:透明代理的 nft TPROXY + ip rule
    fn helper_body() -> &'static str {
        r#"#!/bin/bash
set -e
FWMARK=1
RT=100
case "$1" in
  setcap)
    [ -n "$2" ] && setcap 'cap_net_admin,cap_net_bind_service=+ep' "$2"
    ;;
  unsetcap)
    [ -n "$2" ] && setcap -r "$2" 2>/dev/null || true
    ;;
  enable)
    SUBNET="$2"; TPROXY="$3"
    nft -f - <<NFT
table inet clashlocal
delete table inet clashlocal
table inet clashlocal {
  chain prerouting {
    type filter hook prerouting priority mangle; policy accept;
    ip saddr $SUBNET ip daddr { 127.0.0.0/8, 10.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/4, 255.255.255.255 } return
    ip saddr $SUBNET meta l4proto { tcp, udp } meta mark set $FWMARK tproxy ip to :$TPROXY
  }
}
NFT
    ip rule add fwmark $FWMARK table $RT 2>/dev/null || true
    ip route replace local default dev lo table $RT
    sysctl -w net.ipv4.ip_forward=1 >/dev/null
    ;;
  disable)
    nft delete table inet clashlocal 2>/dev/null || true
    ip rule del fwmark $FWMARK table $RT 2>/dev/null || true
    ip route flush table $RT 2>/dev/null || true
    ;;
  noop) : ;;
  *) echo "unknown cmd: $1" >&2; exit 2 ;;
esac
"#
    }

    /// 是否已授权(助手存在且 sudo 免密可跑)。
    pub fn is_granted() -> bool {
        std::path::Path::new(HELPER).exists()
            && Command::new("sudo")
                .args(["-n", HELPER, "noop"])
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
    }

    /// 当前用户名。优先 `id -un`(桌面图标启动时 $USER 常为空),回退环境变量。
    fn current_user() -> Option<String> {
        Command::new("id")
            .arg("-un")
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| std::env::var("USER").ok().filter(|s| !s.is_empty()))
            .or_else(|| std::env::var("LOGNAME").ok().filter(|s| !s.is_empty()))
    }

    /// 一次性授权:pkexec 把助手装到 root 目录并写 sudoers 免密。
    pub fn grant() -> Result<(), String> {
        let user = current_user().ok_or_else(|| "无法获取当前用户名".to_string())?;
        let tmp = std::env::temp_dir().join("clashlocal-net.sh");
        std::fs::write(&tmp, helper_body()).map_err(|e| format!("写助手脚本失败: {e}"))?;
        let installer = format!(
            r#"set -e
install -D -m 0755 '{tmp}' '{helper}'
printf '%s ALL=(root) NOPASSWD: {helper}\n' '{user}' > '{sudoers}'
chmod 0440 '{sudoers}'
visudo -cf '{sudoers}' >/dev/null
"#,
            tmp = tmp.display(),
            helper = HELPER,
            sudoers = SUDOERS,
            user = user,
        );
        let itmp = std::env::temp_dir().join("clashlocal-grant.sh");
        std::fs::write(&itmp, installer).map_err(|e| format!("写安装脚本失败: {e}"))?;
        let out = Command::new("pkexec")
            .arg("bash")
            .arg(&itmp)
            .output()
            .map_err(|e| format!("pkexec 调用失败(需要授权): {e}"))?;
        let _ = std::fs::remove_file(&tmp);
        let _ = std::fs::remove_file(&itmp);
        if !out.status.success() {
            return Err(format!(
                "授权失败: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }
        Ok(())
    }

    /// 给/去内核二进制的 CAP_NET_ADMIN(TUN、tproxy 绑定都需要)。
    pub fn set_caps(bin: &str, on: bool) -> Result<(), String> {
        run(&[if on { "setcap" } else { "unsetcap" }, bin])
    }

    /// 免密执行助手(需已授权)。
    pub fn run(args: &[&str]) -> Result<(), String> {
        if !std::path::Path::new(HELPER).exists() {
            return Err("尚未授权,请先在设置里点「一次性授权(管理员)」".into());
        }
        let mut a: Vec<&str> = vec!["-n", HELPER];
        a.extend_from_slice(args);
        let out = Command::new("sudo")
            .args(&a)
            .output()
            .map_err(|e| format!("sudo 调用失败: {e}"))?;
        if !out.status.success() {
            return Err(format!(
                "网络操作失败(授权可能失效,请重新授权): {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }
        Ok(())
    }
}

#[cfg(not(target_os = "linux"))]
mod imp {
    pub fn is_granted() -> bool {
        false
    }
    pub fn grant() -> Result<(), String> {
        Err("一次性授权仅 Linux 需要".into())
    }
    pub fn run(_args: &[&str]) -> Result<(), String> {
        Ok(())
    }
    pub fn set_caps(_bin: &str, _on: bool) -> Result<(), String> {
        Ok(())
    }
}

pub use imp::{grant, is_granted, run, set_caps};
