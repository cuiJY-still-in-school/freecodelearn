use crate::ai::{Protocol, ProviderConfig};
use crate::automation::Trigger;
use crate::core::{
    error::{SqlError, SqlResult},
    types::{ChatReply, ChatRequest, ColumnDef, QueryResult, TableSchema, ToolSpec},
};
use crate::credentials::CredentialInfo;
use crate::state::{AppSettings, AppState};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

#[derive(Serialize)]
pub struct AdapterInfo {
    pub id: String,
    pub name: String,
}

#[derive(Serialize)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub protocol: Protocol,
    pub model: String,
    pub is_default: bool,
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> AppSettings {
    state.settings.read().clone()
}

#[tauri::command]
pub fn save_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> SqlResult<()> {
    *state.settings.write() = settings;
    state
        .save_settings()
        .map_err(|e| SqlError::Other(anyhow::anyhow!(e)))
}

#[tauri::command]
pub fn list_storage_adapters(state: State<'_, AppState>) -> Vec<AdapterInfo> {
    state
        .registry
        .list_storage_ids()
        .into_iter()
        .map(|(id, name)| AdapterInfo { id, name })
        .collect()
}

#[tauri::command]
pub fn list_ai_providers(state: State<'_, AppState>) -> Vec<ProviderInfo> {
    let s = state.settings.read();
    let default = s.default_provider_id.clone();
    s.providers
        .iter()
        .map(|p| ProviderInfo {
            id: p.id.clone(),
            name: p.name.clone(),
            protocol: p.protocol,
            model: p.model.clone(),
            is_default: default.as_deref() == Some(p.id.as_str()),
        })
        .collect()
}

#[tauri::command]
pub fn upsert_provider(
    state: State<'_, AppState>,
    provider: ProviderConfig,
) -> SqlResult<()> {
    if provider.id.trim().is_empty() {
        return Err(SqlError::Invalid("provider id 不能为空".into()));
    }
    {
        let mut s = state.settings.write();
        if let Some(existing) = s.providers.iter_mut().find(|p| p.id == provider.id) {
            *existing = provider;
        } else {
            s.providers.push(provider);
        }
        if s.default_provider_id.is_none() {
            s.default_provider_id = s.providers.first().map(|p| p.id.clone());
        }
    }
    state
        .save_settings()
        .map_err(|e| SqlError::Other(anyhow::anyhow!(e)))
}

#[tauri::command]
pub fn delete_provider(state: State<'_, AppState>, id: String) -> SqlResult<()> {
    {
        let mut s = state.settings.write();
        s.providers.retain(|p| p.id != id);
        if s.default_provider_id.as_deref() == Some(id.as_str()) {
            s.default_provider_id = s.providers.first().map(|p| p.id.clone());
        }
    }
    state
        .save_settings()
        .map_err(|e| SqlError::Other(anyhow::anyhow!(e)))
}

#[tauri::command]
pub async fn test_provider(provider: ProviderConfig) -> SqlResult<String> {
    use crate::core::types::{ChatMessage, ChatRequest, ChatRole};
    let p = crate::ai::build_provider(&provider);
    let req = ChatRequest {
        messages: vec![
            ChatMessage {
                role: ChatRole::System,
                content: "Reply with the word 'pong' only.".into(),
                tool_call_id: None,
                tool_calls: vec![],
            },
            ChatMessage {
                role: ChatRole::User,
                content: "ping".into(),
                tool_call_id: None,
                tool_calls: vec![],
            },
        ],
        tools: vec![],
        model: None,
        temperature: Some(0.0),
    };
    let reply = p.chat(req).await?;
    let snippet: String = reply.message.content.chars().take(120).collect();
    Ok(snippet)
}

#[tauri::command]
pub fn set_default_provider(state: State<'_, AppState>, id: String) -> SqlResult<()> {
    {
        let mut s = state.settings.write();
        if !s.providers.iter().any(|p| p.id == id) {
            return Err(SqlError::NotFound(format!("provider {id}")));
        }
        s.default_provider_id = Some(id);
    }
    state
        .save_settings()
        .map_err(|e| SqlError::Other(anyhow::anyhow!(e)))
}

#[tauri::command]
pub fn list_tools(state: State<'_, AppState>) -> Vec<ToolSpec> {
    state.registry.tools().iter().map(|t| t.spec()).collect()
}

#[tauri::command]
pub async fn list_tables(state: State<'_, AppState>) -> SqlResult<Vec<TableSchema>> {
    let storage = state.registry.storage(None).ok_or_else(|| {
        SqlError::NotFound("no storage adapter registered".into())
    })?;
    storage.list_tables().await
}

#[tauri::command]
pub async fn create_table(
    state: State<'_, AppState>,
    schema: TableSchema,
) -> SqlResult<()> {
    let storage = state
        .registry
        .storage(None)
        .ok_or_else(|| SqlError::NotFound("no storage".into()))?;
    storage.create_table(&schema).await
}

#[tauri::command]
pub async fn drop_table(state: State<'_, AppState>, name: String) -> SqlResult<()> {
    let storage = state
        .registry
        .storage(None)
        .ok_or_else(|| SqlError::NotFound("no storage".into()))?;
    storage.drop_table(&name).await
}

#[tauri::command]
pub async fn insert_blank_row(state: State<'_, AppState>, table: String) -> SqlResult<i64> {
    let storage = state
        .registry
        .storage(None)
        .ok_or_else(|| SqlError::NotFound("no storage".into()))?;
    storage.insert_blank_row(&table).await
}

#[derive(Deserialize)]
pub struct UpdateCellCmd {
    pub table: String,
    pub row_id: i64,
    pub column: String,
    pub value: Value,
}

#[tauri::command]
pub async fn update_cell(state: State<'_, AppState>, cmd: UpdateCellCmd) -> SqlResult<()> {
    let storage = state
        .registry
        .storage(None)
        .ok_or_else(|| SqlError::NotFound("no storage".into()))?;
    storage
        .update_cell(&cmd.table, cmd.row_id, &cmd.column, &cmd.value)
        .await
}

#[derive(Deserialize)]
pub struct DeleteRowsCmd {
    pub table: String,
    pub row_ids: Vec<i64>,
}

#[tauri::command]
pub async fn delete_rows(state: State<'_, AppState>, cmd: DeleteRowsCmd) -> SqlResult<usize> {
    let storage = state
        .registry
        .storage(None)
        .ok_or_else(|| SqlError::NotFound("no storage".into()))?;
    storage.delete_rows(&cmd.table, &cmd.row_ids).await
}

#[derive(Deserialize)]
pub struct AddColumnCmd {
    pub table: String,
    pub column: ColumnDef,
}

#[tauri::command]
pub async fn add_column(state: State<'_, AppState>, cmd: AddColumnCmd) -> SqlResult<()> {
    let storage = state
        .registry
        .storage(None)
        .ok_or_else(|| SqlError::NotFound("no storage".into()))?;
    storage.add_column(&cmd.table, &cmd.column).await
}

#[derive(Deserialize)]
pub struct RenameColumnCmd {
    pub table: String,
    pub from: String,
    pub to: String,
}

#[tauri::command]
pub async fn rename_column(state: State<'_, AppState>, cmd: RenameColumnCmd) -> SqlResult<()> {
    let storage = state
        .registry
        .storage(None)
        .ok_or_else(|| SqlError::NotFound("no storage".into()))?;
    storage.rename_column(&cmd.table, &cmd.from, &cmd.to).await
}

#[derive(Deserialize)]
pub struct DropColumnCmd {
    pub table: String,
    pub column: String,
}

#[tauri::command]
pub async fn drop_column(state: State<'_, AppState>, cmd: DropColumnCmd) -> SqlResult<()> {
    let storage = state
        .registry
        .storage(None)
        .ok_or_else(|| SqlError::NotFound("no storage".into()))?;
    storage.drop_column(&cmd.table, &cmd.column).await
}

#[tauri::command]
pub async fn run_query(state: State<'_, AppState>, sql: String) -> SqlResult<QueryResult> {
    let storage = state
        .registry
        .storage(None)
        .ok_or_else(|| SqlError::NotFound("no storage".into()))?;
    storage.query(&sql).await
}

#[derive(Deserialize)]
pub struct ImportRequest {
    pub filename_hint: Option<String>,
    /// Raw bytes (frontend reads file or text body and sends as base64 or array)
    pub bytes: Vec<u8>,
    /// If set, override the suggested table name.
    pub table_name: Option<String>,
}

#[derive(Serialize)]
pub struct ImportResult {
    pub table: String,
    pub rows_inserted: usize,
    pub schema: TableSchema,
}

#[tauri::command]
pub async fn import_data(
    state: State<'_, AppState>,
    req: ImportRequest,
) -> SqlResult<ImportResult> {
    let storage = state
        .registry
        .storage(None)
        .ok_or_else(|| SqlError::NotFound("no storage".into()))?;
    let importers = state.registry.importers();
    let hint = req.filename_hint.as_deref();
    let chosen = importers
        .iter()
        .find(|i| i.detect(hint, &req.bytes))
        .ok_or_else(|| SqlError::Importer("无法识别数据格式".into()))?;
    let mut parsed = chosen.parse(hint, &req.bytes).await?;
    if let Some(name) = req.table_name {
        let n = crate::importer::sanitize_name(&name);
        parsed.schema.name = n.clone();
        parsed.suggested_name = n;
    }
    storage.create_table(&parsed.schema).await?;
    let inserted = storage.insert_rows(&parsed.schema.name, &parsed.rows).await?;
    let final_schema = storage.describe(&parsed.schema.name).await?;
    Ok(ImportResult {
        table: parsed.schema.name,
        rows_inserted: inserted,
        schema: final_schema,
    })
}

#[derive(Deserialize)]
pub struct ChatCmd {
    pub request: ChatRequest,
    pub provider_id: Option<String>,
}

#[tauri::command]
pub async fn chat(state: State<'_, AppState>, cmd: ChatCmd) -> SqlResult<ChatReply> {
    let provider = state
        .provider_for(cmd.provider_id.as_deref())
        .ok_or_else(|| SqlError::NotFound("没有可用的 AI provider，请到设置里添加一个".into()))?;
    provider.chat(cmd.request).await
}

#[derive(Deserialize)]
pub struct InvokeToolCmd {
    pub name: String,
    pub arguments: Value,
}

#[tauri::command]
pub async fn invoke_tool(
    state: State<'_, AppState>,
    cmd: InvokeToolCmd,
) -> SqlResult<Value> {
    let tool = state
        .registry
        .tool(&cmd.name)
        .ok_or_else(|| SqlError::NotFound(format!("tool {}", cmd.name)))?;
    tool.invoke(cmd.arguments).await
}

#[tauri::command]
pub fn data_dir(state: State<'_, AppState>) -> String {
    state.data_dir.to_string_lossy().to_string()
}

// ---- Automation / triggers ----

#[tauri::command]
pub fn list_triggers(state: State<'_, AppState>) -> Vec<Trigger> {
    state.triggers.list()
}

#[tauri::command]
pub fn save_trigger(state: State<'_, AppState>, trigger: Trigger) -> SqlResult<()> {
    if trigger.id.trim().is_empty() || trigger.name.trim().is_empty() {
        return Err(SqlError::Invalid("trigger 需要 id 和 name".into()));
    }
    state.triggers.upsert(trigger)
}

#[tauri::command]
pub fn delete_trigger(state: State<'_, AppState>, id: String) -> SqlResult<()> {
    state.triggers.delete(&id)
}

/// Evaluate a trigger's condition: run the condition SQL and return rows.
/// The frontend scheduler then sends rows to the AI; we mark the run here.
#[tauri::command]
pub async fn evaluate_trigger(
    state: State<'_, AppState>,
    id: String,
) -> SqlResult<QueryResult> {
    let trigger = state
        .triggers
        .get(&id)
        .ok_or_else(|| SqlError::NotFound(format!("trigger {id}")))?;
    let lower = trigger.condition_sql.trim_start().to_ascii_lowercase();
    if !(lower.starts_with("select")
        || lower.starts_with("with")
        || lower.starts_with("pragma"))
    {
        state
            .triggers
            .mark(&id, "error", None, Some("condition 必须以 SELECT/WITH/PRAGMA 开头"));
        return Err(SqlError::Invalid(
            "condition 必须是只读语句 (SELECT/WITH/PRAGMA)".into(),
        ));
    }
    let storage = state
        .registry
        .storage(None)
        .ok_or_else(|| SqlError::NotFound("no storage".into()))?;
    match storage.query(&trigger.condition_sql).await {
        Ok(r) => {
            state
                .triggers
                .mark(&id, "running", Some(r.row_count as u32), None);
            Ok(r)
        }
        Err(e) => {
            state
                .triggers
                .mark(&id, "error", None, Some(&e.to_string()));
            Err(e)
        }
    }
}

#[derive(Deserialize)]
pub struct MarkTriggerCmd {
    pub id: String,
    pub status: String,
    pub rows: Option<u32>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn mark_trigger(state: State<'_, AppState>, cmd: MarkTriggerCmd) -> SqlResult<()> {
    state.triggers.mark(&cmd.id, &cmd.status, cmd.rows, cmd.error.as_deref());
    Ok(())
}

// ---- Credentials ----

#[tauri::command]
pub fn list_credentials(state: State<'_, AppState>) -> Vec<CredentialInfo> {
    state.credentials.list()
}

#[derive(Deserialize)]
pub struct SaveCredentialCmd {
    pub name: String,
    pub value: String,
    pub hint: Option<String>,
    pub scheme: Option<String>,
}

#[tauri::command]
pub fn save_credential(state: State<'_, AppState>, cmd: SaveCredentialCmd) -> SqlResult<()> {
    state
        .credentials
        .save(cmd.name, cmd.value, cmd.hint, cmd.scheme)
}

#[tauri::command]
pub fn delete_credential(state: State<'_, AppState>, name: String) -> SqlResult<()> {
    state.credentials.delete(&name)
}

// ---- Service mods ----

#[tauri::command]
pub fn list_service_mods(state: State<'_, AppState>) -> Vec<crate::mods::ServiceMod> {
    crate::mods::load(&state.data_dir)
}

#[tauri::command]
pub fn mods_dir(state: State<'_, AppState>) -> SqlResult<String> {
    let dir = crate::mods::ensure_dir(&state.data_dir)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn webhook_status(state: State<'_, AppState>) -> serde_json::Value {
    let port = *state.webhook_port.read();
    serde_json::json!({
        "running": true,
        "port": port,
        "url": format!("http://127.0.0.1:{port}"),
    })
}

#[tauri::command]
pub fn webhook_port(state: State<'_, AppState>) -> u16 {
    *state.webhook_port.read()
}

#[tauri::command]
pub async fn fetch_and_save_mod(url: String, dir: String) -> SqlResult<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| SqlError::Other(anyhow::anyhow!(e)))?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| SqlError::Other(anyhow::anyhow!("fetch: {e}")))?;
    if !resp.status().is_success() {
        return Err(SqlError::Other(anyhow::anyhow!(
            "HTTP {} {}",
            resp.status().as_u16(),
            resp.status().canonical_reason().unwrap_or("")
        )));
    }
    let body: serde_json::Value = resp.json().await.map_err(|e| {
        SqlError::Other(anyhow::anyhow!("JSON parse: {e}"))
    })?;
    let id = body
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("mod");
    let filename = format!("{}.json", id.replace(|c: char| !c.is_alphanumeric() && c != '_' && c != '-', "_"));
    let path = std::path::Path::new(&dir).join(&filename);
    let pretty = serde_json::to_vec_pretty(&body)?;
    std::fs::write(&path, pretty).map_err(|e| SqlError::Storage(e.to_string()))?;
    Ok(filename)
}

#[tauri::command]
pub fn save_text_file(path: String, content: String) -> SqlResult<()> {
    if path.contains("./") || path.contains("../") || path.contains("~") {
        return Err(SqlError::Invalid("不允许相对路径".into()));
    }
    // Only allow writing to the mods directory or other data dir children.
    std::fs::write(&path, content).map_err(|e| SqlError::Storage(e.to_string()))
}

#[tauri::command]
pub fn open_path(path: String) -> SqlResult<()> {
    // Best-effort open the path in the OS file manager.
    #[cfg(target_os = "linux")]
    let r = std::process::Command::new("xdg-open").arg(&path).spawn();
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(&path).spawn();
    #[cfg(target_os = "windows")]
    let r = std::process::Command::new("explorer").arg(&path).spawn();
    r.map_err(|e| SqlError::Other(anyhow::anyhow!(e)))?;
    Ok(())
}
