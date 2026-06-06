use crate::core::{
    error::{SqlError, SqlResult},
    registry::Registry,
    traits::Tool,
    types::ToolSpec,
};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;

pub struct QueryTool {
    pub registry: Arc<Registry>,
}

#[async_trait]
impl Tool for QueryTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "query".into(),
            description:
                "在当前存储后端执行一条只读 SQL 查询（SELECT/WITH/PRAGMA），返回最多 200 行结果。"
                    .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "sql": { "type": "string", "description": "要执行的 SQL 语句" }
                },
                "required": ["sql"]
            }),
        }
    }

    async fn invoke(&self, args: Value) -> SqlResult<Value> {
        let sql = args
            .get("sql")
            .and_then(Value::as_str)
            .ok_or_else(|| SqlError::Tool {
                name: "query".into(),
                message: "缺少参数 sql".into(),
            })?;
        let lower = sql.trim_start().to_ascii_lowercase();
        let ok = lower.starts_with("select")
            || lower.starts_with("with")
            || lower.starts_with("pragma");
        if !ok {
            return Err(SqlError::Tool {
                name: "query".into(),
                message: "只允许只读语句（SELECT / WITH / PRAGMA）".into(),
            });
        }
        let storage = self.registry.storage(None).ok_or_else(|| SqlError::Tool {
            name: "query".into(),
            message: "没有注册的存储后端".into(),
        })?;
        let mut result = storage.query(sql).await?;
        if result.rows.len() > 200 {
            result.rows.truncate(200);
        }
        Ok(serde_json::to_value(result)?)
    }
}
