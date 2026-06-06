use crate::core::{
    error::{SqlError, SqlResult},
    traits::Tool,
    types::ToolSpec,
};
use async_trait::async_trait;
use serde_json::{json, Value};

/// AI tool: ask the OS to open a URL in the user's default browser.
/// Used during OAuth Device Flow so the user can visit the verification page
/// without copy-pasting links.
pub struct OpenUrlTool;

#[async_trait]
impl Tool for OpenUrlTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "open_url".into(),
            description:
                "用用户系统的默认浏览器打开一个 URL。常用场景：引导用户去 OAuth 授权页（如 https://github.com/login/device），用户在浏览器完成后回到 SQLad 继续。"
                    .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "url": { "type": "string" }
                },
                "required": ["url"]
            }),
        }
    }

    async fn invoke(&self, args: Value) -> SqlResult<Value> {
        let url = args
            .get("url")
            .and_then(Value::as_str)
            .ok_or_else(|| SqlError::Tool {
                name: "open_url".into(),
                message: "缺少 url".into(),
            })?;
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Err(SqlError::Tool {
                name: "open_url".into(),
                message: "只允许 http(s) URL".into(),
            });
        }
        // Best-effort: prefer xdg-open / open / start.
        #[cfg(target_os = "linux")]
        let result = std::process::Command::new("xdg-open").arg(url).spawn();
        #[cfg(target_os = "macos")]
        let result = std::process::Command::new("open").arg(url).spawn();
        #[cfg(target_os = "windows")]
        let result = std::process::Command::new("cmd")
            .args(["/C", "start", url])
            .spawn();
        result.map_err(|e| SqlError::Tool {
            name: "open_url".into(),
            message: e.to_string(),
        })?;
        Ok(json!({ "ok": true, "opened": url }))
    }
}
