import { Box, CssBaseline, IconButton, ThemeProvider, Tooltip } from "@mui/material";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { useEffect, useMemo, useState } from "react";
import { DragDropOverlay } from "./components/DragDropOverlay";
import { WelcomeDialog } from "./components/WelcomeDialog";
import { ShortcutsDialog } from "./components/ShortcutsDialog";
import { ChatPanel } from "./components/ChatPanel";
import { SpreadsheetView } from "./components/SpreadsheetView";
import { TablesEmptyState } from "./components/EmptyState";
import { SettingsDialog } from "./components/SettingsDialog";
import { useAI, useData, useSettings, useUi } from "./store";
import { useScheduler } from "./hooks/useScheduler";
import { buildTheme } from "./theme";

function App() {
  const themeMode = useUi((s) => s.themeMode);
  const activeTable = useUi((s) => s.activeTable);
  const setActiveTable = useUi((s) => s.setActiveTable);
  const theme = useMemo(() => buildTheme(themeMode), [themeMode]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const tables = useData((s) => s.tables);
  const refreshTables = useData((s) => s.refreshTables);
  const loadTools = useAI((s) => s.loadTools);
  const loadSettings = useSettings((s) => s.loadSettings);

  useEffect(() => {
    void loadTools();
    void loadSettings();
    void refreshTables();
  }, [loadTools, loadSettings, refreshTables]);

  useEffect(() => {
    if (!activeTable && tables.length > 0) setActiveTable(tables[0].name);
  }, [activeTable, tables, setActiveTable]);

  useScheduler();

  const activeSchema = tables.find((t) => t.name === activeTable);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        {/* Left: AI Chat (always visible) */}
        <Box
          sx={{
            width: "42%",
            minWidth: 360,
            maxWidth: 560,
            borderRight: 1,
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
            bgcolor: "background.paper",
          }}
        >
          <Box sx={{ position: "absolute", top: 8, right: 8, zIndex: 10 }}>
            <Tooltip title="设置">
              <IconButton size="small" onClick={() => setSettingsOpen(true)}>
                <SettingsOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <ChatPanel
            title="SQLad"
            contextHint={
              activeSchema
                ? `当前表：${activeSchema.name}（${activeSchema.columns.filter((c) => c.name !== "_id").length} 列 · ${activeSchema.row_count ?? 0} 行）\n列：${activeSchema.columns.filter((c) => c.name !== "_id").map((c) => `${c.name}:${c.type}`).join("，")}`
                : tables.length === 0
                  ? "用户还没有任何表。建议他拖个 CSV 进来、粘贴一段数据、或者说「帮我建一个 XXX 表填几行例子」。"
                  : `当前没有选中表。可用的表：${tables.map((t) => t.name).join("、")}。用户说「看 XXX 表」时提醒他点右侧表名。`
            }
            storageKey="sqlad.chat.main"
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </Box>

        {/* Right: Data (spreadsheet or empty) */}
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {activeSchema ? (
            <SpreadsheetView
              key={activeSchema.name}
              schema={activeSchema}
              onSchemaChanged={refreshTables}
            />
          ) : (
            <TablesEmptyState />
          )}
        </Box>
      </Box>

      <DragDropOverlay />
      <WelcomeDialog />
      <ShortcutsDialog />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </ThemeProvider>
  );
}

export default App;
