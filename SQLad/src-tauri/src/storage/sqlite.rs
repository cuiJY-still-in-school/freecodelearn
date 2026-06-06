use crate::core::{
    error::{SqlError, SqlResult},
    traits::StorageAdapter,
    types::{ColumnDef, ColumnType, QueryResult, TableSchema},
};
use async_trait::async_trait;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::types::ValueRef;
use serde_json::Value;
use std::path::PathBuf;

pub struct SqliteAdapter {
    pool: Pool<SqliteConnectionManager>,
    path: PathBuf,
}

impl SqliteAdapter {
    pub fn open(path: PathBuf) -> SqlResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mgr = SqliteConnectionManager::file(&path);
        let pool = Pool::builder()
            .max_size(8)
            .build(mgr)
            .map_err(|e| SqlError::Storage(e.to_string()))?;
        Ok(Self { pool, path })
    }

    pub fn path(&self) -> &PathBuf {
        &self.path
    }
}

fn sqlite_type(ty: ColumnType) -> &'static str {
    match ty {
        ColumnType::Text | ColumnType::Json | ColumnType::Timestamp => "TEXT",
        ColumnType::Integer => "INTEGER",
        ColumnType::Real => "REAL",
        ColumnType::Boolean => "INTEGER",
    }
}

fn quote_ident(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}

fn to_json(v: ValueRef<'_>) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => serde_json::Number::from_f64(f)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Value::String(format!("<blob {} bytes>", b.len())),
    }
}

fn bind_value(v: &Value) -> rusqlite::types::Value {
    use rusqlite::types::Value as RV;
    match v {
        Value::Null => RV::Null,
        Value::Bool(b) => RV::Integer(if *b { 1 } else { 0 }),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                RV::Integer(i)
            } else if let Some(f) = n.as_f64() {
                RV::Real(f)
            } else {
                RV::Text(n.to_string())
            }
        }
        Value::String(s) => RV::Text(s.clone()),
        // Arrays/objects: serialize as JSON text.
        other => RV::Text(other.to_string()),
    }
}

#[async_trait]
impl StorageAdapter for SqliteAdapter {
    fn id(&self) -> &str {
        "sqlite"
    }
    fn display_name(&self) -> &str {
        "SQLite (本地文件)"
    }

    async fn list_tables(&self) -> SqlResult<Vec<TableSchema>> {
        let pool = self.pool.clone();
        tokio::task::spawn_blocking(move || -> SqlResult<Vec<TableSchema>> {
            let conn = pool.get().map_err(|e| SqlError::Storage(e.to_string()))?;
            let mut stmt = conn
                .prepare(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
                )
                .map_err(|e| SqlError::Storage(e.to_string()))?;
            let names: Vec<String> = stmt
                .query_map([], |r| r.get::<_, String>(0))
                .map_err(|e| SqlError::Storage(e.to_string()))?
                .filter_map(|r| r.ok())
                .collect();

            let mut out = Vec::with_capacity(names.len());
            for name in names {
                let schema = describe_blocking(&conn, &name)?;
                out.push(schema);
            }
            Ok(out)
        })
        .await
        .map_err(|e| SqlError::Storage(e.to_string()))?
    }

    async fn create_table(&self, schema: &TableSchema) -> SqlResult<()> {
        let pool = self.pool.clone();
        let schema = schema.clone();
        tokio::task::spawn_blocking(move || -> SqlResult<()> {
            if schema.columns.is_empty() {
                return Err(SqlError::Invalid("table must have at least one column".into()));
            }
            let mut cols: Vec<String> = schema
                .columns
                .iter()
                .map(|c| {
                    let mut s = format!("{} {}", quote_ident(&c.name), sqlite_type(c.ty));
                    if c.primary_key {
                        s.push_str(" PRIMARY KEY");
                    }
                    if !c.nullable && !c.primary_key {
                        s.push_str(" NOT NULL");
                    }
                    s
                })
                .collect();
            // If no primary key declared, give it a rowid alias for stable identity.
            if !schema.columns.iter().any(|c| c.primary_key) {
                cols.insert(0, "_id INTEGER PRIMARY KEY AUTOINCREMENT".into());
            }
            let sql = format!(
                "CREATE TABLE IF NOT EXISTS {} ({})",
                quote_ident(&schema.name),
                cols.join(", ")
            );
            let conn = pool.get().map_err(|e| SqlError::Storage(e.to_string()))?;
            conn.execute(&sql, []).map_err(|e| SqlError::Storage(e.to_string()))?;
            Ok(())
        })
        .await
        .map_err(|e| SqlError::Storage(e.to_string()))?
    }

    async fn drop_table(&self, name: &str) -> SqlResult<()> {
        let pool = self.pool.clone();
        let name = name.to_string();
        tokio::task::spawn_blocking(move || -> SqlResult<()> {
            let conn = pool.get().map_err(|e| SqlError::Storage(e.to_string()))?;
            let sql = format!("DROP TABLE IF EXISTS {}", quote_ident(&name));
            conn.execute(&sql, []).map_err(|e| SqlError::Storage(e.to_string()))?;
            Ok(())
        })
        .await
        .map_err(|e| SqlError::Storage(e.to_string()))?
    }

    async fn insert_rows(&self, table: &str, rows: &[Vec<Value>]) -> SqlResult<usize> {
        if rows.is_empty() {
            return Ok(0);
        }
        let pool = self.pool.clone();
        let table = table.to_string();
        let rows = rows.to_vec();
        tokio::task::spawn_blocking(move || -> SqlResult<usize> {
            let mut conn = pool.get().map_err(|e| SqlError::Storage(e.to_string()))?;
            let schema = describe_blocking(&conn, &table)?;
            // Skip auto _id when its column count is rows.len() + 1.
            let data_cols: Vec<&ColumnDef> = schema
                .columns
                .iter()
                .filter(|c| c.name != "_id")
                .collect();
            let n = rows[0].len();
            if n != data_cols.len() {
                return Err(SqlError::Invalid(format!(
                    "row width {} != column count {}",
                    n,
                    data_cols.len()
                )));
            }
            let col_list = data_cols
                .iter()
                .map(|c| quote_ident(&c.name))
                .collect::<Vec<_>>()
                .join(", ");
            let placeholders = vec!["?"; n].join(", ");
            let sql = format!(
                "INSERT INTO {} ({}) VALUES ({})",
                quote_ident(&table),
                col_list,
                placeholders
            );

            let tx = conn.transaction().map_err(|e| SqlError::Storage(e.to_string()))?;
            let mut inserted = 0;
            {
                let mut stmt = tx.prepare(&sql).map_err(|e| SqlError::Storage(e.to_string()))?;
                for row in &rows {
                    let bound: Vec<rusqlite::types::Value> = row.iter().map(bind_value).collect();
                    let params = rusqlite::params_from_iter(bound.iter());
                    stmt.execute(params).map_err(|e| SqlError::Storage(e.to_string()))?;
                    inserted += 1;
                }
            }
            tx.commit().map_err(|e| SqlError::Storage(e.to_string()))?;
            Ok(inserted)
        })
        .await
        .map_err(|e| SqlError::Storage(e.to_string()))?
    }

    async fn insert_blank_row(&self, table: &str) -> SqlResult<i64> {
        let pool = self.pool.clone();
        let table = table.to_string();
        tokio::task::spawn_blocking(move || -> SqlResult<i64> {
            let conn = pool.get().map_err(|e| SqlError::Storage(e.to_string()))?;
            let schema = describe_blocking(&conn, &table)?;
            // Insert with DEFAULT VALUES — works only if all non-PK columns are nullable or have defaults.
            // For SQLad tables we created the implicit _id PK; data columns are NULLABLE by default
            // from our create_table path, so this is fine. Otherwise we INSERT explicit NULLs.
            let data_cols: Vec<&ColumnDef> = schema
                .columns
                .iter()
                .filter(|c| c.name != "_id")
                .collect();
            let sql = if data_cols.is_empty() {
                format!("INSERT INTO {} DEFAULT VALUES", quote_ident(&table))
            } else {
                let cols = data_cols
                    .iter()
                    .map(|c| quote_ident(&c.name))
                    .collect::<Vec<_>>()
                    .join(", ");
                let nulls = vec!["NULL"; data_cols.len()].join(", ");
                format!(
                    "INSERT INTO {} ({}) VALUES ({})",
                    quote_ident(&table),
                    cols,
                    nulls
                )
            };
            conn.execute(&sql, [])
                .map_err(|e| SqlError::Storage(e.to_string()))?;
            Ok(conn.last_insert_rowid())
        })
        .await
        .map_err(|e| SqlError::Storage(e.to_string()))?
    }

    async fn update_cell(
        &self,
        table: &str,
        row_id: i64,
        column: &str,
        value: &Value,
    ) -> SqlResult<()> {
        let pool = self.pool.clone();
        let table = table.to_string();
        let column = column.to_string();
        let value = value.clone();
        tokio::task::spawn_blocking(move || -> SqlResult<()> {
            if column == "_id" {
                return Err(SqlError::Invalid("不能修改 _id 主键列".into()));
            }
            let conn = pool.get().map_err(|e| SqlError::Storage(e.to_string()))?;
            // Verify the column exists to give a useful error.
            let schema = describe_blocking(&conn, &table)?;
            if !schema.columns.iter().any(|c| c.name == column) {
                return Err(SqlError::NotFound(format!("column {column}")));
            }
            let sql = format!(
                "UPDATE {} SET {} = ? WHERE _id = ?",
                quote_ident(&table),
                quote_ident(&column)
            );
            let bound = bind_value(&value);
            let n = conn
                .execute(&sql, rusqlite::params![bound, row_id])
                .map_err(|e| SqlError::Storage(e.to_string()))?;
            if n == 0 {
                return Err(SqlError::NotFound(format!("row _id={row_id}")));
            }
            Ok(())
        })
        .await
        .map_err(|e| SqlError::Storage(e.to_string()))?
    }

    async fn delete_rows(&self, table: &str, row_ids: &[i64]) -> SqlResult<usize> {
        if row_ids.is_empty() {
            return Ok(0);
        }
        let pool = self.pool.clone();
        let table = table.to_string();
        let row_ids = row_ids.to_vec();
        tokio::task::spawn_blocking(move || -> SqlResult<usize> {
            let mut conn = pool.get().map_err(|e| SqlError::Storage(e.to_string()))?;
            let tx = conn
                .transaction()
                .map_err(|e| SqlError::Storage(e.to_string()))?;
            let mut deleted = 0;
            {
                let sql = format!("DELETE FROM {} WHERE _id = ?", quote_ident(&table));
                let mut stmt = tx
                    .prepare(&sql)
                    .map_err(|e| SqlError::Storage(e.to_string()))?;
                for id in &row_ids {
                    deleted += stmt
                        .execute(rusqlite::params![id])
                        .map_err(|e| SqlError::Storage(e.to_string()))?;
                }
            }
            tx.commit().map_err(|e| SqlError::Storage(e.to_string()))?;
            Ok(deleted)
        })
        .await
        .map_err(|e| SqlError::Storage(e.to_string()))?
    }

    async fn add_column(&self, table: &str, column: &ColumnDef) -> SqlResult<()> {
        let pool = self.pool.clone();
        let table = table.to_string();
        let column = column.clone();
        tokio::task::spawn_blocking(move || -> SqlResult<()> {
            let conn = pool.get().map_err(|e| SqlError::Storage(e.to_string()))?;
            // SQLite ALTER TABLE ADD COLUMN: cannot be NOT NULL without default; always make it nullable.
            let sql = format!(
                "ALTER TABLE {} ADD COLUMN {} {}",
                quote_ident(&table),
                quote_ident(&column.name),
                sqlite_type(column.ty)
            );
            conn.execute(&sql, [])
                .map_err(|e| SqlError::Storage(e.to_string()))?;
            Ok(())
        })
        .await
        .map_err(|e| SqlError::Storage(e.to_string()))?
    }

    async fn drop_column(&self, table: &str, column: &str) -> SqlResult<()> {
        let pool = self.pool.clone();
        let table = table.to_string();
        let column = column.to_string();
        tokio::task::spawn_blocking(move || -> SqlResult<()> {
            if column == "_id" {
                return Err(SqlError::Invalid("不能删除 _id 主键列".into()));
            }
            let conn = pool.get().map_err(|e| SqlError::Storage(e.to_string()))?;
            let sql = format!(
                "ALTER TABLE {} DROP COLUMN {}",
                quote_ident(&table),
                quote_ident(&column)
            );
            conn.execute(&sql, [])
                .map_err(|e| SqlError::Storage(e.to_string()))?;
            Ok(())
        })
        .await
        .map_err(|e| SqlError::Storage(e.to_string()))?
    }

    async fn rename_column(&self, table: &str, from: &str, to: &str) -> SqlResult<()> {
        let pool = self.pool.clone();
        let table = table.to_string();
        let from = from.to_string();
        let to = to.to_string();
        tokio::task::spawn_blocking(move || -> SqlResult<()> {
            if from == "_id" {
                return Err(SqlError::Invalid("不能重命名 _id 主键列".into()));
            }
            let conn = pool.get().map_err(|e| SqlError::Storage(e.to_string()))?;
            let sql = format!(
                "ALTER TABLE {} RENAME COLUMN {} TO {}",
                quote_ident(&table),
                quote_ident(&from),
                quote_ident(&to)
            );
            conn.execute(&sql, [])
                .map_err(|e| SqlError::Storage(e.to_string()))?;
            Ok(())
        })
        .await
        .map_err(|e| SqlError::Storage(e.to_string()))?
    }

    async fn query(&self, statement: &str) -> SqlResult<QueryResult> {
        let pool = self.pool.clone();
        let sql = statement.to_string();
        tokio::task::spawn_blocking(move || -> SqlResult<QueryResult> {
            let conn = pool.get().map_err(|e| SqlError::Storage(e.to_string()))?;
            let trimmed = sql.trim_start();
            let is_select = trimmed.to_ascii_lowercase().starts_with("select")
                || trimmed.to_ascii_lowercase().starts_with("with")
                || trimmed.to_ascii_lowercase().starts_with("pragma");

            if is_select {
                let mut stmt = conn.prepare(&sql).map_err(|e| SqlError::Storage(e.to_string()))?;
                let column_count = stmt.column_count();
                let columns: Vec<String> = (0..column_count)
                    .map(|i| stmt.column_name(i).unwrap_or("?").to_string())
                    .collect();
                let mut rows_out: Vec<Vec<Value>> = Vec::new();
                let mut rows = stmt.query([]).map_err(|e| SqlError::Storage(e.to_string()))?;
                while let Some(r) = rows.next().map_err(|e| SqlError::Storage(e.to_string()))? {
                    let mut row = Vec::with_capacity(column_count);
                    for i in 0..column_count {
                        let v = r.get_ref(i).map_err(|e| SqlError::Storage(e.to_string()))?;
                        row.push(to_json(v));
                    }
                    rows_out.push(row);
                }
                let row_count = rows_out.len();
                Ok(QueryResult {
                    columns,
                    rows: rows_out,
                    row_count,
                    executed: Some(sql),
                })
            } else {
                let affected = conn.execute(&sql, []).map_err(|e| SqlError::Storage(e.to_string()))?;
                Ok(QueryResult {
                    columns: vec!["affected".into()],
                    rows: vec![vec![Value::from(affected as u64)]],
                    row_count: 1,
                    executed: Some(sql),
                })
            }
        })
        .await
        .map_err(|e| SqlError::Storage(e.to_string()))?
    }

    async fn describe(&self, table: &str) -> SqlResult<TableSchema> {
        let pool = self.pool.clone();
        let table = table.to_string();
        tokio::task::spawn_blocking(move || -> SqlResult<TableSchema> {
            let conn = pool.get().map_err(|e| SqlError::Storage(e.to_string()))?;
            describe_blocking(&conn, &table)
        })
        .await
        .map_err(|e| SqlError::Storage(e.to_string()))?
    }
}

fn describe_blocking(conn: &rusqlite::Connection, table: &str) -> SqlResult<TableSchema> {
    let pragma = format!("PRAGMA table_info({})", quote_ident(table));
    let mut stmt = conn
        .prepare(&pragma)
        .map_err(|e| SqlError::Storage(e.to_string()))?;
    let cols: Vec<ColumnDef> = stmt
        .query_map([], |r| {
            let name: String = r.get(1)?;
            let ty: String = r.get(2)?;
            let notnull: i32 = r.get(3)?;
            let pk: i32 = r.get(5)?;
            Ok(ColumnDef {
                name,
                ty: parse_type(&ty),
                nullable: notnull == 0,
                primary_key: pk > 0,
            })
        })
        .map_err(|e| SqlError::Storage(e.to_string()))?
        .filter_map(|r| r.ok())
        .collect();

    if cols.is_empty() {
        return Err(SqlError::NotFound(format!("table {table}")));
    }

    let count: u64 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM {}", quote_ident(table)),
            [],
            |r| r.get::<_, i64>(0),
        )
        .map_err(|e| SqlError::Storage(e.to_string()))? as u64;

    Ok(TableSchema {
        name: table.to_string(),
        columns: cols,
        row_count: Some(count),
    })
}

fn parse_type(s: &str) -> ColumnType {
    let s = s.to_ascii_uppercase();
    if s.contains("INT") {
        ColumnType::Integer
    } else if s.contains("REAL") || s.contains("FLOA") || s.contains("DOUB") {
        ColumnType::Real
    } else if s.contains("BOOL") {
        ColumnType::Boolean
    } else {
        ColumnType::Text
    }
}
