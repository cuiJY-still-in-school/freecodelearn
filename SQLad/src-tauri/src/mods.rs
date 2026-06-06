//! User-installable service catalog mods.
//!
//! Drop a `.json` file into `<data_dir>/mods/` and SQLad picks it up on
//! launch (or via reload). Each file is a single ServiceCatalogEntry — same
//! shape as the built-in ones declared in the TS catalog. Mods with the same
//! `id` as a built-in *override* the built-in.

use crate::core::error::{SqlError, SqlResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceMod {
    /// Original file path (filled by the loader). Set to "" in the file itself.
    #[serde(default)]
    pub path: String,
    /// Parsed JSON of the catalog entry — we don't impose a strict schema
    /// at the Rust layer; the frontend validates and renders.
    #[serde(flatten)]
    pub entry: serde_json::Value,
}

pub fn mods_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("mods")
}

pub fn ensure_dir(data_dir: &Path) -> SqlResult<PathBuf> {
    let dir = mods_dir(data_dir);
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| SqlError::Storage(format!("mods dir: {e}")))?;
    }
    Ok(dir)
}

pub fn load(data_dir: &Path) -> Vec<ServiceMod> {
    let dir = match ensure_dir(data_dir) {
        Ok(d) => d,
        Err(_) => return Vec::new(),
    };
    let entries = match std::fs::read_dir(&dir) {
        Ok(it) => it,
        Err(_) => return Vec::new(),
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let bytes = match std::fs::read(&p) {
            Ok(b) => b,
            Err(_) => continue,
        };
        let v: serde_json::Value = match serde_json::from_slice(&bytes) {
            Ok(v) => v,
            Err(_) => continue,
        };
        out.push(ServiceMod {
            path: p.to_string_lossy().to_string(),
            entry: v,
        });
    }
    out
}
