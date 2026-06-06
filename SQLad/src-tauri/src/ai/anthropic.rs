use crate::core::{
    error::{SqlError, SqlResult},
    traits::AIProvider,
    types::{ChatMessage, ChatReply, ChatRequest, ChatRole, ToolCall},
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Anthropic Messages API provider. Default base URL: https://api.anthropic.com
pub struct AnthropicProvider {
    id: String,
    display: String,
    base_url: String,
    api_key: String,
    default_model: String,
    client: reqwest::Client,
}

impl AnthropicProvider {
    pub fn new(
        id: impl Into<String>,
        display: impl Into<String>,
        base_url: impl Into<String>,
        api_key: impl Into<String>,
        default_model: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            display: display.into(),
            base_url: base_url.into(),
            api_key: api_key.into(),
            default_model: default_model.into(),
            client: reqwest::Client::new(),
        }
    }
}

#[derive(Serialize)]
struct Req<'a> {
    model: &'a str,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    messages: Vec<AMsg>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tools: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Serialize)]
struct AMsg {
    role: String,
    content: Value,
}

#[derive(Deserialize)]
struct Resp {
    #[serde(default)]
    content: Vec<Block>,
    #[serde(default)]
    stop_reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum Block {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    /// Newer model variant; we treat as plain text.
    #[serde(other)]
    Other,
}

#[async_trait]
impl AIProvider for AnthropicProvider {
    fn id(&self) -> &str {
        &self.id
    }
    fn display_name(&self) -> &str {
        &self.display
    }

    async fn chat(&self, req: ChatRequest) -> SqlResult<ChatReply> {
        if self.api_key.is_empty() {
            return Err(SqlError::Ai(format!(
                "Anthropic provider '{}' 没有 API key",
                self.display
            )));
        }

        let model = req
            .model
            .as_deref()
            .unwrap_or(&self.default_model)
            .to_string();

        // Anthropic takes `system` as a top-level string, not a message.
        let mut system: Option<String> = None;
        let mut conv: Vec<&ChatMessage> = Vec::new();
        for m in &req.messages {
            match m.role {
                ChatRole::System => {
                    let prev = system.unwrap_or_default();
                    system = Some(if prev.is_empty() {
                        m.content.clone()
                    } else {
                        format!("{prev}\n\n{}", m.content)
                    });
                }
                _ => conv.push(m),
            }
        }

        let messages = convert_messages(&conv);
        let tools: Vec<Value> = req
            .tools
            .iter()
            .map(|t| {
                json!({
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.parameters,
                })
            })
            .collect();

        let body = Req {
            model: &model,
            max_tokens: 4096,
            system,
            messages,
            tools,
            temperature: req.temperature,
        };

        let url = format!("{}/v1/messages", self.base_url.trim_end_matches('/'));
        let resp = self
            .client
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| SqlError::Ai(e.to_string()))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(SqlError::Ai(format!("anthropic {status}: {text}")));
        }
        let parsed: Resp = resp.json().await.map_err(|e| SqlError::Ai(e.to_string()))?;
        let mut text = String::new();
        let mut tool_calls = Vec::new();
        for b in parsed.content {
            match b {
                Block::Text { text: t } => {
                    if !text.is_empty() {
                        text.push('\n');
                    }
                    text.push_str(&t);
                }
                Block::ToolUse { id, name, input } => {
                    tool_calls.push(ToolCall {
                        id,
                        name,
                        arguments: input,
                    });
                }
                Block::Other => {}
            }
        }
        Ok(ChatReply {
            message: ChatMessage {
                role: ChatRole::Assistant,
                content: text,
                tool_call_id: None,
                tool_calls,
            },
            finish_reason: parsed.stop_reason,
        })
    }
}

/// Anthropic messages must alternate user/assistant. Tool results go as
/// tool_result blocks inside a user message that follows the assistant's
/// tool_use turn. We rebuild content blocks accordingly.
fn convert_messages(history: &[&ChatMessage]) -> Vec<AMsg> {
    let mut out: Vec<AMsg> = Vec::new();
    let mut pending_tool_results: Vec<Value> = Vec::new();

    let flush_tool_results = |out: &mut Vec<AMsg>, buf: &mut Vec<Value>| {
        if !buf.is_empty() {
            out.push(AMsg {
                role: "user".into(),
                content: Value::Array(std::mem::take(buf)),
            });
        }
    };

    for m in history {
        match m.role {
            ChatRole::Tool => {
                pending_tool_results.push(json!({
                    "type": "tool_result",
                    "tool_use_id": m.tool_call_id.clone().unwrap_or_default(),
                    "content": m.content.clone(),
                }));
            }
            ChatRole::User => {
                flush_tool_results(&mut out, &mut pending_tool_results);
                out.push(AMsg {
                    role: "user".into(),
                    content: Value::String(m.content.clone()),
                });
            }
            ChatRole::Assistant => {
                flush_tool_results(&mut out, &mut pending_tool_results);
                let mut blocks: Vec<Value> = Vec::new();
                if !m.content.is_empty() {
                    blocks.push(json!({ "type": "text", "text": m.content.clone() }));
                }
                for tc in &m.tool_calls {
                    blocks.push(json!({
                        "type": "tool_use",
                        "id": tc.id,
                        "name": tc.name,
                        "input": tc.arguments,
                    }));
                }
                if blocks.is_empty() {
                    blocks.push(json!({ "type": "text", "text": "" }));
                }
                out.push(AMsg {
                    role: "assistant".into(),
                    content: Value::Array(blocks),
                });
            }
            ChatRole::System => {} // handled upstream
        }
    }
    flush_tool_results(&mut out, &mut pending_tool_results);
    out
}
