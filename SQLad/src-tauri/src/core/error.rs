use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SqlError {
    #[error("storage error: {0}")]
    Storage(String),

    #[error("ai error: {0}")]
    Ai(String),

    #[error("importer error: {0}")]
    Importer(String),

    #[error("tool '{name}' error: {message}")]
    Tool { name: String, message: String },

    #[error("not found: {0}")]
    NotFound(String),

    #[error("invalid: {0}")]
    Invalid(String),

    #[error("io: {0}")]
    Io(#[from] std::io::Error),

    #[error("json: {0}")]
    Json(#[from] serde_json::Error),

    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

pub type SqlResult<T> = Result<T, SqlError>;

// Tauri commands need a Serialize-able error. Render as a tagged string.
impl Serialize for SqlError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
