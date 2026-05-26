//! 透明代理(仅 Linux):nft TPROXY 把热点子网 TCP+UDP 导入 mihomo 的 tproxy-port,
//! tproxy 监听需 CAP_NET_ADMIN,故给 mihomo 二进制 setcap(须非 nosuid 挂载)。
//! setcap + nft + ip rule 都需 root,经 pkexec 执行;开关配对,关闭时完整回滚。
//! 非 Linux 平台不支持透明,返回提示(请用代理模式)。

#[cfg(target_os = "linux")]
mod imp {
    use std::process::Command;

    const FWMARK: &str = "1";
    const RT_TABLE: &str = "100";

    fn enable_script(subnet: &str, tproxy_port: u16, bin: &str) -> String {
        format!(
            r#"set -e
setcap 'cap_net_admin,cap_net_bind_service=+ep' '{bin}'
nft -f - <<'NFT'
table inet clashlocal
delete table inet clashlocal
table inet clashlocal {{
  chain prerouting {{
    type filter hook prerouting priority mangle; policy accept;
    ip saddr {subnet} ip daddr {{ 127.0.0.0/8, 10.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/4, 255.255.255.255 }} return
    ip saddr {subnet} meta l4proto {{ tcp, udp }} meta mark set {fwmark} tproxy ip to :{tproxy}
  }}
}}
NFT
ip rule add fwmark {fwmark} table {rt} 2>/dev/null || true
ip route replace local default dev lo table {rt}
sysctl -w net.ipv4.ip_forward=1 >/dev/null
"#,
            bin = bin,
            subnet = subnet,
            tproxy = tproxy_port,
            fwmark = FWMARK,
            rt = RT_TABLE,
        )
    }

    fn disable_script(bin: &str) -> String {
        format!(
            r#"nft delete table inet clashlocal 2>/dev/null || true
ip rule del fwmark {fwmark} table {rt} 2>/dev/null || true
ip route flush table {rt} 2>/dev/null || true
setcap -r '{bin}' 2>/dev/null || true
"#,
            bin = bin,
            fwmark = FWMARK,
            rt = RT_TABLE,
        )
    }

    fn run_root(script: &str) -> Result<(), String> {
        let tmp = std::env::temp_dir().join("clashlocal_net.sh");
        std::fs::write(&tmp, script).map_err(|e| format!("写入脚本失败: {e}"))?;
        let out = Command::new("pkexec")
            .arg("bash")
            .arg(&tmp)
            .output()
            .map_err(|e| format!("pkexec 调用失败(需要授权): {e}"))?;
        let _ = std::fs::remove_file(&tmp);
        if !out.status.success() {
            return Err(format!(
                "应用网络规则失败: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            ));
        }
        Ok(())
    }

    pub fn enable(subnet: &str, tproxy_port: u16, bin: &str) -> Result<(), String> {
        run_root(&enable_script(subnet, tproxy_port, bin))
    }

    pub fn disable(bin: &str) -> Result<(), String> {
        run_root(&disable_script(bin))
    }
}

#[cfg(not(target_os = "linux"))]
mod imp {
    pub fn enable(_subnet: &str, _tproxy_port: u16, _bin: &str) -> Result<(), String> {
        Err("透明代理仅支持 Linux;本平台请用代理模式(设备手动把代理设为 本机IP:7893)".into())
    }
    pub fn disable(_bin: &str) -> Result<(), String> {
        Ok(())
    }
}

pub use imp::{disable, enable};
