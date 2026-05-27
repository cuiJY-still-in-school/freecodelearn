//! 透明代理(仅 Linux):通过「一次性授权」装好的 root 助手脚本执行 nft TPROXY +
//! setcap + ip rule(走 sudo -n 免密,见 privilege.rs)。非 Linux 返回提示用代理模式。

#[cfg(target_os = "linux")]
mod imp {
    use crate::kernel::privilege;

    pub fn enable(subnet: &str, tproxy_port: u16, bin: &str) -> Result<(), String> {
        privilege::run(&["enable", subnet, &tproxy_port.to_string(), bin])
    }

    pub fn disable(bin: &str) -> Result<(), String> {
        privilege::run(&["disable", bin])
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
