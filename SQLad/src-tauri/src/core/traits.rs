use super::types::*;
use super::SqlResult;
use async_trait::async_trait;
use serde_json::Value;

/// Where data lives. SQLite is the reference implementation; other adapters
/// (DuckDB, JSONL, remote DBs, vector stores...) plug in here.
#[async_trait]
pub trait StorageAdapter: Send + Sync {
    fn id(&self) -> &str;
    fn display_name(&self) -> &str;

    async fn list_tables(&self) -> SqlResult<Vec<TableSchema>>;
    async fn create_table(&self, schema: &TableSchema) -> SqlResult<()>;
    async fn drop_table(&self, name: &str) -> SqlResult<()>;

    async fn insert_rows(&self, table: &str, rows: &[Vec<Value>]) -> SqlResult<usize>;

    /// Insert a row with all defaults / nulls and return its rowid.
    async fn insert_blank_row(&self, table: &str) -> SqlResult<i64>;

    /// Update a single cell. `row_id` is the adapter's internal rowid
    /// (`_id` column for the SQLite reference impl).
    async fn update_cell(
        &self,
        table: &str,
        row_id: i64,
        column: &str,
        value: &Value,
    ) -> SqlResult<()>;

    async fn delete_rows(&self, table: &str, row_ids: &[i64]) -> SqlResult<usize>;

    async fn add_column(&self, table: &str, column: &ColumnDef) -> SqlResult<()>;

    async fn rename_column(
        &self,
        table: &str,
        from: &str,
        to: &str,
    ) -> SqlResult<()>;

    async fn drop_column(&self, table: &str, column: &str) -> SqlResult<()>;

    /// Free-form query in the adapter's native language (SQL for SQLite).
    /// Adapters that don't speak SQL can reject or translate.
    async fn query(&self, statement: &str) -> SqlResult<QueryResult>;

    async fn describe(&self, table: &str) -> SqlResult<TableSchema>;
}

#[async_trait]
pub trait AIProvider: Send + Sync {
    fn id(&self) -> &str;
    fn display_name(&self) -> &str;

    async fn chat(&self, req: ChatRequest) -> SqlResult<ChatReply>;
}

#[async_trait]
pub trait Importer: Send + Sync {
    fn id(&self) -> &str;
    fn display_name(&self) -> &str;

    /// Cheap detection from a filename hint and/or a sample of the bytes.
    fn detect(&self, hint: Option<&str>, sample: &[u8]) -> bool;

    /// Parse raw bytes into a schema + rows ready to feed StorageAdapter.
    async fn parse(&self, hint: Option<&str>, bytes: &[u8]) -> SqlResult<ParsedImport>;
}

#[derive(Debug, Clone)]
pub struct ParsedImport {
    pub suggested_name: String,
    pub schema: TableSchema,
    pub rows: Vec<Vec<Value>>,
}

/// AI-callable side-effectful or query operation.
#[async_trait]
pub trait Tool: Send + Sync {
    fn spec(&self) -> ToolSpec;
    async fn invoke(&self, args: Value) -> SqlResult<Value>;
}
