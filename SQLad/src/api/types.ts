export type ColumnType = "text" | "integer" | "real" | "boolean" | "json" | "timestamp";

export interface ColumnDef {
  name: string;
  type: ColumnType;
  nullable?: boolean;
  primary_key?: boolean;
}

export interface TableSchema {
  name: string;
  columns: ColumnDef[];
  row_count?: number | null;
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  row_count: number;
  executed?: string | null;
}

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: unknown;
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  model?: string;
  temperature?: number;
}

export interface ChatReply {
  message: ChatMessage;
  finish_reason?: string;
}

export type ProviderProtocol = "openai" | "anthropic" | "ollama";

export interface ProviderConfig {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  base_url: string;
  api_key: string;
  model: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  model: string;
  is_default: boolean;
}

export interface AppSettings {
  providers: ProviderConfig[];
  default_provider_id: string | null;
}

export interface AdapterInfo {
  id: string;
  name: string;
}

export interface ImportRequest {
  filename_hint?: string;
  bytes: number[];
  table_name?: string;
}

export interface ImportResult {
  table: string;
  rows_inserted: number;
  schema: TableSchema;
}

export interface WebhookStatus {
  running: boolean;
  port: number;
  url: string;
}

export interface CredentialInfo {
  name: string;
  hint?: string | null;
  scheme: string;
  created_at: number;
}

export interface Trigger {
  id: string;
  name: string;
  enabled: boolean;
  interval_secs: number;
  condition_sql: string;
  action_prompt: string;
  last_run_at?: number | null;
  last_status?: string | null;
  last_error?: string | null;
  last_fired_rows?: number | null;
}
