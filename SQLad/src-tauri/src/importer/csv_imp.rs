use super::{cell_for_type, infer_schema, sanitize_name};
use crate::core::{
    error::{SqlError, SqlResult},
    traits::{Importer, ParsedImport},
    types::TableSchema,
};
use async_trait::async_trait;
use serde_json::Value;

pub struct CsvImporter;

#[async_trait]
impl Importer for CsvImporter {
    fn id(&self) -> &str {
        "csv"
    }
    fn display_name(&self) -> &str {
        "CSV / TSV"
    }

    fn detect(&self, hint: Option<&str>, sample: &[u8]) -> bool {
        if let Some(h) = hint {
            let lower = h.to_ascii_lowercase();
            if lower.ends_with(".csv") || lower.ends_with(".tsv") {
                return true;
            }
        }
        // Heuristic: first line contains a comma or tab, and isn't valid JSON.
        let head: &[u8] = &sample[..sample.len().min(4096)];
        let s = match std::str::from_utf8(head) {
            Ok(s) => s,
            Err(_) => return false,
        };
        if serde_json::from_str::<Value>(s.trim()).is_ok() {
            return false;
        }
        let first = s.lines().next().unwrap_or("");
        first.contains(',') || first.contains('\t')
    }

    async fn parse(&self, hint: Option<&str>, bytes: &[u8]) -> SqlResult<ParsedImport> {
        let text = std::str::from_utf8(bytes)
            .map_err(|e| SqlError::Importer(format!("非 UTF-8 文本: {e}")))?
            .to_string();
        let delim = if hint.map(|h| h.to_ascii_lowercase().ends_with(".tsv")).unwrap_or(false)
            || text.lines().next().map(|l| l.contains('\t')).unwrap_or(false)
        {
            b'\t'
        } else {
            b','
        };
        let mut rdr = csv::ReaderBuilder::new()
            .delimiter(delim)
            .has_headers(true)
            .flexible(true)
            .from_reader(text.as_bytes());

        let header: Vec<String> = rdr
            .headers()
            .map_err(|e| SqlError::Importer(e.to_string()))?
            .iter()
            .map(|s| s.to_string())
            .collect();
        if header.is_empty() {
            return Err(SqlError::Importer("CSV 没有表头".into()));
        }

        let mut raw_rows: Vec<Vec<String>> = Vec::new();
        for rec in rdr.records() {
            let rec = rec.map_err(|e| SqlError::Importer(e.to_string()))?;
            let mut row: Vec<String> = rec.iter().map(|s| s.to_string()).collect();
            while row.len() < header.len() {
                row.push(String::new());
            }
            row.truncate(header.len());
            raw_rows.push(row);
        }

        let mut samples_by_col: Vec<Vec<String>> = vec![Vec::new(); header.len()];
        for row in raw_rows.iter().take(200) {
            for (i, v) in row.iter().enumerate() {
                samples_by_col[i].push(v.clone());
            }
        }
        let cols = infer_schema(&header, &samples_by_col);
        let table = match hint {
            Some(h) => sanitize_name(
                std::path::Path::new(h)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("imported"),
            ),
            None => "imported".to_string(),
        };

        let mut rows: Vec<Vec<Value>> = Vec::with_capacity(raw_rows.len());
        for raw in raw_rows {
            let row: Vec<Value> = raw
                .iter()
                .enumerate()
                .map(|(i, v)| cell_for_type(v, cols[i].ty))
                .collect();
            rows.push(row);
        }

        Ok(ParsedImport {
            suggested_name: table.clone(),
            schema: TableSchema {
                name: table,
                columns: cols,
                row_count: None,
            },
            rows,
        })
    }
}
