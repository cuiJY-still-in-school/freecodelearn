use crate::core::{
    error::{SqlError, SqlResult},
    registry::Registry,
    traits::Tool,
    types::{ColumnDef, ColumnType, TableSchema, ToolSpec},
};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;

/// AI-callable tool to update a single cell of an existing row. Use it to
/// e.g. backfill an `summary` column after calling an external LLM.
pub struct UpdateCellTool {
    pub registry: Arc<Registry>,
}

#[async_trait]
impl Tool for UpdateCellTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "update_cell".into(),
            description:
                "更新某一行的某一列。`row_id` 是 SQLad 自动维护的 _id 主键。\
                 例：你刚 fetch_url 拿到一段 AI 总结，update_cell(table='feedback', row_id=12, column='summary', value='…')。"
                    .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "table": { "type": "string" },
                    "row_id": { "type": "integer" },
                    "column": { "type": "string" },
                    "value": { "description": "可以是 string / number / bool / null" }
                },
                "required": ["table", "row_id", "column", "value"]
            }),
        }
    }

    async fn invoke(&self, args: Value) -> SqlResult<Value> {
        let table = args.get("table").and_then(Value::as_str).ok_or_else(|| {
            SqlError::Tool {
                name: "update_cell".into(),
                message: "缺少 table".into(),
            }
        })?;
        let row_id = args
            .get("row_id")
            .and_then(Value::as_i64)
            .ok_or_else(|| SqlError::Tool {
                name: "update_cell".into(),
                message: "缺少 row_id (整数)".into(),
            })?;
        let column = args.get("column").and_then(Value::as_str).ok_or_else(|| {
            SqlError::Tool {
                name: "update_cell".into(),
                message: "缺少 column".into(),
            }
        })?;
        let value = args.get("value").cloned().unwrap_or(Value::Null);
        let storage = self.registry.storage(None).ok_or_else(|| SqlError::Tool {
            name: "update_cell".into(),
            message: "no storage".into(),
        })?;
        storage.update_cell(table, row_id, column, &value).await?;
        Ok(json!({ "ok": true, "table": table, "row_id": row_id, "column": column }))
    }
}

/// AI-callable tool to create a new table. Replaces the user having to run
/// CREATE TABLE SQL themselves: a brand new user can just say
/// "建一个跟踪学生成绩的表" and the assistant does it end-to-end.
pub struct CreateTableTool {
    pub registry: Arc<Registry>,
}

#[async_trait]
impl Tool for CreateTableTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "create_table".into(),
            description:
                "新建一个 SQLite 表。每列指定 name 和 type（text/integer/real/boolean/timestamp/json）。\
                 不需要给 _id 主键列，会自动添加。命名用 snake_case。"
                    .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "表名（snake_case）" },
                    "columns": {
                        "type": "array",
                        "description": "列定义数组",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": { "type": "string" },
                                "type": {
                                    "type": "string",
                                    "enum": ["text","integer","real","boolean","timestamp","json"]
                                }
                            },
                            "required": ["name", "type"]
                        }
                    }
                },
                "required": ["name", "columns"]
            }),
        }
    }

    async fn invoke(&self, args: Value) -> SqlResult<Value> {
        let name = args
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| SqlError::Tool {
                name: "create_table".into(),
                message: "缺少 name".into(),
            })?;
        let cols_v = args
            .get("columns")
            .and_then(Value::as_array)
            .ok_or_else(|| SqlError::Tool {
                name: "create_table".into(),
                message: "缺少 columns".into(),
            })?;
        let mut columns: Vec<ColumnDef> = Vec::new();
        for c in cols_v {
            let cname = c
                .get("name")
                .and_then(Value::as_str)
                .ok_or_else(|| SqlError::Tool {
                    name: "create_table".into(),
                    message: "列缺少 name".into(),
                })?;
            let ty_s = c
                .get("type")
                .and_then(Value::as_str)
                .ok_or_else(|| SqlError::Tool {
                    name: "create_table".into(),
                    message: "列缺少 type".into(),
                })?;
            let ty = match ty_s {
                "text" => ColumnType::Text,
                "integer" => ColumnType::Integer,
                "real" => ColumnType::Real,
                "boolean" => ColumnType::Boolean,
                "timestamp" => ColumnType::Timestamp,
                "json" => ColumnType::Json,
                other => {
                    return Err(SqlError::Tool {
                        name: "create_table".into(),
                        message: format!("未知列类型: {other}"),
                    });
                }
            };
            columns.push(ColumnDef {
                name: cname.into(),
                ty,
                nullable: true,
                primary_key: false,
            });
        }
        let schema = TableSchema {
            name: name.into(),
            columns,
            row_count: None,
        };
        let storage = self.registry.storage(None).ok_or_else(|| SqlError::Tool {
            name: "create_table".into(),
            message: "没有注册的存储后端".into(),
        })?;
        storage.create_table(&schema).await?;
        let final_schema = storage.describe(name).await?;
        Ok(json!({
            "ok": true,
            "table": name,
            "columns": final_schema.columns.len(),
        }))
    }
}

/// AI-callable tool to insert rows into a table. Each row is a JSON object
/// keyed by column name.
pub struct InsertRowsTool {
    pub registry: Arc<Registry>,
}

#[async_trait]
impl Tool for InsertRowsTool {
    fn spec(&self) -> ToolSpec {
        ToolSpec {
            name: "insert_rows".into(),
            description:
                "向表中插入若干行数据。每行是一个 JSON 对象，键是列名，值是对应类型。\
                 _id 主键不需要给，自动生成。返回插入数量。"
                    .into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "table": { "type": "string", "description": "目标表名" },
                    "rows": {
                        "type": "array",
                        "description": "行数据数组，每行是一个键/值对象",
                        "items": { "type": "object" }
                    }
                },
                "required": ["table", "rows"]
            }),
        }
    }

    async fn invoke(&self, args: Value) -> SqlResult<Value> {
        let table = args
            .get("table")
            .and_then(Value::as_str)
            .ok_or_else(|| SqlError::Tool {
                name: "insert_rows".into(),
                message: "缺少 table".into(),
            })?;
        let rows_v = args
            .get("rows")
            .and_then(Value::as_array)
            .ok_or_else(|| SqlError::Tool {
                name: "insert_rows".into(),
                message: "缺少 rows".into(),
            })?;
        if rows_v.is_empty() {
            return Ok(json!({ "inserted": 0 }));
        }

        let storage = self.registry.storage(None).ok_or_else(|| SqlError::Tool {
            name: "insert_rows".into(),
            message: "没有注册的存储后端".into(),
        })?;
        // Resolve the target column order from the table schema (skip _id).
        let schema = storage.describe(table).await?;
        let data_cols: Vec<String> = schema
            .columns
            .iter()
            .filter(|c| c.name != "_id")
            .map(|c| c.name.clone())
            .collect();

        let rows: Vec<Vec<Value>> = rows_v
            .iter()
            .map(|row| {
                let obj = row.as_object();
                data_cols
                    .iter()
                    .map(|c| obj.and_then(|o| o.get(c)).cloned().unwrap_or(Value::Null))
                    .collect()
            })
            .collect();

        let inserted = storage.insert_rows(table, &rows).await?;
        Ok(json!({ "ok": true, "inserted": inserted, "table": table }))
    }
}
