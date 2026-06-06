import { create } from "zustand";
import { api } from "../api/client";
import type { AppSettings, ChatMessage, TableSchema, ToolSpec } from "../api/types";

interface UiState {
  themeMode: "light" | "dark";
  activeView: "chat" | "tables" | "query" | "import" | "automation" | "settings";
  activeTable: string | null;
  setView: (v: UiState["activeView"]) => void;
  setActiveTable: (name: string | null) => void;
  toggleTheme: () => void;
}

interface DataState {
  tables: TableSchema[];
  refreshing: boolean;
  refreshTables: () => Promise<void>;
}

interface SettingsState {
  settings: AppSettings | null;
  loadSettings: () => Promise<void>;
  updateSettings: (s: AppSettings) => Promise<void>;
}

interface AIState {
  tools: ToolSpec[];
  messages: ChatMessage[];
  pending: boolean;
  loadTools: () => Promise<void>;
  pushMessage: (m: ChatMessage) => void;
  resetChat: () => void;
  setPending: (b: boolean) => void;
}

// "query" is intentionally not in the sidebar anymore — it remains reachable
// from inside the spreadsheet view's toolbar, but isn't a persisted default.
const ALLOWED_VIEWS = new Set<UiState["activeView"]>([
  "chat",
  "tables",
  "query",
  "import",
  "automation",
  "settings",
]);
// Only sidebar-visible views persist across restarts.
// "query" and "import" and "automation" are still reachable via deep links but not default.
const DEFAULT_VIEWS = new Set<UiState["activeView"]>([
  "tables",
  "chat",
  "settings",
]);

function loadView(): UiState["activeView"] {
  const stored = localStorage.getItem("sqlad.activeView") as UiState["activeView"] | null;
  if (stored && DEFAULT_VIEWS.has(stored)) return stored;
  void ALLOWED_VIEWS;
  return "tables";
}

export const useUi = create<UiState>((set) => ({
  themeMode: (localStorage.getItem("sqlad.theme") as "light" | "dark") || "dark",
  activeView: loadView(),
  activeTable: localStorage.getItem("sqlad.activeTable") || null,
  setView: (v) => {
    localStorage.setItem("sqlad.activeView", v);
    set({ activeView: v });
  },
  setActiveTable: (name) => {
    if (name) localStorage.setItem("sqlad.activeTable", name);
    else localStorage.removeItem("sqlad.activeTable");
    set({ activeTable: name });
  },
  toggleTheme: () =>
    set((s) => {
      const next = s.themeMode === "dark" ? "light" : "dark";
      localStorage.setItem("sqlad.theme", next);
      return { themeMode: next };
    }),
}));

export const useData = create<DataState>((set) => ({
  tables: [],
  refreshing: false,
  refreshTables: async () => {
    set({ refreshing: true });
    try {
      const tables = await api.listTables();
      set({ tables });
    } finally {
      set({ refreshing: false });
    }
  },
}));

export const useSettings = create<SettingsState>((set) => ({
  settings: null,
  loadSettings: async () => set({ settings: await api.getSettings() }),
  updateSettings: async (s) => {
    await api.saveSettings(s);
    set({ settings: s });
  },
}));

const systemPrompt: ChatMessage = {
  role: "system",
  content:
    "你是 SQLad 内置助手。用户通过你与本地 SQLite 数据库交互。" +
    "需要数据时，使用工具 `list_tables` 查看 schema，再用 `query` 执行只读 SQL（仅 SELECT/WITH/PRAGMA）。" +
    "写 SQL 时严格遵循 schema 中列出的列名，不要臆造。回答用简洁中文。",
};

export const useAI = create<AIState>((set) => ({
  tools: [],
  messages: [systemPrompt],
  pending: false,
  loadTools: async () => set({ tools: await api.listTools() }),
  pushMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  resetChat: () => set({ messages: [systemPrompt] }),
  setPending: (b) => set({ pending: b }),
}));
