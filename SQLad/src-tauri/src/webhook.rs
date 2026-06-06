//! Lightweight inbound webhook receiver.
//!
//! Starts an HTTP server on `localhost:8585` (configurable). External
//! services (Slack outgoing webhook, GitHub webhook, Zapier, Make, curl…)
//! can POST data into SQLad tables or trigger automation rules.
//!
//! Routes:
//!   POST /table/:name   — body = JSON object or array → insert_rows
//!   POST /trigger/:id   — evaluate the trigger (runs condition_sql, calls AI)
//!   GET  /health         — 200 { "ok": true, "tables": 3 }

use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::Json;
use serde_json::Value;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

use crate::automation::TriggerStore;
use crate::core::Registry;
use crate::credentials::CredentialStore;

#[derive(Clone)]
pub struct WebhookAppState {
    pub registry: Arc<Registry>,
    pub triggers: TriggerStore,
    pub credentials: Arc<CredentialStore>,
}

pub async fn start_server(state: WebhookAppState, port: u16) -> anyhow::Result<()> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = TcpListener::bind(addr).await.map_err(|e| {
        anyhow::anyhow!("webhook 端口 {port} 被占用: {e}")
    })?;
    let shared = Arc::new(state);
    let app = axum::Router::new()
        .route("/health", get(health))
        .route("/table/:name", post(insert_webhook))
        .route("/trigger/:id", post(trigger_webhook))
        .with_state(shared);
    tracing::info!("webhook server listening on http://{}", addr);
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health(State(state): State<Arc<WebhookAppState>>) -> Result<Json<Value>, StatusCode> {
    let storage = state
        .registry
        .storage(None)
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    let tables = storage
        .list_tables()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(serde_json::json!({
        "ok": true,
        "tables": tables.len(),
        "app": "SQLad"
    })))
}

async fn insert_webhook(
    State(state): State<Arc<WebhookAppState>>,
    Path(name): Path<String>,
    body: Bytes,
) -> Result<Json<Value>, (StatusCode, String)> {
    let storage = state
        .registry
        .storage(None)
        .ok_or((StatusCode::INTERNAL_SERVER_ERROR, "no storage".into()))?;
    let payload: Value =
        serde_json::from_slice(&body).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    // Accept either a single object or an array.
    let items: Vec<Value> = match &payload {
        Value::Array(arr) => arr.clone(),
        Value::Object(_) => vec![payload.clone()],
        _ => return Err((StatusCode::BAD_REQUEST, "body must be JSON object or array".into())),
    };
    if items.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "empty array".into()));
    }

    // Ensure the table exists; if not, auto-create from the first object's keys.
    let tables = storage
        .list_tables()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if !tables.iter().any(|t| t.name == name) {
        let first = &items[0];
        if let Value::Object(m) = first {
            let cols: Vec<crate::core::types::ColumnDef> = m
                .keys()
                .filter(|k| *k != "_id")
                .map(|k| crate::core::types::ColumnDef {
                    name: k.clone(),
                    ty: crate::core::types::ColumnType::Text,
                    nullable: true,
                    primary_key: false,
                })
                .collect();
            if cols.is_empty() {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "第一个对象没有有效列".into(),
                ));
            }
            let schema = crate::core::types::TableSchema {
                name: name.clone(),
                columns: cols,
                row_count: None,
            };
            storage
                .create_table(&schema)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        }
    }

    // Build rows in schema column order.
    let schema = storage
        .describe(&name)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let data_cols: Vec<String> = schema
        .columns
        .iter()
        .filter(|c| c.name != "_id")
        .map(|c| c.name.clone())
        .collect();
    let rows: Vec<Vec<Value>> = items
        .iter()
        .map(|item| {
            data_cols
                .iter()
                .map(|c| item.get(c).cloned().unwrap_or(Value::Null))
                .collect()
        })
        .collect();

    let inserted = storage
        .insert_rows(&name, &rows)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({ "ok": true, "table": name, "inserted": inserted })))
}

async fn trigger_webhook(
    State(state): State<Arc<WebhookAppState>>,
    Path(id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let trigger = state.triggers.get(&id).ok_or((
        StatusCode::NOT_FOUND,
        format!("trigger {id} not found"),
    ))?;
    let storage = state
        .registry
        .storage(None)
        .ok_or((StatusCode::INTERNAL_SERVER_ERROR, "no storage".into()))?;
    let lower = trigger.condition_sql.trim_start().to_ascii_lowercase();
    if !(lower.starts_with("select")
        || lower.starts_with("with")
        || lower.starts_with("pragma"))
    {
        return Err((StatusCode::BAD_REQUEST, "condition must be SELECT".into()));
    }
    let result = storage
        .query(&trigger.condition_sql)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({
        "ok": true,
        "trigger": id,
        "matched_rows": result.row_count,
        "preview": result.rows.iter().take(10).collect::<Vec<_>>(),
        "columns": result.columns,
    })))
}
