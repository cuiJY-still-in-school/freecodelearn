use std::io::Read;
use std::path::PathBuf;

use serde_yaml::{Mapping, Value};
use tauri::Manager;

use crate::kernel::{
    profiles, settings, CONTROLLER_HOST, CONTROLLER_PORT, DNS_PORT, MIXED_PORT, TPROXY_PORT,
};

/// mihomo 工作目录(geoip 缓存、日志等):<app_data>/run
pub fn run_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {e}"))?
        .join("run");
    Ok(dir)
}

pub fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(run_dir(app)?.join("config.yaml"))
}

fn secret_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(run_dir(app)?.join("secret"))
}

/// 读取或生成持久 secret(16 字节 hex),用于 external-controller 鉴权。
pub fn ensure_secret(app: &tauri::AppHandle) -> Result<String, String> {
    let dir = run_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建 run 目录失败: {e}"))?;
    let p = secret_path(app)?;
    if let Ok(s) = std::fs::read_to_string(&p) {
        let s = s.trim().to_string();
        if !s.is_empty() {
            return Ok(s);
        }
    }
    let mut buf = [0u8; 16];
    std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut buf))
        .map_err(|e| format!("读取随机数失败: {e}"))?;
    let secret: String = buf.iter().map(|b| format!("{b:02x}")).collect();
    std::fs::write(&p, &secret).map_err(|e| format!("写入 secret 失败: {e}"))?;
    Ok(secret)
}

fn put(map: &mut Mapping, key: &str, val: Value) {
    map.insert(Value::String(key.to_string()), val);
}

/// 生成 config.yaml:有激活订阅则以其为基础,强制覆盖我们的控制项(端口/控制器/
/// secret/allow-lan 等);否则生成 DIRECT 直连的默认配置。返回 (config路径, secret)。
pub fn write_config(app: &tauri::AppHandle) -> Result<(PathBuf, String), String> {
    let dir = run_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建 run 目录失败: {e}"))?;
    let secret = ensure_secret(app)?;

    let mut doc: Value = match profiles::active_profile_yaml(app)? {
        Some(raw) => serde_yaml::from_str(&raw).map_err(|e| format!("解析订阅失败: {e}"))?,
        None => Value::Mapping(Mapping::new()),
    };
    if !doc.is_mapping() {
        doc = Value::Mapping(Mapping::new());
    }
    let map = doc.as_mapping_mut().unwrap();

    // 强制覆盖的控制项(无论订阅里写了什么)
    put(map, "mixed-port", Value::from(MIXED_PORT as u64));
    put(map, "allow-lan", Value::from(true));
    put(map, "bind-address", Value::from("*"));
    put(
        map,
        "external-controller",
        Value::from(format!("{CONTROLLER_HOST}:{CONTROLLER_PORT}")),
    );
    put(map, "secret", Value::from(secret.clone()));
    put(map, "ipv6", Value::from(false));
    if map.get("mode").is_none() {
        put(map, "mode", Value::from("rule"));
    }
    if map.get("log-level").is_none() {
        put(map, "log-level", Value::from("info"));
    }

    // 透明代理模式:加 tproxy-port + fake-ip DNS(热点设备零配置走 VPN)
    if settings::load(app).transparent {
        put(map, "tproxy-port", Value::from(TPROXY_PORT as u64));
        let dns: Value = serde_yaml::from_str(&format!(
            "enable: true\nlisten: 0.0.0.0:{dns}\nenhanced-mode: fake-ip\nfake-ip-range: 28.0.0.1/8\nnameserver:\n  - 223.5.5.5\n  - 8.8.8.8\n",
            dns = DNS_PORT
        ))
        .map_err(|e| e.to_string())?;
        put(map, "dns", dns);
    }

    // 无订阅时补 DIRECT 直连组与兜底规则
    if map.get("proxies").is_none() {
        put(map, "proxies", Value::Sequence(vec![]));
    }
    if map.get("proxy-groups").is_none() {
        let g: Value = serde_yaml::from_str("- {name: PROXY, type: select, proxies: [DIRECT]}")
            .map_err(|e| e.to_string())?;
        put(map, "proxy-groups", g);
    }
    if map.get("rules").is_none() {
        let r: Value = serde_yaml::from_str("- MATCH,DIRECT").map_err(|e| e.to_string())?;
        put(map, "rules", r);
    }

    let out = serde_yaml::to_string(&doc).map_err(|e| format!("序列化 config 失败: {e}"))?;
    let path = config_path(app)?;
    std::fs::write(&path, out).map_err(|e| format!("写入 config 失败: {e}"))?;
    Ok((path, secret))
}
