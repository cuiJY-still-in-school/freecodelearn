import { invoke } from "@tauri-apps/api/core";
import type {
  AdapterInfo,
  AppSettings,
  ChatReply,
  ChatRequest,
  ColumnDef,
  CredentialInfo,
  ImportRequest,
  ImportResult,
  ProviderConfig,
  ProviderInfo,
  QueryResult,
  TableSchema,
  ToolSpec,
  Trigger,
  WebhookStatus,
} from "./types";

export const api = {
  getSettings: () => invoke<AppSettings>("get_settings"),
  saveSettings: (settings: AppSettings) => invoke<void>("save_settings", { settings }),

  listStorageAdapters: () => invoke<AdapterInfo[]>("list_storage_adapters"),
  listAiProviders: () => invoke<ProviderInfo[]>("list_ai_providers"),
  upsertProvider: (provider: ProviderConfig) =>
    invoke<void>("upsert_provider", { provider }),
  deleteProvider: (id: string) => invoke<void>("delete_provider", { id }),
  setDefaultProvider: (id: string) => invoke<void>("set_default_provider", { id }),
  testProvider: (provider: ProviderConfig) =>
    invoke<string>("test_provider", { provider }),
  listTools: () => invoke<ToolSpec[]>("list_tools"),

  listTables: () => invoke<TableSchema[]>("list_tables"),
  createTable: (schema: TableSchema) => invoke<void>("create_table", { schema }),
  dropTable: (name: string) => invoke<void>("drop_table", { name }),

  insertBlankRow: (table: string) => invoke<number>("insert_blank_row", { table }),
  updateCell: (table: string, row_id: number, column: string, value: unknown) =>
    invoke<void>("update_cell", { cmd: { table, row_id, column, value } }),
  deleteRows: (table: string, row_ids: number[]) =>
    invoke<number>("delete_rows", { cmd: { table, row_ids } }),
  addColumn: (table: string, column: ColumnDef) =>
    invoke<void>("add_column", { cmd: { table, column } }),
  renameColumn: (table: string, from: string, to: string) =>
    invoke<void>("rename_column", { cmd: { table, from, to } }),
  dropColumn: (table: string, column: string) =>
    invoke<void>("drop_column", { cmd: { table, column } }),

  runQuery: (sql: string) => invoke<QueryResult>("run_query", { sql }),

  importData: (req: ImportRequest) => invoke<ImportResult>("import_data", { req }),

  chat: (request: ChatRequest, providerId?: string) =>
    invoke<ChatReply>("chat", { cmd: { request, provider_id: providerId ?? null } }),

  invokeTool: (name: string, args: unknown) =>
    invoke<unknown>("invoke_tool", { cmd: { name, arguments: args } }),

  dataDir: () => invoke<string>("data_dir"),

  listTriggers: () => invoke<Trigger[]>("list_triggers"),
  saveTrigger: (trigger: Trigger) => invoke<void>("save_trigger", { trigger }),
  deleteTrigger: (id: string) => invoke<void>("delete_trigger", { id }),
  evaluateTrigger: (id: string) => invoke<QueryResult>("evaluate_trigger", { id }),
  markTrigger: (id: string, status: string, rows?: number, error?: string) =>
    invoke<void>("mark_trigger", {
      cmd: { id, status, rows: rows ?? null, error: error ?? null },
    }),

  listCredentials: () => invoke<CredentialInfo[]>("list_credentials"),
  listServiceMods: () =>
    invoke<Array<{ path: string; [key: string]: unknown }>>("list_service_mods"),
  modsDir: () => invoke<string>("mods_dir"),
  openPath: (path: string) => invoke<void>("open_path", { path }),
  saveTextFile: (path: string, content: string) =>
    invoke<void>("save_text_file", { path, content }),
  fetchAndSaveMod: (url: string, dir: string) =>
    invoke<string>("fetch_and_save_mod", { url, dir }),

  webhookStatus: () => invoke<WebhookStatus>("webhook_status"),
  webhookPort: () => invoke<number>("webhook_port"),
  saveCredential: (
    name: string,
    value: string,
    hint?: string,
    scheme?: string
  ) =>
    invoke<void>("save_credential", {
      cmd: { name, value, hint: hint ?? null, scheme: scheme ?? null },
    }),
  deleteCredential: (name: string) =>
    invoke<void>("delete_credential", { name }),
};
