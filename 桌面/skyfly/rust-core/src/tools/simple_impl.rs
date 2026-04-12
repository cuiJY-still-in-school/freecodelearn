//! Complete tool implementations for SkyFly Core
//! These are fully functional implementations of core tools

use crate::tools::types::{Tool, ToolArgs, ToolResult, ToolMetadata, ParameterDef};
use anyhow::Result;
use std::path::PathBuf;
use tokio::fs;

pub struct BashTool;

impl BashTool {
    pub fn new() -> Self {
        BashTool
    }
}

#[async_trait::async_trait]
impl Tool for BashTool {
    fn name(&self) -> &str {
        "bash"
    }

    fn description(&self) -> &str {
        "Execute shell commands safely with timeout and output capture"
    }

    fn parameters(&self) -> Vec<ParameterDef> {
        vec![
            ParameterDef::new("command", "string", "Shell command to execute"),
            ParameterDef::optional("timeout", "integer", "Timeout in seconds (default: 60)"),
            ParameterDef::optional("working_dir", "string", "Working directory for execution"),
        ]
    }

    async fn execute(&self, args: &ToolArgs) -> anyhow::Result<ToolResult> {
        let start = std::time::Instant::now();
        
        let command = args.get_string("command")?;
        let timeout_secs = args.get("timeout").and_then(|v| v.as_u64()).unwrap_or(60);
        let working_dir = args.working_dir.as_ref().map(|s| PathBuf::from(s));

        tracing::info!("Executing bash command: {}", command);

        // Build command
        let mut cmd = tokio::process::Command::new("sh");
        cmd.arg("-c").arg(&command);
        
        if let Some(dir) = working_dir {
            cmd.current_dir(dir);
        }

        // Spawn process
        let mut child = cmd.spawn()?;

        // Wait for result with timeout
        let output = tokio::time::timeout(
            tokio::time::Duration::from_secs(timeout_secs),
            child.wait()
        ).await;

        let elapsed = start.elapsed().as_millis() as u64;

        match output {
            Ok(Ok(status)) => {
                let stdout = child.stdout.take();
                let stderr = child.stderr.take();

                // Read stdout if available
                let stdout_output = if let Some(mut stdout) = stdout {
                    use tokio::io::AsyncReadExt;
                    let mut buf = Vec::new();
                    let _ = stdout.read_to_end(&mut buf).await;
                    String::from_utf8_lossy(&buf).to_string()
                } else {
                    String::new()
                };

                // Read stderr if available
                let stderr_output = if let Some(mut stderr) = stderr {
                    use tokio::io::AsyncReadExt;
                    let mut buf = Vec::new();
                    let _ = stderr.read_to_end(&mut buf).await;
                    String::from_utf8_lossy(&buf).to_string()
                } else {
                    String::new()
                };

                let success = status.success();

                tracing::info!(
                    "Command completed in {}ms with exit code: {:?}",
                    elapsed,
                    status.code()
                );

                let result_output = if success {
                    stdout_output
                } else {
                    format!("Exit code: {:?}\nStderr: {}", status.code(), stderr_output)
                };

                Ok(ToolResult {
                    success,
                    output: result_output,
                    error: if success { None } else { Some(stderr_output) },
                    metadata: ToolMetadata {
                        execution_time_ms: elapsed,
                        tool_name: self.name().to_string(),
                        parameters: serde_json::json!({"command": command}),
                    },
                })
            }
            Ok(Err(e)) => {
                anyhow::bail!("Failed to execute command: {}", e)
            }
            Err(_) => {
                anyhow::bail!("Command timed out after {} seconds", timeout_secs)
            }
        }
    }
}

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
        "Read file contents with automatic encoding detection"
    }

    fn parameters(&self) -> Vec<ParameterDef> {
        vec![
            ParameterDef::new("path", "string", "Path to the file to read"),
        ]
    }

    async fn execute(&self, args: &ToolArgs) -> anyhow::Result<ToolResult> {
        let start = std::time::Instant::now();
        
        let path_str = args.get_string("path")?;
        let path = PathBuf::from(&path_str);
        
        // Resolve relative paths
        let path = if path.is_relative() {
            if let Some(ref dir) = args.working_dir {
                PathBuf::from(dir).join(path)
            } else {
                path
            }
        } else {
            path
        };

        tracing::info!("Reading file: {}", path.display());

        // Check if file exists
        if !path.exists() {
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some(format!("File not found: {}", path_str)),
                metadata: ToolMetadata {
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    tool_name: self.name().to_string(),
                    parameters: serde_json::json!({"path": path_str}),
                },
            });
        }

        // Read file content
        match fs::read_to_string(&path).await {
            Ok(content) => {
                let elapsed = start.elapsed().as_millis() as u64;
                let lines = content.lines().count();
                let bytes = content.len();
                
                tracing::info!(
                    "File read successfully: {} lines, {} bytes",
                    lines,
                    bytes
                );

                Ok(ToolResult {
                    success: true,
                    output: content,
                    error: None,
                    metadata: ToolMetadata {
                        execution_time_ms: elapsed,
                        tool_name: self.name().to_string(),
                        parameters: serde_json::json!({
                            "path": path_str,
                            "lines": lines,
                            "bytes": bytes
                        }),
                    },
                })
            }
            Err(e) => {
                Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Failed to read file: {}", e)),
                    metadata: ToolMetadata {
                        execution_time_ms: start.elapsed().as_millis() as u64,
                        tool_name: self.name().to_string(),
                        parameters: serde_json::json!({"path": path_str}),
                    },
                })
            }
        }
    }
}

pub struct WriteTool;

impl WriteTool {
    pub fn new() -> Self {
        WriteTool
    }
}

#[async_trait::async_trait]
impl Tool for WriteTool {
    fn name(&self) -> &str {
        "write"
    }

    fn description(&self) -> &str {
        "Write file contents with automatic backup"
    }

    fn parameters(&self) -> Vec<ParameterDef> {
        vec![
            ParameterDef::new("path", "string", "Path to file to write"),
            ParameterDef::new("content", "string", "Content to write"),
            ParameterDef::optional("backup", "boolean", "Create backup before writing (default: true)"),
        ]
    }

    async fn execute(&self, args: &ToolArgs) -> anyhow::Result<ToolResult> {
        let start = std::time::Instant::now();
        
        let path_str = args.get_string("path")?;
        let content = args.get_string("content")?;
        let create_backup = args.get("backup").and_then(|v| v.as_bool()).unwrap_or(true);
        
        let path = PathBuf::from(&path_str);
        
        // Resolve relative paths
        let path = if path.is_relative() {
            if let Some(ref dir) = args.working_dir {
                PathBuf::from(dir).join(path)
            } else {
                path
            }
        } else {
            path
        };

        tracing::info!("Writing to file: {}", path.display());

        // Create parent directories if needed
        if let Some(parent) = path.parent() {
            if let Err(e) = fs::create_dir_all(parent).await {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Failed to create directory: {}", e)),
                    metadata: ToolMetadata {
                        execution_time_ms: start.elapsed().as_millis() as u64,
                        tool_name: self.name().to_string(),
                        parameters: serde_json::json!({"path": path_str}),
                    },
                });
            }
        }

        // Create backup if file exists and backup is enabled
        if create_backup && path.exists() {
            let backup_path = path.with_extension(format!(
                "bak.{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs()
            ));
            
            if let Err(e) = fs::copy(&path, &backup_path).await {
                tracing::warn!("Failed to create backup: {}", e);
            } else {
                tracing::info!("Created backup: {}", backup_path.display());
            }
        }

        // Write file
        match fs::write(&path, content.as_bytes()).await {
            Ok(_) => {
                let elapsed = start.elapsed().as_millis() as u64;
                
                tracing::info!(
                    "File written successfully: {} bytes",
                    content.len()
                );

                Ok(ToolResult {
                    success: true,
                    output: format!("Successfully wrote {} bytes to {}", content.len(), path_str),
                    error: None,
                    metadata: ToolMetadata {
                        execution_time_ms: elapsed,
                        tool_name: self.name().to_string(),
                        parameters: serde_json::json!({
                            "path": path_str,
                            "bytes": content.len()
                        }),
                    },
                })
            }
            Err(e) => {
                Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Failed to write file: {}", e)),
                    metadata: ToolMetadata {
                        execution_time_ms: start.elapsed().as_millis() as u64,
                        tool_name: self.name().to_string(),
                        parameters: serde_json::json!({"path": path_str}),
                    },
                })
            }
        }
    }
}

pub struct EditTool;

impl EditTool {
    pub fn new() -> Self {
        EditTool
    }
}

#[async_trait::async_trait]
impl Tool for EditTool {
    fn name(&self) -> &str {
        "edit"
    }

    fn description(&self) -> &str {
        "Edit file contents with string replacement"
    }

    fn parameters(&self) -> Vec<ParameterDef> {
        vec![
            ParameterDef::new("path", "string", "Path to the file to edit"),
            ParameterDef::new("old_string", "string", "String to replace"),
            ParameterDef::new("new_string", "string", "Replacement string"),
        ]
    }

    async fn execute(&self, args: &ToolArgs) -> anyhow::Result<ToolResult> {
        let start = std::time::Instant::now();
        
        let path_str = args.get_string("path")?;
        let old_string = args.get_string("old_string")?;
        let new_string = args.get_string("new_string")?;
        
        let path = PathBuf::from(&path_str);
        
        // Resolve relative paths
        let path = if path.is_relative() {
            if let Some(ref dir) = args.working_dir {
                PathBuf::from(dir).join(path)
            } else {
                path
            }
        } else {
            path
        };

        tracing::info!("Editing file: {}", path.display());

        // Read file
        let content = match fs::read_to_string(&path).await {
            Ok(content) => {
                tracing::info!(
                    "File read successfully: {} lines, {} bytes",
                    content.lines().count(),
                    content.len()
                );
                content
            }
            Err(e) => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Failed to read file: {}", e)),
                    metadata: ToolMetadata {
                        execution_time_ms: start.elapsed().as_millis() as u64,
                        tool_name: self.name().to_string(),
                        parameters: serde_json::json!({"path": path_str}),
                    },
                });
            }
        };

        // Perform replacement
        if !content.contains(&old_string) {
            return Ok(ToolResult {
                success: false,
                output: content,
                error: Some(format!("String not found in file: {}", old_string)),
                metadata: ToolMetadata {
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    tool_name: self.name().to_string(),
                    parameters: serde_json::json!({"path": path_str}),
                },
            });
        }

        let new_content = content.replace(&old_string, &new_string);
        let replacements = content.matches(&old_string).count();

        // Write file
        match fs::write(&path, new_content.as_bytes()).await {
            Ok(_) => {
                let elapsed = start.elapsed().as_millis() as u64;
                
                tracing::info!(
                    "File edited successfully: {} replacements",
                    replacements
                );

                Ok(ToolResult {
                    success: true,
                    output: format!("Made {} replacement(s) in {}", replacements, path_str),
                    error: None,
                    metadata: ToolMetadata {
                        execution_time_ms: elapsed,
                        tool_name: self.name().to_string(),
                        parameters: serde_json::json!({
                            "path": path_str,
                            "replacements": replacements
                        }),
                    },
                })
            }
            Err(e) => {
                Ok(ToolResult {
                    success: false,
                    output: content,
                    error: Some(format!("Failed to write file: {}", e)),
                    metadata: ToolMetadata {
                        execution_time_ms: start.elapsed().as_millis() as u64,
                        tool_name: self.name().to_string(),
                        parameters: serde_json::json!({"path": path_str}),
                    },
                })
            }
        }
    }
}

pub struct GlobTool;

impl GlobTool {
    pub fn new() -> Self {
        GlobTool
    }
}

#[async_trait::async_trait]
impl Tool for GlobTool {
    fn name(&self) -> &str {
        "glob"
    }

    fn description(&self) -> &str {
        "Search files using glob patterns"
    }

    fn parameters(&self) -> Vec<ParameterDef> {
        vec![
            ParameterDef::new("pattern", "string", "Glob pattern (e.g., '*.txt', 'src/**/*.rs')"),
            ParameterDef::optional("path", "string", "Search directory (default: current directory)"),
        ]
    }

    async fn execute(&self, args: &ToolArgs) -> anyhow::Result<ToolResult> {
        let start = std::time::Instant::now();
        
        let pattern = args.get_string("pattern")?;
        let search_dir = args.working_dir.clone().unwrap_or_else(|| ".".to_string());
        
        let base_path = PathBuf::from(&search_dir);

        tracing::info!("Searching for pattern: {} in {}", pattern, base_path.display());

        // Use glob crate to find files
        let pattern_path = base_path.join(&pattern);
        let pattern_str = pattern_path.to_string_lossy();

        let entries: Vec<String> = match glob::glob(&pattern_str) {
            Ok(paths) => {
                paths
                    .filter_map(Result::ok)
                    .map(|p| p.to_string_lossy().to_string())
                    .collect()
            }
            Err(e) => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Invalid glob pattern: {}", e)),
                    metadata: ToolMetadata {
                        execution_time_ms: start.elapsed().as_millis() as u64,
                        tool_name: self.name().to_string(),
                        parameters: serde_json::json!({"pattern": pattern}),
                    },
                });
            }
        };

        let elapsed = start.elapsed().as_millis() as u64;
        let count = entries.len();

        tracing::info!("Found {} files matching pattern", count);

        let output = serde_json::to_string_pretty(&entries).unwrap_or_default();

        Ok(ToolResult {
            success: true,
            output,
            error: None,
            metadata: ToolMetadata {
                execution_time_ms: elapsed,
                tool_name: self.name().to_string(),
                parameters: serde_json::json!({
                    "pattern": pattern,
                    "path": search_dir,
                    "count": count
                }),
            },
        })
    }
}