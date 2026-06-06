use super::sanitize_name;
use crate::core::{
    error::{SqlError, SqlResult},
    traits::{Importer, ParsedImport},
    types::{ColumnDef, ColumnType, TableSchema},
};
use async_trait::async_trait;
use serde_json::{Map, Value};
use std::collections::BTreeSet;

pub struct JsonImporter;

#[async_trait]
impl Importer for JsonImporter {
    fn id(&self) -> &str {
        "json"
    }
    fn display_name(&self) -> &str {
        "JSON / JSONL"
    }

    fn detect(&self, hint: Option<&str>, sample: &[u8]) -> bool {
        if let Some(h) = hint {
            let l = h.to_ascii_lowercase();
            if l.ends_with(".json") || l.ends_with(".jsonl") || l.ends_with(".ndjson") {
                return true;
            }
        }
        let s = match std::str::from_utf8(&sample[..sample.len().min(4096)]) {
            Ok(s) => s.trim_start(),
            Err(_) => return false,
        };
        s.starts_with('[') || s.starts_with('{')
    }

    async fn parse(&self, hint: Option<&str>, bytes: &[u8]) -> SqlResult<ParsedImport> {
        let text = std::str::from_utf8(bytes)
            .map_err(|e| SqlError::Importer(format!("非 UTF-8: {e}")))?;

        let records: Vec<Map<String, Value>> = match serde_json::from_str::<Value>(text.trim()) {
            Ok(Value::Array(arr)) => arr
                .into_iter()
                .filter_map(|v| match v {
                    Value::Object(m) => Some(m),
                    _ => None,
                })
                .collect(),
            Ok(Value::Object(m)) => vec![m],
            _ => {
                // Try JSONL.
                let mut out = Vec::new();
                for (i, line) in text.lines().enumerate() {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<Value>(trimmed) {
                        Ok(Value::Object(m)) => out.push(m),
                        Ok(_) => {}
                        Err(e) => {
                            return Err(SqlError::Importer(format!("第 {} 行解析失败: {e}", i + 1)));
                        }
                    }
                }
                out
            }
        };

        if records.is_empty() {
            return Err(SqlError::Importer("JSON 中没有对象记录".into()));
        }

        let mut key_order: Vec<String> = Vec::new();
        let mut seen: BTreeSet<String> = BTreeSet::new();
        for r in &records {
            for k in r.keys() {
                if seen.insert(k.clone()) {
                    key_order.push(k.clone());
                }
            }
        }

        let columns: Vec<ColumnDef> = key_order
            .iter()
            .map(|k| {
                let ty = guess_type_for_key(&records, k);
                ColumnDef {
                    name: sanitize_name(k),
                    ty,
                    nullable: true,
                    primary_key: false,
                }
            })
            .collect();

        let mut rows: Vec<Vec<Value>> = Vec::with_capacity(records.len());
        for r in records {
            let row: Vec<Value> = key_order
                .iter()
                .map(|k| r.get(k).cloned().unwrap_or(Value::Null))
                .collect();
            rows.push(row);
        }

        let table = match hint {
            Some(h) => sanitize_name(
                std::path::Path::new(h)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("imported"),
            ),
            None => "imported".to_string(),
        };

        Ok(ParsedImport {
            suggested_name: table.clone(),
            schema: TableSchema {
                name: table,
                columns,
                row_count: None,
            },
            rows,
        })
    }
}

fn guess_type_for_key(records: &[Map<String, Value>], key: &str) -> ColumnType {
    let mut all_int = true;
    let mut all_real = true;
    let mut all_bool = true;
    let mut seen = 0usize;
    for r in records {
        match r.get(key) {
            None | Some(Value::Null) => {}
            Some(Value::Bool(_)) => {
                seen += 1;
                all_int = false;
                all_real = false;
            }
            Some(Value::Number(n)) => {
                seen += 1;
                all_bool = false;
                if n.as_i64().is_none() {
                    all_int = false;
                }
                if n.as_f64().is_none() {
                    all_real = false;
                }
            }
            Some(Value::String(_)) => {
                seen += 1;
                all_int = false;
                all_real = false;
                all_bool = false;
            }
            Some(_) => {
                return ColumnType::Json;
            }
        }
    }
    if seen == 0 {
        ColumnType::Text
    } else if all_bool {
        ColumnType::Boolean
    } else if all_int {
        ColumnType::Integer
    } else if all_real {
        ColumnType::Real
    } else {
        ColumnType::Text
    }
}
