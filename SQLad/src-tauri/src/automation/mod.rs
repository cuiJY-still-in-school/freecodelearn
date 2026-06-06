use crate::core::error::{SqlError, SqlResult};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trigger {
    pub id: String,
    pub name: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Polling interval in seconds. 0 means manual only (no auto poll).
    #[serde(default)]
    pub interval_secs: u64,
    /// SQL that returns ≥ 1 row when the trigger should fire.
    /// (Read-only — same safety rules as `query` tool.)
    pub condition_sql: String,
    /// Natural-language prompt sent to the AI when triggered; the matched
    /// rows are appended as JSON so the AI has them in-context.
    pub action_prompt: String,
    #[serde(default)]
    pub last_run_at: Option<i64>,
    /// Outcome of the last run: "fired" | "no_change" | "error" | "running"
    #[serde(default)]
    pub last_status: Option<String>,
    #[serde(default)]
    pub last_error: Option<String>,
    #[serde(default)]
    pub last_fired_rows: Option<u32>,
}

fn default_true() -> bool {
    true
}

#[derive(Clone, Default)]
pub struct TriggerStore {
    path: PathBuf,
    inner: Arc<RwLock<Vec<Trigger>>>,
}

impl TriggerStore {
    pub fn load(dir: &Path) -> SqlResult<Self> {
        let path = dir.join("triggers.json");
        let inner = if path.exists() {
            let bytes = std::fs::read(&path)
                .map_err(|e| SqlError::Storage(format!("triggers.json: {e}")))?;
            serde_json::from_slice(&bytes).unwrap_or_default()
        } else {
            Vec::new()
        };
        Ok(Self {
            path,
            inner: Arc::new(RwLock::new(inner)),
        })
    }

    pub fn list(&self) -> Vec<Trigger> {
        self.inner.read().clone()
    }

    pub fn upsert(&self, t: Trigger) -> SqlResult<()> {
        let mut g = self.inner.write();
        if let Some(existing) = g.iter_mut().find(|x| x.id == t.id) {
            *existing = t;
        } else {
            g.push(t);
        }
        let bytes = serde_json::to_vec_pretty(&*g)?;
        std::fs::write(&self.path, bytes)
            .map_err(|e| SqlError::Storage(format!("triggers.json: {e}")))?;
        Ok(())
    }

    pub fn delete(&self, id: &str) -> SqlResult<()> {
        let mut g = self.inner.write();
        g.retain(|t| t.id != id);
        let bytes = serde_json::to_vec_pretty(&*g)?;
        std::fs::write(&self.path, bytes)
            .map_err(|e| SqlError::Storage(format!("triggers.json: {e}")))?;
        Ok(())
    }

    pub fn get(&self, id: &str) -> Option<Trigger> {
        self.inner.read().iter().find(|t| t.id == id).cloned()
    }

    /// Mark a trigger's last_run_at/status without going through upsert.
    pub fn mark(&self, id: &str, status: &str, rows: Option<u32>, err: Option<&str>) {
        let mut g = self.inner.write();
        if let Some(t) = g.iter_mut().find(|t| t.id == id) {
            t.last_run_at = Some(chrono::Utc::now().timestamp());
            t.last_status = Some(status.into());
            t.last_fired_rows = rows;
            t.last_error = err.map(str::to_string);
        }
        if let Ok(bytes) = serde_json::to_vec_pretty(&*g) {
            let _ = std::fs::write(&self.path, bytes);
        }
    }
}
