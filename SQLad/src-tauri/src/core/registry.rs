use super::traits::{AIProvider, Importer, StorageAdapter, Tool};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;

/// Process-wide registry of pluggable components. Adapters and providers
/// register themselves at startup; tools can be added dynamically.
#[derive(Default)]
pub struct Registry {
    storages: RwLock<HashMap<String, Arc<dyn StorageAdapter>>>,
    ai: RwLock<HashMap<String, Arc<dyn AIProvider>>>,
    importers: RwLock<Vec<Arc<dyn Importer>>>,
    tools: RwLock<HashMap<String, Arc<dyn Tool>>>,

    default_storage: RwLock<Option<String>>,
    default_ai: RwLock<Option<String>>,
}

impl Registry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register_storage(&self, adapter: Arc<dyn StorageAdapter>) {
        let id = adapter.id().to_string();
        let mut s = self.storages.write();
        let mut d = self.default_storage.write();
        if d.is_none() {
            *d = Some(id.clone());
        }
        s.insert(id, adapter);
    }

    pub fn register_ai(&self, provider: Arc<dyn AIProvider>) {
        let id = provider.id().to_string();
        let mut s = self.ai.write();
        let mut d = self.default_ai.write();
        if d.is_none() {
            *d = Some(id.clone());
        }
        s.insert(id, provider);
    }

    pub fn register_importer(&self, importer: Arc<dyn Importer>) {
        self.importers.write().push(importer);
    }

    pub fn register_tool(&self, tool: Arc<dyn Tool>) {
        let name = tool.spec().name.clone();
        self.tools.write().insert(name, tool);
    }

    pub fn storage(&self, id: Option<&str>) -> Option<Arc<dyn StorageAdapter>> {
        let key = match id {
            Some(k) => k.to_string(),
            None => self.default_storage.read().clone()?,
        };
        self.storages.read().get(&key).cloned()
    }

    pub fn ai(&self, id: Option<&str>) -> Option<Arc<dyn AIProvider>> {
        let key = match id {
            Some(k) => k.to_string(),
            None => self.default_ai.read().clone()?,
        };
        self.ai.read().get(&key).cloned()
    }

    pub fn importers(&self) -> Vec<Arc<dyn Importer>> {
        self.importers.read().clone()
    }

    pub fn tool(&self, name: &str) -> Option<Arc<dyn Tool>> {
        self.tools.read().get(name).cloned()
    }

    pub fn tools(&self) -> Vec<Arc<dyn Tool>> {
        self.tools.read().values().cloned().collect()
    }

    pub fn list_storage_ids(&self) -> Vec<(String, String)> {
        self.storages
            .read()
            .values()
            .map(|a| (a.id().to_string(), a.display_name().to_string()))
            .collect()
    }

    pub fn list_ai_ids(&self) -> Vec<(String, String)> {
        self.ai
            .read()
            .values()
            .map(|a| (a.id().to_string(), a.display_name().to_string()))
            .collect()
    }
}
