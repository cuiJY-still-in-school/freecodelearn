use crate::core::{
    error::{SqlError, SqlResult},
    traits::Tool,
    types::ToolSpec,
};
use crate::credentials::CredentialStore;
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;

/// AI-callable HTTP fetch. Lets the assistant pull data from external APIs
/// (REST, JSON, plain text). Returns status, headers (subset), text body,
/// and a parsed JSON if content-type is JSON-ish.
///
/// If the `credential` argument is given, the value is looked up in the
/// CredentialStore and applied per its `scheme` (bearer / header:Name /
/// query:param). The AI never sees the secret value.
pub struct FetchUrlTool {
    client: reqwest::Client,
    creds: Arc<CredentialStore>,
}

impl FetchUrlTool {
    pub fn new(creds: Arc<CredentialStore>) -> Self {
        let client = reqwest::Client::builder()
            .user_agent("SQLad/0.1")
            .timeout(std::time::Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self { client, creds }
    }
}

#[async_trait]
impl Tool for FetchUrlTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "fetch_url".into(),
            description:
                "向 HTTP(S) URL 发请求。GET/POST/PUT/PATCH/DELETE/HEAD。\
                 返回 {status, headers, body, json}。json 只在 Content-Type 是 JSON 时填。\
                 **认证**：传 `credential` 参数引用一个已保存凭证的名字，后端会按它的 scheme 自动加 Authorization / X-API-Key / 等。\
                 你看不到 token 本身——只能引用名字。"
                    .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "url": { "type": "string", "description": "完整 URL，含 https://" },
                    "method": {
                        "type": "string",
                        "enum": ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"],
                        "description": "默认 GET"
                    },
                    "headers": {
                        "type": "object",
                        "additionalProperties": { "type": "string" }
                    },
                    "body": {
                        "description": "字符串原样发送，对象自动 JSON 化"
                    },
                    "credential": {
                        "type": "string",
                        "description": "凭证名（用 list_credentials 看可用名）。后端按 scheme 自动附加认证。"
                    },
                    "max_body_chars": {
                        "type": "number",
                        "description": "响应 body 最大字符（默认 64K）"
                    }
                },
                "required": ["url"]
            }),
        }
    }

    async fn invoke(&self, args: Value) -> SqlResult<Value> {
        let mut url = args
            .get("url")
            .and_then(Value::as_str)
            .ok_or_else(|| SqlError::Tool {
                name: "fetch_url".into(),
                message: "缺少 url".into(),
            })?
            .to_string();
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Err(SqlError::Tool {
                name: "fetch_url".into(),
                message: "url 必须是 http:// 或 https:// 开头".into(),
            });
        }
        let method_s = args
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or("GET")
            .to_uppercase();
        let method = reqwest::Method::from_bytes(method_s.as_bytes()).map_err(|_| {
            SqlError::Tool {
                name: "fetch_url".into(),
                message: format!("无效的 method: {method_s}"),
            }
        })?;

        // Resolve credential injection ahead of building the request so we
        // can mutate url / collect extra headers.
        let mut auth_headers: Vec<(String, String)> = Vec::new();
        if let Some(name) = args.get("credential").and_then(Value::as_str) {
            let cred = self.creds.get(name).ok_or_else(|| SqlError::Tool {
                name: "fetch_url".into(),
                message: format!("凭证 '{name}' 不存在；先用 save_credential 保存"),
            })?;
            let scheme = cred.scheme.as_str();
            if scheme == "bearer" {
                auth_headers.push(("authorization".into(), format!("Bearer {}", cred.value)));
            } else if let Some(rest) = scheme.strip_prefix("header:") {
                auth_headers.push((rest.to_string(), cred.value.clone()));
            } else if let Some(param) = scheme.strip_prefix("query:") {
                let sep = if url.contains('?') { '&' } else { '?' };
                url.push(sep);
                url.push_str(param);
                url.push('=');
                url.push_str(
                    &urlencoding_encode(&cred.value)
                );
            } else {
                return Err(SqlError::Tool {
                    name: "fetch_url".into(),
                    message: format!("未知 scheme: {scheme}"),
                });
            }
        }

        let mut req = self.client.request(method, &url);
        if let Some(headers) = args.get("headers").and_then(Value::as_object) {
            for (k, v) in headers {
                if let Some(s) = v.as_str() {
                    req = req.header(k, s);
                }
            }
        }
        for (k, v) in &auth_headers {
            req = req.header(k.as_str(), v.as_str());
        }
        if let Some(body) = args.get("body") {
            match body {
                Value::String(s) => req = req.body(s.clone()),
                Value::Null => {}
                other => {
                    req = req
                        .header("content-type", "application/json")
                        .body(other.to_string());
                }
            }
        }

        let resp = req.send().await.map_err(|e| SqlError::Tool {
            name: "fetch_url".into(),
            message: e.to_string(),
        })?;
        let status = resp.status().as_u16();
        let mut headers_out = serde_json::Map::new();
        for (k, v) in resp.headers() {
            if let Ok(s) = v.to_str() {
                headers_out.insert(k.to_string(), Value::String(s.to_string()));
            }
        }
        let content_type = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let text = resp.text().await.map_err(|e| SqlError::Tool {
            name: "fetch_url".into(),
            message: e.to_string(),
        })?;
        let max_chars = args
            .get("max_body_chars")
            .and_then(Value::as_u64)
            .map(|n| n as usize)
            .unwrap_or(65_536);
        let truncated = text.chars().count() > max_chars;
        let body_str: String = if truncated {
            text.chars().take(max_chars).collect()
        } else {
            text.clone()
        };
        let json_val = if content_type.contains("json") {
            serde_json::from_str::<Value>(&text).ok()
        } else {
            None
        };

        Ok(json!({
            "status": status,
            "headers": headers_out,
            "content_type": content_type,
            "body": body_str,
            "truncated": truncated,
            "json": json_val,
        }))
    }
}

/// Minimal URL encoder — enough for typical token values.
fn urlencoding_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}
