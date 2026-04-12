//! Edit tool implementation
//! Edit file contents with line-based operations

use crate::tools::types::ToolArgs;
use crate::tools::types::{Tool, ToolResult, ToolMetadata, ParameterDef};
use anyhow::Result;
use std::fs;
use std::path::Path;

pub enum EditOperation {
    Replace { old_line: String, new_line: String },
    Delete { line_number: usize },
    Insert { line_number: usize, new_line: String },
}

pub struct EditTool;

impl EditTool {
    pub fn new() -> Self {
        EditTool
    }

    fn parse_edit_operations(&self, operations: &str) -> Result<Vec<EditOperation>> {
        let mut result = Vec::new();

        for line in operations.lines() {
            if line.is_empty() || line.starts_with('#') {
                continue;
            }

            if line.starts_with("replace ") {
                let parts: Vec<&str> = line[8..].split("->").collect();
                if parts.len() != 2 {
                    return Err(anyhow::anyhow!("Invalid replace syntax. Expected: replace old->new"));
                }
                result.push(EditOperation::Replace {
                    old_line: parts[0].trim().to_string(),
                    new_line: parts[1].trim().to_string(),
                });
            } else if line.starts_with("delete ") {
                let line_num: usize = line[7..]
                    .trim()
                    .parse()
                    .map_err(|e| anyhow::anyhow!("Invalid line number for delete: {}", e))?;
                result.push(EditOperation::Delete { line_number: line_num });
            } else if line.starts_with("insert ") {
                let parts: Vec<&str> = line[7..].splitn(2, ' ').collect();
                if parts.len() != 2 {
                    return Err(anyhow::anyhow!(
                        "Invalid insert syntax. Expected: insert <line> <content>"
                    ));
                }
                let line_num: usize = parts[0]
                    .trim()
                    .parse()
                    .map_err(|e| anyhow::anyhow!("Invalid line number for insert: {}", e))?;
                let content = parts[1].trim().to_string();
                result.push(EditOperation::Insert {
                    line_number: line_num,
                    new_line: content,
                });
            } else {
                return Err(anyhow::anyhow!("Unknown edit operation: {}", line));
            }
        }

        Ok(result)
    }

    fn apply_edit_operations(&self, content: &str, operations: &[EditOperation]) -> Result<String> {
        let lines: Vec<String> = content.lines().collect();
        let mut new_lines = lines.clone();
        let mut processed = std::collections::HashSet::new();

        for operation in operations {
            match operation {
                EditOperation::Delete { line_number } => {
                    if let Some(idx) = line_number.checked_sub(1) {
                        if idx < new_lines.len() {
                            new_lines.remove(idx);
                        }
                    }
                }
                EditOperation::Insert { line_number, new_line } => {
                    let idx = line_number.checked_sub(1);
                    if let Some(i) = idx {
                        if i <= new_lines.len() {
                            new_lines.insert(i, new_line.clone());
                        }
                    }
                }
                EditOperation::Replace { old_line, new_line } => {
                    for (i, line) in new_lines.iter_mut().enumerate() {
                        if *line == *old_line {
                            *line = new_line.clone();
                            break;
                        }
                    }
                }
            }
        }

        Ok(new_lines.join("\n"))
    }
}

#[async_trait::async_trait]
impl Tool for EditTool {
    fn name(&self) -> &str {
        "edit"
    }

    fn description(&self) -> &str {
        "Edit file contents with line-based operations: replace old->new, delete <line>, insert <line> <content>"
    }

    fn parameters(&self) -> Vec<ParameterDef> {
        vec![
            ParameterDef::new("path", "string", "Path to the file to edit"),
            ParameterDef::new("operations", "string", "Edit operations in format: replace old->new\\ndelete <line>\\ninsert <line> <content>"),
        ]
    }

    async fn execute(&self, args: &ToolArgs) -> anyhow::Result<ToolResult> {
        let start = std::time::Instant::now();

        // Extract parameters
        let path = args.get_string("path")?;
        let operations_str = args.get_string("operations")?;
        let working_dir = args.working_dir.clone();

        // Resolve full path
        let full_path = if let Some(dir) = working_dir {
            std::path::Path::new(&dir).join(&path)
        } else {
            std::path::PathBuf::from(&path)
        };

        tracing::info!("Editing file: {}", full_path.display());

        // Read current file content
        let content = fs::read_to_string(&full_path)
            .map_err(|e| anyhow::anyhow!("Failed to read file: {}: {}", path, e))?;

        // Parse and apply operations
        let operations = self.parse_edit_operations(&operations_str)?;

        let new_content = self.apply_edit_operations(&content, &operations)?;

        // Write back to file
        fs::write(&full_path, new_content)
            .map_err(|e| anyhow::anyhow!("Failed to write file: {}: {}", path, e))?;

        let operations_count = operations.len();
        let elapsed = start.elapsed().as_millis();

        tracing::info!(
            "File edited successfully: {} operations in {}ms",
            operations_count,
            elapsed
        );

        Ok(ToolResult {
            success: true,
            output: format!("Successfully applied {} edit operations", operations_count),
            error: None,
            metadata: ToolMetadata {
                execution_time_ms: elapsed,
                tool_name: self.name().to_string(),
                parameters: serde_json::json!({
                    "path": path,
                    "working_dir": working_dir,
                    "operations": operations_count,
                    "operations_details": operations
                }),
            },
        })
    }
}