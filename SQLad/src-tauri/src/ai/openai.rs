use crate::core::{
    error::{SqlError, SqlResult},
    traits::AIProvider,
    types::{ChatMessage, ChatReply, ChatRequest, ChatRole, ToolCall},
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// OpenAI-compatible chat completions provider. Works with OpenAI, MiniMax,
/// Together, OpenRouter, Groq, vLLM, Ollama (`/v1/chat/completions`), etc.
pub struct OpenAiProvider {
    id: String,
    display: String,
    base_url: String,
    api_key: String,
    default_model: String,
    client: reqwest::Client,
}

impl OpenAiProvider {
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
    messages: Vec<Msg>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tools: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    stream: bool,
}

#[derive(Serialize, Deserialize)]
struct Msg {
    role: String,
    #[serde(default)]
    content: Value,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    tool_calls: Vec<OAIToolCall>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct OAIToolCall {
    id: String,
    #[serde(rename = "type", default = "fn_type")]
    ty: String,
    function: OAIToolFn,
}

fn fn_type() -> String {
    "function".into()
}

#[derive(Serialize, Deserialize)]
struct OAIToolFn {
    name: String,
    /// OpenAI: a JSON-encoded string.
    arguments: String,
}

#[derive(Deserialize)]
struct Choice {
    message: Msg,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Deserialize)]
struct Resp {
    choices: Vec<Choice>,
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
impl AIProvider for OpenAiProvider {
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

        let messages: Vec<Msg> = req
            .messages
            .iter()
            .map(|m| Msg {
                role: role_str(&m.role).into(),
                content: Value::String(m.content.clone()),
                tool_call_id: m.tool_call_id.clone(),
                tool_calls: m
                    .tool_calls
                    .iter()
                    .map(|tc| OAIToolCall {
                        id: tc.id.clone(),
                        ty: "function".into(),
                        function: OAIToolFn {
                            name: tc.name.clone(),
                            arguments: tc.arguments.to_string(),
                        },
                    })
                    .collect(),
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

        let body = Req {
            model: &model,
            messages,
            tools,
            temperature: req.temperature,
            stream: false,
        };

        let url = format!(
            "{}/v1/chat/completions",
            self.base_url.trim_end_matches('/')
        );
        let mut rb = self.client.post(&url).json(&body);
        if !self.api_key.is_empty() {
            rb = rb.bearer_auth(&self.api_key);
        }
        let resp = rb.send().await.map_err(|e| SqlError::Ai(e.to_string()))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(SqlError::Ai(format!("openai {status}: {text}")));
        }
        let parsed: Resp = resp.json().await.map_err(|e| SqlError::Ai(e.to_string()))?;
        let choice = parsed
            .choices
            .into_iter()
            .next()
            .ok_or_else(|| SqlError::Ai("empty choices".into()))?;
        let content = match &choice.message.content {
            Value::String(s) => s.clone(),
            Value::Null => String::new(),
            other => other.to_string(),
        };
        let tool_calls: Vec<ToolCall> = choice
            .message
            .tool_calls
            .into_iter()
            .map(|tc| {
                let args = serde_json::from_str(&tc.function.arguments).unwrap_or(Value::Null);
                ToolCall {
                    id: tc.id,
                    name: tc.function.name,
                    arguments: args,
                }
            })
            .collect();
        Ok(ChatReply {
            message: ChatMessage {
                role: ChatRole::Assistant,
                content,
                tool_call_id: None,
                tool_calls,
            },
            finish_reason: choice.finish_reason,
        })
    }
}
