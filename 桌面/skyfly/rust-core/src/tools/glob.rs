//! Glob tool implementation
//! Search files using pattern matching

use crate::tools::types::ToolArgs;
use crate::tools::types::{Tool, ToolResult, ToolMetadata, ParameterDef};
use anyhow::Result;
use std::path::Path;
use std::fs;

pub struct GlobTool;

impl GlobTool {
    pub fn new() -> Self {
        GlobTool
    }

    fn glob_pattern_to_regex(&self, pattern: &str) -> Result<regex::Regex> {
        // Convert glob pattern to regex
        let regex_str = regex::escape(pattern)
            .replace(r"\*", ".*")
            .replace(r"\?", ".")
            .replace(r"\[\[", "[")
            .replace(r"\]\]", "]");

        Ok(regex::Regex::new(&format!("^{}$", regex_str)).context("Invalid glob pattern")?)
    }

    fn is_match(&self, path: &Path, pattern: &str) -> bool {
        let path_str = path.to_string_lossy();
        self.glob_pattern_to_regex(pattern)
            .map(|r| r.is_match(&path_str))
            .unwrap_or(false)
    }
}

#[async_trait::async_trait]
impl Tool for GlobTool {
    fn name(&self) -> &str {
        "glob"
    }

    fn description(&self) -> &str {
        "Search files using glob pattern matching (supports *, ?, [])"
    }

    fn parameters(&self) -> Vec<ParameterDef> {
        vec![
            ParameterDef::new("pattern", "string", "Glob pattern to search (e.g., '*.txt', 'src/**/*.rs')"),
            ParameterDef::optional("path", "string", "Search directory (default: current directory)"),
            ParameterDef::optional("recursive", "boolean", "Search recursively (default: true)"),
            ParameterDef::optional("extensions", "string", "Comma-separated file extensions to filter (e.g., 'txt,md')"),
        ]
    }

    async fn execute(&self, args: &ToolArgs) -> anyhow::Result<ToolResult> {
        let start = std::time::Instant::now();

        // Extract parameters
        let pattern = args.get_string("pattern")?;
        let search_dir = args.working_dir.clone().unwrap_or_else(|| ".".to_string());
        let recursive = args
            .get("recursive")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let extensions_str = args.get("extensions").and_then(|v| v.as_str());

        tracing::info!("Glob search: pattern={}, dir={}, recursive={}", pattern, search_dir, recursive);

        // Parse extensions filter
        let extensions_filter: Option<Vec<String>> = extensions_str
            .map(|s| s.split(',').map(|e| e.trim().to_string()).collect());

        // Perform glob search
        let mut results: Vec<SearchResult> = Vec::new();

        let base_path = std::path::PathBuf::from(&search_dir);

        if recursive {
            for entry in walkdir::WalkDir::new(&base_path)
                .follow_links(true)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file())
            {
                if self.is_match(&entry.path(), &pattern) {
                    let path_str = entry.path().to_string_lossy().to_string();
                    if let Some(exts) = &extensions_filter {
                        if let Some(ext) = entry.path().extension().and_then(|e| e.to_str()) {
                            if !exts.contains(&ext.to_string()) {
                                continue;
                            }
                        }
                    }

                    results.push(SearchResult {
                        path: path_str,
                        file_type: "file".to_string(),
                    });
                }
            }
        } else {
            for entry in fs::read_dir(&base_path)? {
                let entry = entry?;
                let path = entry.path();

                if path.is_file() {
                    if self.is_match(&path, &pattern) {
                        let path_str = path.to_string_lossy().to_string();
                        if let Some(exts) = &extensions_filter {
                            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                                if !exts.contains(&ext.to_string()) {
                                    continue;
                                }
                            }
                        }

                        results.push(SearchResult {
                            path: path_str,
                            file_type: "file".to_string(),
                        });
                    }
                }
            }
        }

        // Sort results
        results.sort_by(|a, b| a.path.cmp(&b.path));

        let results_json = serde_json::to_string(&results)?;

        let elapsed = start.elapsed().as_millis();

        tracing::info!(
            "Glob search completed: {} results in {}ms",
            results.len(),
            elapsed
        );

        Ok(ToolResult {
            success: true,
            output: results_json,
            error: None,
            metadata: ToolMetadata {
                execution_time_ms: elapsed,
                tool_name: self.name().to_string(),
                parameters: serde_json::json!({
                    "pattern": pattern,
                    "path": search_dir,
                    "recursive": recursive,
                    "extensions": extensions_filter
                }),
            },
        })
    }
}

#[derive(Debug, serde::Serialize)]
struct SearchResult {
    path: String,
    file_type: String,
}