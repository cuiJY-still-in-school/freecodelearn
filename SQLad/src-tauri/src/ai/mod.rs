pub mod anthropic;
pub mod ollama;
pub mod openai;

pub use anthropic::AnthropicProvider;
pub use ollama::OllamaProvider;
pub use openai::OpenAiProvider;

use crate::core::traits::AIProvider;
use std::sync::Arc;

/// Wire protocol the user wants to speak with this endpoint.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    /// OpenAI-compatible /v1/chat/completions (works for OpenAI, MiniMax, vLLM, OpenRouter, Together, Groq, Ollama OAI-bridge…)
    Openai,
    /// Anthropic Messages API (/v1/messages)
    Anthropic,
    /// Ollama native /api/chat (supports tool calls without the OAI bridge)
    Ollama,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub protocol: Protocol,
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    pub model: String,
}

pub fn build_provider(cfg: &ProviderConfig) -> Arc<dyn AIProvider> {
    match cfg.protocol {
        Protocol::Openai => Arc::new(OpenAiProvider::new(
            &cfg.id, &cfg.name, &cfg.base_url, &cfg.api_key, &cfg.model,
        )),
        Protocol::Anthropic => Arc::new(AnthropicProvider::new(
            &cfg.id, &cfg.name, &cfg.base_url, &cfg.api_key, &cfg.model,
        )),
        Protocol::Ollama => Arc::new(OllamaProvider::new(
            &cfg.id, &cfg.name, &cfg.base_url, &cfg.model,
        )),
    }
}
