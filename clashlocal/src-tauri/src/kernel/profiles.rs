use std::io::Read;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone)]
pub struct Profile {
    pub uid: String,
    pub name: String,
    pub url: Option<String>,
    pub updated: u64,
}

#[derive(Serialize, Deserialize, Default)]
pub struct ProfileIndex {
    pub profiles: Vec<Profile>,
    pub active: Option<String>,
}

pub fn profiles_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {e}"))?
        .join("profiles");
    Ok(dir)
}

fn index_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(profiles_dir(app)?.join("index.json"))
}

fn yaml_path(app: &tauri::AppHandle, uid: &str) -> Result<PathBuf, String> {
    Ok(profiles_dir(app)?.join(format!("{uid}.yaml")))
}

pub fn load_index(app: &tauri::AppHandle) -> Result<ProfileIndex, String> {
    match std::fs::read_to_string(index_path(app)?) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| format!("解析订阅索引失败: {e}")),
        Err(_) => Ok(ProfileIndex::default()),
    }
}

fn save_index(app: &tauri::AppHandle, idx: &ProfileIndex) -> Result<(), String> {
    let dir = profiles_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建 profiles 目录失败: {e}"))?;
    let json = serde_json::to_string_pretty(idx).map_err(|e| e.to_string())?;
    std::fs::write(index_path(app)?, json).map_err(|e| format!("写入订阅索引失败: {e}"))
}

/// 当前激活订阅的原始 YAML(无则 None)。
pub fn active_profile_yaml(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let idx = load_index(app)?;
    match idx.active {
        Some(uid) => Ok(std::fs::read_to_string(yaml_path(app, &uid)?).ok()),
        None => Ok(None),
    }
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn gen_uid() -> String {
    let mut buf = [0u8; 8];
    if std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut buf))
        .is_ok()
    {
        buf.iter().map(|b| format!("{b:02x}")).collect()
    } else {
        format!("p{}", now())
    }
}

fn looks_like_clash(s: &str) -> bool {
    s.contains("proxies:") || s.contains("proxy-groups:")
}

/// 订阅可能是明文 clash YAML,也可能是 base64。归一化成 YAML 文本。
fn normalize(raw: String) -> String {
    if looks_like_clash(&raw) {
        return raw;
    }
    let compact: String = raw.split_whitespace().collect();
    if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(compact.as_bytes()) {
        if let Ok(s) = String::from_utf8(bytes) {
            if looks_like_clash(&s) {
                return s;
            }
        }
    }
    raw
}

async fn fetch(url: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("clash.meta")
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("下载订阅失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("订阅服务器返回 {}", resp.status()));
    }
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取订阅内容失败: {e}"))?;
    Ok(normalize(text))
}

fn validate(yaml: &str) -> Result<(), String> {
    serde_yaml::from_str::<serde_yaml::Value>(yaml).map_err(|e| format!("订阅不是有效 YAML: {e}"))?;
    Ok(())
}

pub async fn import_profile(
    app: tauri::AppHandle,
    name: String,
    url: String,
) -> Result<Profile, String> {
    let yaml = fetch(&url).await?;
    validate(&yaml)?;
    std::fs::create_dir_all(profiles_dir(&app)?).map_err(|e| format!("创建目录失败: {e}"))?;
    let uid = gen_uid();
    std::fs::write(yaml_path(&app, &uid)?, &yaml).map_err(|e| format!("写入订阅失败: {e}"))?;
    let mut idx = load_index(&app)?;
    let prof = Profile {
        uid: uid.clone(),
        name,
        url: Some(url),
        updated: now(),
    };
    idx.profiles.push(prof.clone());
    if idx.active.is_none() {
        idx.active = Some(uid);
    }
    save_index(&app, &idx)?;
    Ok(prof)
}

pub fn set_active(app: &tauri::AppHandle, uid: String) -> Result<(), String> {
    let mut idx = load_index(app)?;
    if !idx.profiles.iter().any(|p| p.uid == uid) {
        return Err("订阅不存在".into());
    }
    idx.active = Some(uid);
    save_index(app, &idx)
}

pub fn delete(app: &tauri::AppHandle, uid: String) -> Result<(), String> {
    let mut idx = load_index(app)?;
    idx.profiles.retain(|p| p.uid != uid);
    if idx.active.as_deref() == Some(uid.as_str()) {
        idx.active = idx.profiles.first().map(|p| p.uid.clone());
    }
    let _ = std::fs::remove_file(yaml_path(app, &uid)?);
    save_index(app, &idx)
}

pub async fn update_profile(app: tauri::AppHandle, uid: String) -> Result<(), String> {
    let url = {
        let idx = load_index(&app)?;
        idx.profiles
            .iter()
            .find(|p| p.uid == uid)
            .ok_or_else(|| "订阅不存在".to_string())?
            .url
            .clone()
            .ok_or_else(|| "该订阅无 URL,无法更新".to_string())?
    };
    let yaml = fetch(&url).await?;
    validate(&yaml)?;
    std::fs::write(yaml_path(&app, &uid)?, &yaml).map_err(|e| format!("写入订阅失败: {e}"))?;
    let mut idx = load_index(&app)?;
    if let Some(p) = idx.profiles.iter_mut().find(|p| p.uid == uid) {
        p.updated = now();
    }
    save_index(&app, &idx)
}
