//! AI Service client for Python AI service integration

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// AI service client configuration
#[derive(Debug, Clone)]
pub struct AIServiceConfig {
    pub base_url: String,
    pub timeout_secs: u64,
}

impl Default for AIServiceConfig {
    fn default() -> Self {
        Self {
            base_url: "http://localhost:8000".to_string(),
            timeout_secs: 30,
        }
    }
}

/// Task request to send to AI service
#[derive(Debug, Clone, Serialize)]
pub struct TaskRequest {
    pub user_input: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<HashMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

/// Tool call from AI service response
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ToolCall {
    pub tool_name: String,
    pub parameters: HashMap<String, serde_json::Value>,
}

/// Task response from AI service
#[derive(Debug, Clone, Deserialize)]
pub struct TaskResponse {
    pub success: bool,
    pub reasoning: String,
    pub tool_calls: Vec<ToolCall>,
    #[serde(default)]
    pub requires_confirmation: bool,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<HashMap<String, serde_json::Value>>,
}

/// Health check response
#[derive(Debug, Clone, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
    pub version: String,
    pub ai_components: AIComponentsStatus,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AIComponentsStatus {
    pub llm: bool,
    pub planner: bool,
    pub experience_manager: bool,
}

/// AI service client
pub struct AIServiceClient {
    client: reqwest::Client,
    config: AIServiceConfig,
}

impl AIServiceClient {
    /// Create a new AI service client with default configuration
    pub fn new() -> Self {
        Self::with_config(AIServiceConfig::default())
    }

    /// Create a new AI service client with custom configuration
    pub fn with_config(config: AIServiceConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(config.timeout_secs))
            .build()
            .expect("Failed to create HTTP client");

        Self { client, config }
    }

    /// Check if the AI service is healthy
    pub async fn health_check(&self) -> Result<HealthResponse> {
        let url = format!("{}/health", self.config.base_url);
        let response = self.client.get(&url).send().await?;
        response.json().await.map_err(Into::into)
    }

    /// Process a task and get tool calls
    pub async fn process_task(&self, request: TaskRequest) -> Result<TaskResponse> {
        let url = format!("{}/process", self.config.base_url);
        let response = self.client.post(&url).json(&request).send().await?;
        
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("AI service returned error {}: {}", status, error_text);
        }
        
        response.json().await.map_err(Into::into)
    }

    /// Convert tool calls from AI service to our internal ToolArgs
    pub fn tool_call_to_args(&self, tool_call: &ToolCall) -> crate::tools::ToolArgs {
        let mut args = crate::tools::ToolArgs::new(&tool_call.tool_name);
        for (key, value) in &tool_call.parameters {
            args = args.with_parameter(key, value.clone());
        }
        args
    }
}

impl Default for AIServiceClient {
    fn default() -> Self {
        Self::new()
    }
}
