pub mod csv_imp;
pub mod json_imp;

pub use csv_imp::CsvImporter;
pub use json_imp::JsonImporter;

use crate::core::{ColumnDef, ColumnType};
use serde_json::Value;

/// Best-effort sniff: integer → real → bool → text.
pub fn infer_column_type(samples: &[&str]) -> ColumnType {
    let mut all_int = true;
    let mut all_real = true;
    let mut all_bool = true;
    let mut nonempty = 0usize;
    for s in samples {
        let s = s.trim();
        if s.is_empty() {
            continue;
        }
        nonempty += 1;
        if s.parse::<i64>().is_err() {
            all_int = false;
        }
        if s.parse::<f64>().is_err() {
            all_real = false;
        }
        let lower = s.to_ascii_lowercase();
        if !matches!(lower.as_str(), "true" | "false" | "0" | "1" | "yes" | "no") {
            all_bool = false;
        }
    }
    if nonempty == 0 {
        return ColumnType::Text;
    }
    if all_int {
        ColumnType::Integer
    } else if all_real {
        ColumnType::Real
    } else if all_bool {
        ColumnType::Boolean
    } else {
        ColumnType::Text
    }
}

pub fn cell_for_type(s: &str, ty: ColumnType) -> Value {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return Value::Null;
    }
    match ty {
        ColumnType::Integer => trimmed
            .parse::<i64>()
            .map(Value::from)
            .unwrap_or(Value::String(s.to_string())),
        ColumnType::Real => trimmed
            .parse::<f64>()
            .ok()
            .and_then(serde_json::Number::from_f64)
            .map(Value::Number)
            .unwrap_or(Value::String(s.to_string())),
        ColumnType::Boolean => match trimmed.to_ascii_lowercase().as_str() {
            "true" | "1" | "yes" => Value::Bool(true),
            "false" | "0" | "no" => Value::Bool(false),
            _ => Value::String(s.to_string()),
        },
        _ => Value::String(s.to_string()),
    }
}

pub fn sanitize_name(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_us = false;
    for c in s.chars() {
        if c.is_ascii_alphanumeric() || c == '_' {
            out.push(c);
            prev_us = c == '_';
        } else if !prev_us && !out.is_empty() {
            out.push('_');
            prev_us = true;
        }
    }
    let trimmed = out.trim_matches('_').to_string();
    if trimmed.is_empty() {
        "col".into()
    } else if trimmed.chars().next().unwrap().is_ascii_digit() {
        format!("c_{trimmed}")
    } else {
        trimmed
    }
}

pub fn dedupe_column_names(names: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashMap::new();
    let mut out = Vec::with_capacity(names.len());
    for n in names {
        let count = seen.entry(n.clone()).or_insert(0u32);
        if *count == 0 {
            out.push(n.clone());
        } else {
            out.push(format!("{n}_{count}"));
        }
        *count += 1;
    }
    out
}

pub fn infer_schema(header: &[String], samples_by_col: &[Vec<String>]) -> Vec<ColumnDef> {
    let cleaned = dedupe_column_names(header.iter().map(|h| sanitize_name(h)).collect());
    cleaned
        .into_iter()
        .enumerate()
        .map(|(i, name)| {
            let samples: Vec<&str> = samples_by_col
                .get(i)
                .map(|v| v.iter().map(String::as_str).collect())
                .unwrap_or_default();
            ColumnDef {
                name,
                ty: infer_column_type(&samples),
                nullable: true,
                primary_key: false,
            }
        })
        .collect()
}
