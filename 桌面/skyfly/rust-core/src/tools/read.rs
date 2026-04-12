//! Read tool implementation
//! Read file contents safely

use crate::tools::types::ToolArgs;
use crate::tools::types::{Tool, ToolResult, ToolMetadata, ParameterDef};
use anyhow::{Context, Result};
use std::fs;

pub struct ReadTool;

impl ReadTool {
    pub fn new() -> Self {
        ReadTool
    }
}

#[async_trait::async_trait]
impl Tool for ReadTool {
    fn name(&self) -> &str {
        "read"
    }

    fn description(&self) -> &str {
        "Read file contents safely with encoding detection"
    }

    fn parameters(&self) -> Vec<ParameterDef> {
        vec![
            ParameterDef::new("path", "string", "Path to the file to read"),
        ]
    }

    async fn execute(&self, args: &ToolArgs) -> anyhow::Result<ToolResult> {
        let start = std::time::Instant::now();

        // Extract parameters
        let path = args.get_string("path")?;
        let working_dir = args.working_dir.clone();

        // Resolve full path
        let full_path = if let Some(dir) = working_dir {
            std::path::Path::new(&dir).join(&path)
        } else {
            std::path::PathBuf::from(&path)
        };

        tracing::info!("Reading file: {}", full_path.display());

        // Check if file exists
        if !full_path.exists() {
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some(format!("File not found: {}", path)),
                metadata: ToolMetadata {
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    tool_name: self.name().to_string(),
                    parameters: serde_json::json!({ "path": path, "working_dir": working_dir }),
                },
            });
        }

        // Read file content
        let content = fs::read_to_string(&full_path)
            .map_err(|e| anyhow::anyhow!("Failed to read file: {}: {}", path, e))?;

        let lines = content.lines().count();
        let size = content.len();

        let elapsed = start.elapsed().as_millis();

        tracing::info!(
            "File read successfully: {} lines, {} bytes in {}ms",
            lines,
            size,
            elapsed
        );

        Ok(ToolResult {
            success: true,
            output: content,
            error: None,
            metadata: ToolMetadata {
                execution_time_ms: elapsed,
                tool_name: self.name().to_string(),
                parameters: serde_json::json!({
                    "path": path,
                    "working_dir": working_dir,
                    "lines": lines,
                    "size_bytes": size
                }),
            },
        })
    }
}