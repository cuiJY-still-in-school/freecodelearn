use crate::core::{
    error::{SqlError, SqlResult},
    registry::Registry,
    traits::Tool,
    types::ToolSpec,
};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;

pub struct ListTablesTool {
    pub registry: Arc<Registry>,
}

#[async_trait]
impl Tool for ListTablesTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "list_tables".into(),
            description: "列出当前存储后端中所有表及其列定义（schema）。无参数。".into(),
            parameters: json!({
                "type": "object",
                "properties": {}
            }),
        }
    }

    async fn invoke(&self, _args: Value) -> SqlResult<Value> {
        let storage = self.registry.storage(None).ok_or_else(|| SqlError::Tool {
            name: "list_tables".into(),
            message: "没有注册的存储后端".into(),
        })?;
        let tables = storage.list_tables().await?;
        Ok(serde_json::to_value(tables)?)
    }
}
