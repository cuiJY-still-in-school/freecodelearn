//! Local credential store. Tokens for external APIs (OAuth access tokens,
//! API keys) live in a single JSON file in the data dir. The AI assistant
//! can save / list / delete credentials but cannot read their values directly
//! — to use a credential, the AI passes its *name* to `fetch_url`, and the
//! backend injects the value into the request. This avoids the value ever
//! flowing back through model output (which could be exfiltrated by prompt
//! injection of an unrelated tool).

use crate::core::error::{SqlError, SqlResult};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credential {
    pub name: String,
    /// The actual secret value. Stored in plain JSON for v0; future work:
    /// move to OS keyring (Secret Service / KWallet / Keychain).
    pub value: String,
    /// Free-form note for the user ("GitHub PAT", "GCP service account…").
    #[serde(default)]
    pub hint: Option<String>,
    /// How fetch_url should attach this credential by default.
    /// - "bearer" → `Authorization: Bearer <value>`
    /// - "header:X-API-Key" → `X-API-Key: <value>` (anything after `header:`)
    /// - "query:api_key" → `?api_key=<value>` appended (after `query:`)
    /// Default: bearer.
    #[serde(default = "default_scheme")]
    pub scheme: String,
    #[serde(default)]
    pub created_at: i64,
}

fn default_scheme() -> String {
    "bearer".into()
}

/// View shown to the AI / UI list — never includes the secret value.
#[derive(Debug, Clone, Serialize)]
pub struct CredentialInfo {
    pub name: String,
    pub hint: Option<String>,
    pub scheme: String,
    pub created_at: i64,
}

#[derive(Default)]
pub struct CredentialStore {
    path: PathBuf,
    inner: RwLock<Vec<Credential>>,
}

impl CredentialStore {
    pub fn load(dir: &Path) -> SqlResult<Self> {
        let path = dir.join("credentials.json");
        let inner: Vec<Credential> = if path.exists() {
            let bytes = std::fs::read(&path)
                .map_err(|e| SqlError::Storage(format!("credentials.json: {e}")))?;
            serde_json::from_slice(&bytes).unwrap_or_default()
        } else {
            Vec::new()
        };
        Ok(Self {
            path,
            inner: RwLock::new(inner),
        })
    }

    fn persist(&self) -> SqlResult<()> {
        let g = self.inner.read();
        let bytes = serde_json::to_vec_pretty(&*g)?;
        std::fs::write(&self.path, bytes)
            .map_err(|e| SqlError::Storage(format!("credentials.json: {e}")))?;
        Ok(())
    }

    pub fn list(&self) -> Vec<CredentialInfo> {
        self.inner
            .read()
            .iter()
            .map(|c| CredentialInfo {
                name: c.name.clone(),
                hint: c.hint.clone(),
                scheme: c.scheme.clone(),
                created_at: c.created_at,
            })
            .collect()
    }

    pub fn save(&self, name: String, value: String, hint: Option<String>, scheme: Option<String>) -> SqlResult<()> {
        if name.trim().is_empty() {
            return Err(SqlError::Invalid("name 不能为空".into()));
        }
        if value.is_empty() {
            return Err(SqlError::Invalid("value 不能为空".into()));
        }
        let created_at = chrono::Utc::now().timestamp();
        let mut g = self.inner.write();
        let scheme = scheme.unwrap_or_else(default_scheme);
        if let Some(existing) = g.iter_mut().find(|c| c.name == name) {
            existing.value = value;
            existing.hint = hint;
            existing.scheme = scheme;
        } else {
            g.push(Credential {
                name,
                value,
                hint,
                scheme,
                created_at,
            });
        }
        drop(g);
        self.persist()
    }

    pub fn delete(&self, name: &str) -> SqlResult<()> {
        {
            let mut g = self.inner.write();
            g.retain(|c| c.name != name);
        }
        self.persist()
    }

    /// Look up the secret value by name. Only the backend calls this when
    /// the AI invokes fetch_url with a `credential` reference.
    pub fn get(&self, name: &str) -> Option<Credential> {
        self.inner.read().iter().find(|c| c.name == name).cloned()
    }
}
