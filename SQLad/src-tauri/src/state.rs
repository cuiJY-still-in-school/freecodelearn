use crate::ai::{Protocol, ProviderConfig};
use crate::automation::TriggerStore;
use crate::core::{traits::AIProvider, Registry};
use crate::credentials::CredentialStore;
use crate::importer::{CsvImporter, JsonImporter};
use crate::storage::SqliteAdapter;
use crate::tools::{
    CreateTableTool, DeleteCredentialTool, FetchUrlTool, InsertRowsTool, ListCredentialsTool,
    ListTablesTool, OpenUrlTool, QueryTool, SaveCredentialTool, UpdateCellTool,
};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub providers: Vec<ProviderConfig>,
    pub default_provider_id: Option<String>,
    #[serde(default = "default_port")]
    pub webhook_port: u16,
}

fn default_port() -> u16 {
    8585
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            providers: vec![ProviderConfig {
                id: "ollama-local".into(),
                name: "Ollama 本地".into(),
                protocol: Protocol::Ollama,
                base_url: "http://127.0.0.1:11434".into(),
                api_key: String::new(),
                model: "llama3.2".into(),
            }],
            default_provider_id: Some("ollama-local".into()),
            webhook_port: 8585,
        }
    }
}

/// Best-effort migration from the v0.1 flat settings schema
/// (ollama_*, minimax_*, default_ai) to the new providers list.
fn migrate_from_legacy(v: &Value) -> Option<AppSettings> {
    let obj = v.as_object()?;
    if obj.contains_key("providers") {
        return None;
    }
    let mut providers = Vec::new();
    if let (Some(url), Some(model)) = (
        obj.get("ollama_base_url").and_then(Value::as_str),
        obj.get("ollama_model").and_then(Value::as_str),
    ) {
        providers.push(ProviderConfig {
            id: "ollama-local".into(),
            name: "Ollama 本地".into(),
            protocol: Protocol::Ollama,
            base_url: url.into(),
            api_key: String::new(),
            model: model.into(),
        });
    }
    if let (Some(url), Some(model)) = (
        obj.get("minimax_base_url").and_then(Value::as_str),
        obj.get("minimax_model").and_then(Value::as_str),
    ) {
        providers.push(ProviderConfig {
            id: "minimax".into(),
            name: "MiniMax".into(),
            protocol: Protocol::Openai,
            base_url: url.into(),
            api_key: obj
                .get("minimax_api_key")
                .and_then(Value::as_str)
                .unwrap_or("")
                .into(),
            model: model.into(),
        });
    }
    if providers.is_empty() {
        return None;
    }
    let default_provider_id = match obj.get("default_ai").and_then(Value::as_str) {
        Some("minimax") => Some("minimax".into()),
        Some("ollama") => Some("ollama-local".into()),
        _ => Some(providers[0].id.clone()),
    };
    Some(AppSettings {
        providers,
        default_provider_id,
        webhook_port: 8585,
    })
}

pub struct AppState {
    pub registry: Arc<Registry>,
    pub settings: RwLock<AppSettings>,
    pub triggers: TriggerStore,
    pub credentials: Arc<CredentialStore>,
    pub webhook_port: Arc<parking_lot::RwLock<u16>>,
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
    pub settings_path: PathBuf,
}

impl AppState {
    pub fn bootstrap() -> anyhow::Result<Self> {
        let base = dirs::data_local_dir()
            .or_else(dirs::data_dir)
            .unwrap_or_else(|| PathBuf::from("."))
            .join("SQLad");
        std::fs::create_dir_all(&base)?;
        let db_path = base.join("sqlad.db");
        let settings_path = base.join("settings.json");

        let mut settings = if settings_path.exists() {
            let bytes = std::fs::read(&settings_path)?;
            let raw: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
            if let Some(migrated) = migrate_from_legacy(&raw) {
                migrated
            } else {
                serde_json::from_value(raw).unwrap_or_default()
            }
        } else {
            AppSettings::default()
        };
        // Ensure at least a default Ollama provider is present so the chat
        // panels work out of the box; user can edit/delete later.
        if settings.providers.is_empty() {
            settings = AppSettings::default();
        }
        if settings.default_provider_id.is_none() {
            settings.default_provider_id = settings.providers.first().map(|p| p.id.clone());
        }

        let registry = Arc::new(Registry::new());

        let sqlite = SqliteAdapter::open(db_path.clone())?;
        registry.register_storage(Arc::new(sqlite));

        registry.register_importer(Arc::new(CsvImporter));
        registry.register_importer(Arc::new(JsonImporter));

        registry.register_tool(Arc::new(QueryTool {
            registry: registry.clone(),
        }));
        registry.register_tool(Arc::new(ListTablesTool {
            registry: registry.clone(),
        }));
        registry.register_tool(Arc::new(CreateTableTool {
            registry: registry.clone(),
        }));
        registry.register_tool(Arc::new(InsertRowsTool {
            registry: registry.clone(),
        }));
        registry.register_tool(Arc::new(UpdateCellTool {
            registry: registry.clone(),
        }));
        // FetchUrlTool needs to see credentials so we wire it up after the
        // store is created (a few lines below). Hold off on registering it.

        let triggers = TriggerStore::load(&base)?;
        let credentials = Arc::new(CredentialStore::load(&base)?);

        // Now register tools that need the credential store.
        registry.register_tool(Arc::new(FetchUrlTool::new(credentials.clone())));
        registry.register_tool(Arc::new(SaveCredentialTool {
            store: credentials.clone(),
        }));
        registry.register_tool(Arc::new(ListCredentialsTool {
            store: credentials.clone(),
        }));
        registry.register_tool(Arc::new(DeleteCredentialTool {
            store: credentials.clone(),
        }));
        registry.register_tool(Arc::new(OpenUrlTool));

        let port = settings.webhook_port;
        let webhook_port_val = Arc::new(parking_lot::RwLock::new(port));

        let state = Self {
            registry: registry.clone(),
            settings: RwLock::new(settings),
            triggers,
            credentials,
            webhook_port: webhook_port_val.clone(),
            data_dir: base,
            db_path,
            settings_path,
        };
        state.save_settings().ok();

        Ok(state)
    }

    pub fn save_settings(&self) -> anyhow::Result<()> {
        let s = self.settings.read().clone();
        std::fs::write(&self.settings_path, serde_json::to_vec_pretty(&s)?)?;
        Ok(())
    }

    /// Build a provider instance on demand based on current settings.
    pub fn provider_for(&self, id: Option<&str>) -> Option<Arc<dyn AIProvider>> {
        let s = self.settings.read();
        let chosen = id
            .map(str::to_string)
            .or_else(|| s.default_provider_id.clone())
            .or_else(|| s.providers.first().map(|p| p.id.clone()))?;
        let cfg = s.providers.iter().find(|p| p.id == chosen)?;
        Some(crate::ai::build_provider(cfg))
    }
}
