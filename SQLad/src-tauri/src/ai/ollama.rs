use crate::core::{
    error::{SqlError, SqlResult},
    traits::AIProvider,
    types::{ChatMessage, ChatReply, ChatRequest, ChatRole, ToolCall},
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub struct OllamaProvider {
    id: String,
    display: String,
    base_url: String,
    default_model: String,
    client: reqwest::Client,
}

impl OllamaProvider {
    pub fn new(
        id: impl Into<String>,
        display: impl Into<String>,
        base_url: impl Into<String>,
        default_model: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            display: display.into(),
            base_url: base_url.into(),
            default_model: default_model.into(),
            client: reqwest::Client::new(),
        }
    }
}

#[derive(Serialize)]
struct OllamaChatReq<'a> {
    model: &'a str,
    messages: Vec<OllamaMsg>,
    stream: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tools: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    options: Option<Value>,
}

#[derive(Serialize, Deserialize)]
struct OllamaMsg {
    role: String,
    content: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    tool_calls: Vec<OllamaToolCall>,
}

#[derive(Serialize, Deserialize)]
struct OllamaToolCall {
    #[serde(default)]
    function: OllamaToolFn,
}

#[derive(Default, Serialize, Deserialize)]
struct OllamaToolFn {
    #[serde(default)]
    name: String,
    #[serde(default)]
    arguments: Value,
}

#[derive(Deserialize)]
struct OllamaChatResp {
    message: OllamaMsg,
    #[serde(default)]
    done_reason: Option<String>,
}

fn role_str(r: &ChatRole) -> &'static str {
    match r {
        ChatRole::System => "system",
        ChatRole::User => "user",
        ChatRole::Assistant => "assistant",
        ChatRole::Tool => "tool",
    }
}

#[async_trait]
impl AIProvider for OllamaProvider {
    fn id(&self) -> &str {
        &self.id
    }
    fn display_name(&self) -> &str {
        &self.display
    }

    async fn chat(&self, req: ChatRequest) -> SqlResult<ChatReply> {
        let model = req
            .model
            .as_deref()
            .unwrap_or(&self.default_model)
            .to_string();
        let messages: Vec<OllamaMsg> = req
            .messages
            .iter()
            .map(|m| OllamaMsg {
                role: role_str(&m.role).into(),
                content: m.content.clone(),
                tool_calls: vec![],
            })
            .collect();
        let tools: Vec<Value> = req
            .tools
            .iter()
            .map(|t| {
                serde_json::json!({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                    }
                })
            })
            .collect();

        let body = OllamaChatReq {
            model: &model,
            messages,
            stream: false,
            tools,
            options: req
                .temperature
                .map(|t| serde_json::json!({ "temperature": t })),
        };

        let url = format!("{}/api/chat", self.base_url.trim_end_matches('/'));
        let resp = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| SqlError::Ai(e.to_string()))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(SqlError::Ai(format!("ollama {status}: {text}")));
        }
        let parsed: OllamaChatResp = resp.json().await.map_err(|e| SqlError::Ai(e.to_string()))?;
        let tool_calls: Vec<ToolCall> = parsed
            .message
            .tool_calls
            .into_iter()
            .enumerate()
            .map(|(i, c)| ToolCall {
                id: format!("call_{i}"),
                name: c.function.name,
                arguments: c.function.arguments,
            })
            .collect();
        Ok(ChatReply {
            message: ChatMessage {
                role: ChatRole::Assistant,
                content: parsed.message.content,
                tool_call_id: None,
                tool_calls,
            },
            finish_reason: parsed.done_reason,
        })
    }
}
