//! Shared types for tools

use serde::{Deserialize, Serialize};
use anyhow::Result;

/// Common tool execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
    pub metadata: ToolMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolMetadata {
    pub execution_time_ms: u64,
    pub tool_name: String,
    pub parameters: serde_json::Value,
}

/// Tool trait definition
#[async_trait::async_trait]
pub trait Tool: Send + Sync {
    /// Tool name
    fn name(&self) -> &str;

    /// Tool description
    fn description(&self) -> &str;

    /// Supported parameters
    fn parameters(&self) -> Vec<ParameterDef>;

    /// Execute the tool
    async fn execute(&self, args: &ToolArgs) -> anyhow::Result<ToolResult>;
}

/// Tool parameters definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterDef {
    pub name: String,
    #[serde(rename = "type")]
    pub param_type: String,
    pub description: String,
    pub required: bool,
    pub default_value: Option<serde_json::Value>,
}

impl ParameterDef {
    pub fn new(name: impl Into<String>, param_type: impl Into<String>, description: impl Into<String>) -> Self {
        ParameterDef {
            name: name.into(),
            param_type: param_type.into(),
            description: description.into(),
            required: true,
            default_value: None,
        }
    }

    pub fn optional(name: impl Into<String>, param_type: impl Into<String>, description: impl Into<String>) -> Self {
        ParameterDef {
            name: name.into(),
            param_type: param_type.into(),
            description: description.into(),
            required: false,
            default_value: None,
        }
    }
}

/// Tool execution arguments
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolArgs {
    pub tool_name: String,
    pub parameters: std::collections::HashMap<String, serde_json::Value>,
    pub working_dir: Option<String>,
    pub timeout_seconds: Option<u64>,
}

/// Tool information for display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInfo {
    pub name: String,
    pub description: String,
    pub parameters: Vec<ToolParameter>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolParameter {
    pub name: String,
    pub param_type: String,
    pub description: String,
    pub required: bool,
    pub default_value: Option<serde_json::Value>,
}

impl ToolArgs {
    pub fn new(tool_name: impl Into<String>) -> Self {
        ToolArgs {
            tool_name: tool_name.into(),
            parameters: std::collections::HashMap::new(),
            working_dir: None,
            timeout_seconds: None,
        }
    }

    pub fn with_parameter(mut self, key: impl Into<String>, value: serde_json::Value) -> Self {
        self.parameters.insert(key.into(), value);
        self
    }

    pub fn with_working_dir(mut self, dir: impl Into<String>) -> Self {
        self.working_dir = Some(dir.into());
        self
    }

    pub fn with_timeout(mut self, timeout: u64) -> Self {
        self.timeout_seconds = Some(timeout);
        self
    }

    pub fn get(&self, key: &str) -> Option<&serde_json::Value> {
        self.parameters.get(key)
    }

    pub fn get_string(&self, key: &str) -> Result<String> {
        self.parameters.get(key)
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| anyhow::anyhow!("Parameter '{}' not found", key))
    }
}