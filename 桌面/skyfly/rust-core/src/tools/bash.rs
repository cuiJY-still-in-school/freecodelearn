//! Bash tool implementation
//! Executes shell commands safely

use crate::tools::types::ToolArgs;
use crate::tools::types::{Tool, ToolResult, ToolMetadata, ParameterDef};
use anyhow::Result;
use tokio::process::{Command, Child};
use tokio::time::Duration;

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

        // Extract parameters
        let command = args.get_string("command")?;
        let timeout = args
            .get("timeout")
            .and_then(|v| v.as_u64())
            .unwrap_or(60);
        let working_dir = args.working_dir.clone();

        tracing::info!("Executing bash command: {}", command);

        // Spawn command
        let mut child = if let Some(dir) = working_dir {
            Command::new("sh")
                .arg("-c")
                .arg(&command)
                .current_dir(dir)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| anyhow::anyhow!("Failed to spawn command: {}", e))?
        } else {
            Command::new("sh")
                .arg("-c")
                .arg(&command)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| anyhow::anyhow!("Failed to spawn command: {}", e))?
        };

        // Wait for result with timeout
        let result = tokio::time::timeout(Duration::from_secs(timeout), async {
            let status = child.wait().await?;
            let stdout = child.stdout.take();
            let stderr = child.stderr.take();
            Ok((status, stdout, stderr))
        }).await;

        match result {
            Ok(Ok((status, mut stdout_opt, mut stderr_opt))) => {
                // Read stdout if available
                let stdout_output = if let Some(ref mut stdout) = stdout_opt {
                    use tokio::io::AsyncReadExt;
                    let mut buf = Vec::new();
                    stdout.read_to_end(&mut buf).await?;
                    String::from_utf8_lossy(&buf).to_string()
                } else {
                    String::new()
                };

                // Read stderr if available
                let stderr_output = if let Some(ref mut stderr) = stderr_opt {
                    use tokio::io::AsyncReadExt;
                    let mut buf = Vec::new();
                    stderr.read_to_end(&mut buf).await?;
                    String::from_utf8_lossy(&buf).to_string()
                } else {
                    String::new()
                };

                let output = if status.success() {
                    stdout_output
                } else {
                    format!("Command failed with exit code: {}\nError: {}", 
                        status.code().unwrap_or(-1), stderr_output)
                };

                let elapsed = start.elapsed().as_millis();

                tracing::info!("Command completed in {}ms with status: {}", elapsed, status.code().unwrap_or(-1));

                Ok(ToolResult {
                    success: status.success(),
                    output,
                    error: if status.success() { None } else { Some(format!("Exit code: {}", status.code().unwrap_or(-1))) },
                    metadata: ToolMetadata {
                        execution_time_ms: elapsed,
                        tool_name: self.name().to_string(),
                        parameters: serde_json::json!({
                            "command": command,
                            "timeout": timeout,
                            "working_dir": working_dir
                        }),
                    },
                })
            }
            Ok(Err(e)) => {
                anyhow::bail!("Command execution failed: {}", e)
            }
            Err(_) => {
                anyhow::bail!("Command timed out after {} seconds", timeout)
            }
        }
    }
}