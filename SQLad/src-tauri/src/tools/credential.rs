use crate::core::{
    error::{SqlError, SqlResult},
    traits::Tool,
    types::ToolSpec,
};
use crate::credentials::CredentialStore;
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;

/// AI tool: save a credential (token / API key) under a name.
/// Typically called at the *end* of an OAuth Device Flow when the AI has
/// obtained an access_token via fetch_url.
pub struct SaveCredentialTool {
    pub store: Arc<CredentialStore>,
}

#[async_trait]
impl Tool for SaveCredentialTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "save_credential".into(),
            description:
                "保存一个令牌/API key 到 SQLad 凭证库（本地 JSON）。之后调用 fetch_url 时给 credential 参数引用它即可自动附加认证。\
                 适用于 OAuth Device Flow 拿到 access_token 之后、或用户提供的 PAT。"
                    .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "唯一名字，例如 'github' / 'openai' / 'notion'"
                    },
                    "value": {
                        "type": "string",
                        "description": "令牌字符串本身"
                    },
                    "hint": {
                        "type": "string",
                        "description": "给用户看的简短说明，例如 'GitHub OAuth (scope: repo, read:user)'"
                    },
                    "scheme": {
                        "type": "string",
                        "description": "fetch_url 时的注入方式：'bearer'（默认，Authorization: Bearer）、'header:<HeaderName>'（自定义头）、'query:<param>'（追加到 URL 查询串）",
                        "default": "bearer"
                    }
                },
                "required": ["name", "value"]
            }),
        }
    }

    async fn invoke(&self, args: Value) -> SqlResult<Value> {
        let name = args
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| SqlError::Tool {
                name: "save_credential".into(),
                message: "缺少 name".into(),
            })?
            .to_string();
        let value = args
            .get("value")
            .and_then(Value::as_str)
            .ok_or_else(|| SqlError::Tool {
                name: "save_credential".into(),
                message: "缺少 value".into(),
            })?
            .to_string();
        let hint = args
            .get("hint")
            .and_then(Value::as_str)
            .map(String::from);
        let scheme = args
            .get("scheme")
            .and_then(Value::as_str)
            .map(String::from);
        self.store.save(name.clone(), value, hint, scheme)?;
        Ok(json!({ "ok": true, "name": name }))
    }
}

pub struct ListCredentialsTool {
    pub store: Arc<CredentialStore>,
}

#[async_trait]
impl Tool for ListCredentialsTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "list_credentials".into(),
            description: "列出已保存的凭证（只返回名字、用途说明、scheme，不返回 value）。在调 fetch_url 前用它确认有没有可用凭证。".into(),
            parameters: json!({ "type": "object", "properties": {} }),
        }
    }

    async fn invoke(&self, _args: Value) -> SqlResult<Value> {
        Ok(serde_json::to_value(self.store.list())?)
    }
}

pub struct DeleteCredentialTool {
    pub store: Arc<CredentialStore>,
}

#[async_trait]
impl Tool for DeleteCredentialTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "delete_credential".into(),
            description: "删除一个凭证（用户说『清掉 github 的登录』之类）".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "name": { "type": "string" }
                },
                "required": ["name"]
            }),
        }
    }

    async fn invoke(&self, args: Value) -> SqlResult<Value> {
        let name = args
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| SqlError::Tool {
                name: "delete_credential".into(),
                message: "缺少 name".into(),
            })?;
        self.store.delete(name)?;
        Ok(json!({ "ok": true }))
    }
}
