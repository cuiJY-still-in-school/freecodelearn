//! Write tool implementation
//! Write file contents safely with backup

use crate::tools::types::ToolArgs;
use crate::tools::types::{Tool, ToolResult, ToolMetadata, ParameterDef};
use anyhow::Result;
use std::fs;
use std::path::Path;

pub struct WriteTool;

impl WriteTool {
    pub fn new() -> Self {
        WriteTool
    }

    fn create_backup(&self, path: &Path) -> Result<()> {
        let mut backup_path = path.to_path_buf();
        backup_path.set_extension(format!("bak{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs()));

        fs::copy(path, &backup_path)
            .map_err(|e| anyhow::anyhow!("Failed to create backup: {}: {}", backup_path.display(), e))?;

        tracing::info!("Created backup: {}", backup_path.display());
        Ok(())
    }
}

#[async_trait::async_trait]
impl Tool for WriteTool {
    fn name(&self) -> &str {
        "write"
    }

    fn description(&self) -> &str {
        "Write file contents safely with automatic backup"
    }

    fn parameters(&self) -> Vec<ParameterDef> {
        vec![
            ParameterDef::new("path", "string", "Path to the file to write"),
            ParameterDef::new("content", "string", "Content to write to the file"),
            ParameterDef::optional("backup", "boolean", "Create backup before writing (default: true)"),
        ]
    }

    async fn execute(&self, args: &ToolArgs) -> anyhow::Result<ToolResult> {
        let start = std::time::Instant::now();

        // Extract parameters
        let path = args.get_string("path")?;
        let content = args.get_string("content")?;
        let create_backup = args
            .get("backup")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let working_dir = args.working_dir.clone();

        // Resolve full path
        let full_path = if let Some(dir) = working_dir {
            std::path::Path::new(&dir).join(&path)
        } else {
            std::path::PathBuf::from(&path)
        };

        tracing::info!("Writing to file: {}", full_path.display());

        // Create parent directories if they don't exist
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| anyhow::anyhow!("Failed to create directory: {}: {}", parent.display(), e))?;
        }

        // Create backup if file exists and backup is enabled
        if create_backup && full_path.exists() {
            self.create_backup(&full_path)
                .map_err(|e| anyhow::anyhow!("Failed to create backup: {}", e))?;
        }

        // Write file content
        fs::write(&full_path, content)
            .map_err(|e| anyhow::anyhow!("Failed to write file: {}: {}", path, e))?;

        let lines = content.lines().count();
        let size = content.len();

        let elapsed = start.elapsed().as_millis();

        tracing::info!(
            "File written successfully: {} lines, {} bytes in {}ms",
            lines,
            size,
            elapsed
        );

        Ok(ToolResult {
            success: true,
            output: format!("Successfully wrote {} bytes to file", size),
            error: None,
            metadata: ToolMetadata {
                execution_time_ms: elapsed,
                tool_name: self.name().to_string(),
                parameters: serde_json::json!({
                    "path": path,
                    "working_dir": working_dir,
                    "lines": lines,
                    "size_bytes": size,
                    "backup": create_backup
                }),
            },
        })
    }
}