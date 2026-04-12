//! Tool registry for managing available tools

use crate::tools::types::{Tool, ToolArgs, ToolResult, ParameterDef, ToolInfo, ToolParameter};
use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct ToolRegistry {
    tools: Arc<RwLock<Vec<Box<dyn Tool>>>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        ToolRegistry {
            tools: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub async fn register(&self, tool: impl Tool + 'static) {
        let name = tool.name().to_string();
        let mut tools = self.tools.write().await;
        tools.push(Box::new(tool));
        tracing::info!("Registered tool: {}", name);
    }

    pub async fn unregister(&self, tool_name: &str) {
        let mut tools = self.tools.write().await;
        tools.retain(|t| t.name() != tool_name);
        tracing::info!("Unregistered tool: {}", tool_name);
    }

    pub async fn list_all(&self) -> Vec<ToolInfo> {
        let tools = self.tools.read().await;
        tools
            .iter()
            .map(|t| ToolInfo {
                name: t.name().to_string(),
                description: t.description().to_string(),
                parameters: t.parameters()
                    .into_iter()
                    .map(|p| ToolParameter {
                        name: p.name,
                        param_type: p.param_type,
                        description: p.description,
                        required: p.required,
                        default_value: p.default_value,
                    })
                    .collect(),
            })
            .collect()
    }

    pub async fn execute(&self, args: ToolArgs) -> Result<ToolResult> {
        let tools = self.tools.read().await;
        let tool = tools
            .iter()
            .find(|t| t.name() == args.tool_name)
            .ok_or_else(|| anyhow::anyhow!("Tool '{}' not found", args.tool_name))?;

        tracing::info!("Executing tool: {} with args: {:?}", tool.name(), args.parameters);

        let result = tool.execute(&args).await?;

        if result.success {
            tracing::info!("Tool '{}' completed successfully", args.tool_name);
        } else {
            tracing::warn!("Tool '{}' failed: {:?}", args.tool_name, result.error);
        }

        Ok(result)
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}