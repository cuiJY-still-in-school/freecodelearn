import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import PlaylistAddIcon from "@mui/icons-material/PlaylistAdd";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import ChatIcon from "@mui/icons-material/ChatBubbleOutline";
import CloseIcon from "@mui/icons-material/Close";
import RestoreIcon from "@mui/icons-material/Restore";
import GridOnIcon from "@mui/icons-material/GridOn";
import BarChartIcon from "@mui/icons-material/BarChart";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import SortIcon from "@mui/icons-material/Sort";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import StraightenIcon from "@mui/icons-material/Straighten";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile, writeFile } from "@tauri-apps/plugin-fs";
import {
  CompactSelection,
  DataEditor,
  type DataEditorRef,
  type EditableGridCell,
  type GridCell,
  GridCellKind,
  type GridColumn,
  type GridSelection,
  type Item,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { useData, useUi } from "../store";
import type { ColumnDef, ColumnType, TableSchema } from "../api/types";
import { ChatPanel, type LocalTool } from "../components/ChatPanel";
import { TablesEmptyState } from "../components/EmptyState";
import { ChartView } from "../views/ChartView";
import { CardsView } from "../views/CardsView";
import { MarkdownView } from "../views/MarkdownView";
import {
  DEFAULT_VIEW_NAME,
  emptySpec,
  emptyState,
  migrateStoredView,
  type Row,
  type TableViewState,
  type ViewContext,
  type ViewMode,
  type ViewSpec,
} from "../views/types";

const TYPE_OPTIONS: { value: ColumnType; label: string }[] = [
  { value: "text", label: "文本 (text)" },
  { value: "integer", label: "整数 (integer)" },
  { value: "real", label: "小数 (real)" },
  { value: "boolean", label: "布尔 (boolean)" },
  { value: "timestamp", label: "时间戳 (timestamp)" },
  { value: "json", label: "JSON" },
];

function loadState(table: string): TableViewState {
  try {
    const raw = localStorage.getItem(`sqlad.view.${table}`);
    if (raw) return migrateStoredView(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return emptyState();
}

function saveState(table: string, state: TableViewState) {
  try {
    localStorage.setItem(`sqlad.view.${table}`, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function quoteIdent(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

/** Standalone template renderer so exported markdown has values inlined,
 *  matching what the user saw on screen. */
function renderMarkdownForExport(
  spec: { markdown: string; title?: string },
  table: string,
  rows: Row[]
): string {
  const rowCount = rows.length;
  const evalAgg = (op: string, col: string): string => {
    const nums = rows
      .map((r) => Number(r[col]))
      .filter((n) => Number.isFinite(n));
    if (nums.length === 0) return "";
    if (op === "sum") return String(nums.reduce((a, b) => a + b, 0));
    if (op === "avg")
      return String(nums.reduce((a, b) => a + b, 0) / nums.length);
    if (op === "min") return String(Math.min(...nums));
    if (op === "max") return String(Math.max(...nums));
    if (op === "count") return String(nums.length);
    return "";
  };
  const body = spec.markdown.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr) => {
    const e = expr.trim();
    if (e === "table") return table;
    if (e === "rowCount") return String(rowCount);
    const agg = e.match(/^(sum|avg|min|max|count):(.+)$/);
    if (agg) return evalAgg(agg[1], agg[2].trim());
    const dot = e.match(/^rows\.(\d+)\.(.+)$/);
    if (dot) {
      const i = Number(dot[1]);
      const k = dot[2];
      const v = rows[i]?.[k];
      if (v === undefined || v === null) return "";
      return typeof v === "object" ? JSON.stringify(v) : String(v);
    }
    return `{{${e}}}`;
  });
  const title = spec.title ? `# ${spec.title}\n\n` : "";
  return title + body;
}

function isSafeWhere(s: string): boolean {
  if (s.includes(";")) return false;
  const lower = s.toLowerCase();
  const banned = [
    "insert ",
    "update ",
    "delete ",
    "drop ",
    "alter ",
    "attach ",
    "detach ",
    "pragma ",
    "create ",
    "--",
    "/*",
  ];
  return !banned.some((b) => lower.includes(b));
}

export function TablesPage() {
  const tables = useData((s) => s.tables);
  const refresh = useData((s) => s.refreshTables);
  const refreshing = useData((s) => s.refreshing);
  const active = useUi((s) => s.activeTable);
  const setActive = useUi((s) => s.setActiveTable);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!active && tables.length > 0) setActive(tables[0].name);
  }, [active, tables, setActive]);

  const activeSchema = tables.find((t) => t.name === active);

  // Empty-state onboarding (no tables yet) — give the user the three primary
  // entry points and a list of AI prompts to copy.
  if (tables.length === 0) {
    return <TablesEmptyState />;
  }

  return (
    <Stack direction="row" sx={{ height: "100%" }}>
      <Box
        sx={{
          width: 240,
          borderRight: 1,
          borderColor: "divider",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2, py: 1.4 }}
        >
          <Typography variant="overline" color="text.secondary">
            表 ({tables.length})
          </Typography>
          <Tooltip title="刷新">
            <span>
              <IconButton size="small" onClick={() => void refresh()}>
                {refreshing ? (
                  <CircularProgress size={14} />
                ) : (
                  <RefreshIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
        <Divider />
        <List dense sx={{ flex: 1, overflowY: "auto" }}>
          {tables.length === 0 && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ px: 2, py: 1.4 }}
            >
              还没有表。去「导入」加点数据，或让 AI 帮你建一个。
            </Typography>
          )}
          {tables.map((t) => (
            <ListItemButton
              key={t.name}
              selected={t.name === active}
              onClick={() => setActive(t.name)}
            >
              <TableChartOutlinedIcon
                sx={{ fontSize: 16, mr: 1, color: "text.secondary" }}
              />
              <ListItemText
                primary={t.name}
                primaryTypographyProps={{ fontSize: 13.5, fontWeight: 500 }}
                secondary={`${t.columns.filter((c) => c.name !== "_id").length} 列 · ${t.row_count ?? 0} 行`}
                secondaryTypographyProps={{ fontSize: 11.5 }}
              />
            </ListItemButton>
          ))}
        </List>
      </Box>

      {activeSchema ? (
        <SpreadsheetView
          key={activeSchema.name}
          schema={activeSchema}
          onSchemaChanged={refresh}
        />
      ) : (
        <Stack
          sx={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            color: "text.secondary",
          }}
        >
          <Typography>选择左侧一个表打开</Typography>
        </Stack>
      )}
    </Stack>
  );
}

function SpreadsheetView({
  schema,
  onSchemaChanged,
}: {
  schema: TableSchema;
  onSchemaChanged: () => Promise<void> | void;
}) {
  const muiTheme = useTheme();
  const editorRef = useRef<DataEditorRef>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [colDialog, setColDialog] = useState(false);
  const [selection, setSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  const setView = useUi((s) => s.setView);

  const [chatOpen, setChatOpen] = useState<boolean>(() => {
    return localStorage.getItem("sqlad.tablechat.open") !== "0";
  });
  useEffect(() => {
    localStorage.setItem("sqlad.tablechat.open", chatOpen ? "1" : "0");
  }, [chatOpen]);

  const [chatWidth, setChatWidth] = useState<number>(() => {
    const v = Number(localStorage.getItem("sqlad.tablechat.width") || "320");
    return Number.isFinite(v) && v >= 240 && v <= 720 ? v : 320;
  });
  useEffect(() => {
    localStorage.setItem("sqlad.tablechat.width", String(chatWidth));
  }, [chatWidth]);
  const dragStateRef = useRef<{ startX: number; startW: number } | null>(null);
  const onDragHandleDown = useCallback(
    (e: React.MouseEvent) => {
      dragStateRef.current = { startX: e.clientX, startW: chatWidth };
      const move = (ev: MouseEvent) => {
        const st = dragStateRef.current;
        if (!st) return;
        const dx = st.startX - ev.clientX; // drag-left grows the dock
        const next = Math.max(240, Math.min(720, st.startW + dx));
        setChatWidth(next);
      };
      const up = () => {
        dragStateRef.current = null;
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        document.body.style.cursor = "";
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      document.body.style.cursor = "col-resize";
      e.preventDefault();
    },
    [chatWidth]
  );

  const [state, setState] = useState<TableViewState>(() =>
    loadState(schema.name)
  );
  useEffect(() => {
    saveState(schema.name, state);
  }, [schema.name, state]);

  // Convenience: the currently active spec (always present — invariant).
  const activeName = state.active in state.views ? state.active : DEFAULT_VIEW_NAME;
  const spec: ViewSpec = state.views[activeName] ?? emptySpec();

  // Helper to update the active spec.
  const setSpec = useCallback(
    (updater: (s: ViewSpec) => ViewSpec) => {
      setState((prev) => {
        const name = prev.active in prev.views ? prev.active : DEFAULT_VIEW_NAME;
        const current = prev.views[name] ?? emptySpec();
        return {
          ...prev,
          active: name,
          views: { ...prev.views, [name]: updater(current) },
        };
      });
    },
    []
  );

  const [activeCell, setActiveCell] = useState<Item | null>(null);

  const rawDataCols = useMemo(
    () => schema.columns.filter((c) => c.name !== "_id"),
    [schema]
  );

  const dataCols = useMemo(() => {
    const byName = new Map(rawDataCols.map((c) => [c.name, c]));
    const ordered: ColumnDef[] = [];
    for (const name of spec.order) {
      const c = byName.get(name);
      if (c) {
        ordered.push(c);
        byName.delete(name);
      }
    }
    for (const c of rawDataCols) {
      if (byName.has(c.name)) ordered.push(c);
    }
    return ordered.filter((c) => !spec.hidden.includes(c.name));
  }, [rawDataCols, spec.order, spec.hidden]);

  const reloadRows = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      let sql = `SELECT * FROM ${quoteIdent(schema.name)}`;
      if (spec.filter && isSafeWhere(spec.filter)) {
        sql += ` WHERE ${spec.filter}`;
      }
      if (spec.sort) {
        sql += ` ORDER BY ${quoteIdent(spec.sort.column)} ${
          spec.sort.direction === "desc" ? "DESC" : "ASC"
        }, _id`;
      } else {
        sql += ` ORDER BY _id`;
      }
      const r = await api.runQuery(sql);
      const idIdx = r.columns.indexOf("_id");
      setRows(
        r.rows.map((row, i) => {
          const obj: Record<string, unknown> = {
            _id: idIdx >= 0 ? Number(row[idIdx]) : i + 1,
          };
          r.columns.forEach((c, j) => (obj[c] = row[j]));
          return obj as Row;
        })
      );
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, [schema.name, spec.filter, spec.sort]);

  useEffect(() => {
    void reloadRows();
  }, [reloadRows]);

  const columns: GridColumn[] = useMemo(
    () =>
      dataCols.map((c) => {
        const defaultWidth =
          c.type === "boolean"
            ? 80
            : c.type === "integer"
              ? 100
              : c.type === "real"
                ? 110
                : c.type === "timestamp"
                  ? 170
                  : 160;
        return {
          id: c.name,
          title: c.name,
          width: spec.widths[c.name] ?? defaultWidth,
        };
      }),
    [dataCols, spec.widths]
  );

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const c = dataCols[col];
      const r = rows[row];
      const raw = r?.[c?.name ?? ""];
      const cellType = c?.type ?? "text";

      if (cellType === "boolean") {
        const b =
          raw === true ||
          raw === 1 ||
          raw === "1" ||
          raw === "true" ||
          raw === "TRUE";
        const isNull = raw === null || raw === undefined;
        return {
          kind: GridCellKind.Boolean,
          data: isNull ? false : b,
          allowOverlay: false,
        };
      }

      const isNum = cellType === "integer" || cellType === "real";
      let text: string;
      let display: string;
      if (raw === null || raw === undefined) {
        text = "";
        display = "";
      } else if (typeof raw === "object") {
        text = JSON.stringify(raw);
        display = text;
      } else {
        text = String(raw);
        display = text;
      }
      // For numbers, render with thousand separators + reasonable decimals;
      // we keep `data` as the raw string so editing/copy stays clean.
      if (isNum && text !== "") {
        const n = Number(text);
        if (Number.isFinite(n)) {
          display =
            cellType === "integer"
              ? n.toLocaleString("en-US", { maximumFractionDigits: 0 })
              : n.toLocaleString("en-US", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 4,
                });
        }
      }
      // We deliberately disable Glide's inline overlay editor because it has
      // focus issues in WebKit2GTK; editing is delegated to a MUI Dialog via
      // onCellActivated below for a reliable cross-webview path.
      return {
        kind: GridCellKind.Text,
        data: text,
        displayData: display,
        allowOverlay: false,
        contentAlign: isNum ? "right" : undefined,
      };
    },
    [dataCols, rows]
  );

  const onCellEdited = useCallback(
    (cell: Item, newValue: EditableGridCell) => {
      const [col, row] = cell;
      const c = dataCols[col];
      const r = rows[row];
      if (!c || !r) return;
      let value: unknown;
      if (newValue.kind === GridCellKind.Boolean) {
        value = newValue.data;
      } else if (newValue.kind === GridCellKind.Text) {
        if (newValue.data === "") {
          value = null;
        } else if (c.type === "integer") {
          const n = Number(newValue.data);
          value = Number.isFinite(n) ? Math.trunc(n) : newValue.data;
        } else if (c.type === "real") {
          const n = Number(newValue.data);
          value = Number.isFinite(n) ? n : newValue.data;
        } else {
          value = newValue.data;
        }
      } else {
        return;
      }
      const previous = r[c.name];
      setRows((prev) => {
        const next = [...prev];
        next[row] = { ...r, [c.name]: value };
        return next;
      });
      api.updateCell(schema.name, r._id, c.name, value).catch((e) => {
        setErr(
          `更新 ${c.name} 失败：${e instanceof Error ? e.message : String(e)}`
        );
        setRows((prev) => {
          const next = [...prev];
          next[row] = { ...r, [c.name]: previous };
          return next;
        });
      });
    },
    [dataCols, rows, schema.name]
  );

  const onColumnResize = useCallback(
    (column: GridColumn, newSize: number) => {
      const id = column.id ?? column.title;
      setSpec((s) => ({ ...s, widths: { ...s.widths, [id]: newSize } }));
    },
    [setSpec]
  );

  async function addRow() {
    try {
      const newId = await api.insertBlankRow(schema.name);
      const blank: Row = { _id: newId };
      dataCols.forEach((c) => (blank[c.name] = null));
      setRows((prev) => [...prev, blank]);
      await onSchemaChanged();
      setTimeout(() => {
        editorRef.current?.scrollTo(
          0,
          rows.length,
          "both",
          undefined,
          undefined,
          { vAlign: "end" }
        );
      }, 0);
    } catch (e) {
      setErr(String(e));
    }
  }

  async function deleteSelectedRows() {
    const indices: number[] = [];
    selection.rows.toArray().forEach((i) => indices.push(i));
    if (indices.length === 0) return;
    const ids = indices
      .map((i) => rows[i]?._id)
      .filter((x): x is number => typeof x === "number");
    if (ids.length === 0) return;
    if (!confirm(`删除选中的 ${ids.length} 行？`)) return;
    try {
      await api.deleteRows(schema.name, ids);
      setRows((prev) => prev.filter((r) => !ids.includes(r._id)));
      setSelection({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
      });
      await onSchemaChanged();
    } catch (e) {
      setErr(String(e));
    }
  }

  async function dropTable() {
    if (!confirm(`删除整个表 ${schema.name}？数据将永久丢失。`)) return;
    try {
      await api.dropTable(schema.name);
      await onSchemaChanged();
    } catch (e) {
      setErr(String(e));
    }
  }

  function getChartSvg(): { clone: SVGElement; xml: string; width: number; height: number } | null {
    const root = chartContainerRef.current;
    const svg = root?.querySelector("svg");
    if (!svg) return null;
    const clone = svg.cloneNode(true) as SVGElement;
    const bbox = (svg as SVGSVGElement).getBoundingClientRect();
    const w = Math.max(1, Math.round(bbox.width));
    const h = Math.max(1, Math.round(bbox.height));
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    if (!clone.getAttribute("width")) clone.setAttribute("width", String(w));
    if (!clone.getAttribute("height")) clone.setAttribute("height", String(h));
    const xml = new XMLSerializer().serializeToString(clone);
    return { clone, xml, width: w, height: h };
  }

  async function exportChartSvg() {
    const got = getChartSvg();
    if (!got) {
      setErr("找不到图表 SVG，等图表渲染完成再导出");
      return;
    }
    const out = `<?xml version="1.0" encoding="UTF-8"?>\n` + got.xml;
    const fileBase = (
      (spec.chart?.title ?? `${schema.name}-${activeName}`).replace(
        /[\\/:*?"<>|]+/g,
        "_"
      ) || `${schema.name}-${activeName}`
    ).trim();
    const path = await saveDialog({
      defaultPath: `${fileBase}.svg`,
      filters: [{ name: "SVG", extensions: ["svg"] }],
    });
    if (!path) return;
    await writeTextFile(path, out);
  }

  async function exportChartPng(scale = 2) {
    const got = getChartSvg();
    if (!got) {
      setErr("找不到图表 SVG，等图表渲染完成再导出");
      return;
    }
    // Render SVG into a high-DPI canvas, then read as PNG bytes.
    const blob = new Blob([got.xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      const loaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(new Error(String(e)));
      });
      img.src = url;
      await loaded;
      const canvas = document.createElement("canvas");
      canvas.width = got.width * scale;
      canvas.height = got.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("无法创建 canvas context");
      ctx.fillStyle = muiTheme.palette.background.default;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pngBlob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob 失败"))),
          "image/png"
        )
      );
      const buf = new Uint8Array(await pngBlob.arrayBuffer());
      const fileBase = (
        (spec.chart?.title ?? `${schema.name}-${activeName}`).replace(
          /[\\/:*?"<>|]+/g,
          "_"
        ) || `${schema.name}-${activeName}`
      ).trim();
      const path = await saveDialog({
        defaultPath: `${fileBase}.png`,
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!path) return;
      await writeFile(path, buf);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function exportCurrentView() {
    try {
      if (spec.mode === "chart") {
        // Caller should use exportChartSvg / exportChartPng explicitly via the
        // export menu. Fall back to SVG here for safety.
        await exportChartSvg();
        return;
      }
      if (spec.mode === "spreadsheet") {
        // CSV from current rows + visible columns (respect hidden/order).
        const cols = dataCols.map((c) => c.name);
        const escapeCsv = (v: unknown): string => {
          if (v === null || v === undefined) return "";
          const s = typeof v === "object" ? JSON.stringify(v) : String(v);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lines = [cols.map(escapeCsv).join(",")];
        for (const r of rows) {
          lines.push(cols.map((c) => escapeCsv(r[c])).join(","));
        }
        const csv = lines.join("\n");
        const path = await saveDialog({
          defaultPath: `${schema.name}.csv`,
          filters: [{ name: "CSV", extensions: ["csv"] }],
        });
        if (!path) return;
        await writeTextFile(path, csv);
      } else if (spec.mode === "markdown" && spec.markdown) {
        // Render templates against current rows, write final markdown.
        const md = renderMarkdownForExport(spec.markdown, schema.name, rows);
        const fileName = (spec.markdown.title ?? `${schema.name}-${activeName}`)
          .replace(/[\\/:*?"<>|]+/g, "_")
          .trim() || `${schema.name}-${activeName}`;
        const path = await saveDialog({
          defaultPath: `${fileName}.md`,
          filters: [{ name: "Markdown", extensions: ["md"] }],
        });
        if (!path) return;
        await writeTextFile(path, md);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  // ---- AI local tools ----
  const localTools: LocalTool[] = useMemo(() => {
    const validCols = new Set(rawDataCols.map((c) => c.name));
    const applyPatch = (
      base: ViewSpec,
      a: Partial<ViewSpec & { reset?: boolean }>
    ): ViewSpec => {
      if (a.reset) return emptySpec();
      const next: ViewSpec = { ...base };
      if (typeof a.mode === "string") next.mode = a.mode;
      if (Array.isArray(a.hidden))
        next.hidden = a.hidden.filter((c) => validCols.has(c));
      if (Array.isArray(a.order))
        next.order = a.order.filter((c) => validCols.has(c));
      if (a.widths && typeof a.widths === "object") {
        const merged = { ...base.widths };
        for (const [k, v] of Object.entries(a.widths)) {
          if (validCols.has(k) && typeof v === "number" && v > 30) {
            merged[k] = v;
          }
        }
        next.widths = merged;
      }
      if (a.sort === null) next.sort = null;
      else if (a.sort && validCols.has(a.sort.column))
        next.sort = {
          column: a.sort.column,
          direction: a.sort.direction === "desc" ? "desc" : "asc",
        };
      if (typeof a.filter === "string") {
        const t = a.filter.trim();
        if (t === "") next.filter = null;
        else if (isSafeWhere(t)) next.filter = t;
        else throw new Error("filter 不安全：禁止 ; 和 DDL/DML 关键字");
      }
      if (a.chart) {
        next.chart = {
          type: a.chart.type,
          x: a.chart.x,
          y: Array.isArray(a.chart.y) ? a.chart.y : [],
          series: a.chart.series ?? null,
          agg: a.chart.agg ?? "none",
          stacked: !!a.chart.stacked,
          title: a.chart.title,
        };
        if (!a.mode) next.mode = "chart";
      }
      if (a.cards) {
        next.cards = {
          title: a.cards.title,
          subtitle: a.cards.subtitle ?? null,
          fields: a.cards.fields ?? [],
          groupBy: a.cards.groupBy ?? null,
          badge: a.cards.badge ?? null,
        };
        if (!a.mode) next.mode = "cards";
      }
      if (a.markdown) {
        next.markdown = {
          markdown: String(a.markdown.markdown),
          title: a.markdown.title,
        };
        if (!a.mode) next.mode = "markdown";
      }
      return next;
    };

    const setViewTool: LocalTool = {
      spec: {
        name: "set_view",
        description:
          "修改用户当前正在看的命名视图（不改 SQLite 数据，只改前端呈现）。" +
          "若想新建一个视图，先调用 save_view 起名，再用 set_view 改它。" +
          "支持切换呈现模式（spreadsheet/chart/cards/markdown），隐藏列、改列顺序/宽度、按列排序、按 SQL WHERE 筛选行。" +
          "切到 chart 时给 chart={type,x,y,...}；cards 给 cards={title,...}；markdown 给 markdown={markdown,title?}。" +
          "Markdown 视图安全渲染（无 <script>/<iframe>），但支持模板：{{table}} {{rowCount}} {{sum:col}} {{avg:col}} {{rows.0.col}}。",
        parameters: {
          type: "object",
          properties: {
            view: {
              type: "string",
              description: "目标视图名；缺省=当前活动视图",
            },
            mode: {
              type: "string",
              enum: ["spreadsheet", "chart", "cards", "markdown"],
            },
            hidden: { type: "array", items: { type: "string" } },
            order: { type: "array", items: { type: "string" } },
            widths: {
              type: "object",
              additionalProperties: { type: "number" },
            },
            sort: {
              type: "object",
              properties: {
                column: { type: "string" },
                direction: { type: "string", enum: ["asc", "desc"] },
              },
              required: ["column", "direction"],
            },
            filter: {
              type: "string",
              description: "SQL WHERE 子句（不带 WHERE）。空清除。禁止 ; 和 DDL/DML",
            },
            chart: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["bar", "line", "area", "scatter", "pie"],
                },
                x: { type: "string" },
                y: { type: "array", items: { type: "string" } },
                series: { type: "string" },
                agg: {
                  type: "string",
                  enum: ["none", "sum", "avg", "count", "min", "max"],
                },
                stacked: { type: "boolean" },
                title: { type: "string" },
              },
              required: ["type", "x", "y"],
            },
            cards: {
              type: "object",
              properties: {
                title: { type: "string" },
                subtitle: { type: "string" },
                fields: { type: "array", items: { type: "string" } },
                groupBy: { type: "string" },
                badge: { type: "string" },
              },
              required: ["title"],
            },
            markdown: {
              type: "object",
              properties: {
                markdown: {
                  type: "string",
                  description:
                    "Markdown 源码。可嵌入模板 {{table}}/{{rowCount}}/{{sum:col}}/{{avg:col}}/{{rows.0.col}}",
                },
                title: { type: "string" },
              },
              required: ["markdown"],
            },
            reset: { type: "boolean" },
          },
        },
      },
      invoke: (args: unknown) => {
        const a = (args ?? {}) as Partial<
          ViewSpec & { view?: string; reset?: boolean }
        >;
        let targetName: string | null = null;
        setState((prev) => {
          const name =
            (typeof a.view === "string" && a.view) ||
            (prev.active in prev.views ? prev.active : DEFAULT_VIEW_NAME);
          targetName = name;
          const current = prev.views[name] ?? emptySpec();
          return {
            ...prev,
            active: name,
            views: { ...prev.views, [name]: applyPatch(current, a) },
          };
        });
        return { ok: true, view: targetName, applied: { ...a } };
      },
    };

    const saveViewTool: LocalTool = {
      spec: {
        name: "save_view",
        description:
          "在当前表上新建（或覆盖）一个命名视图。常用流程：用户说『做一个销售总览』，先 save_view({name:\"销售总览\"}) 创建，再 set_view({view:\"销售总览\", mode:\"markdown\", markdown:{...}}) 配置。" +
          "如果带 spec，会用 spec 初始化；否则用当前活动视图的副本初始化。",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "视图名（唯一，会成为 tab 标签）" },
            spec: {
              type: "object",
              description:
                "可选：完整的 ViewSpec（{mode, chart?, cards?, markdown?, hidden?, sort?, filter?, ...}）",
            },
            activate: {
              type: "boolean",
              description: "是否切换到这个视图（默认 true）",
            },
          },
          required: ["name"],
        },
      },
      invoke: (args: unknown) => {
        const a = (args ?? {}) as {
          name?: string;
          spec?: Partial<ViewSpec>;
          activate?: boolean;
        };
        if (!a.name || !a.name.trim()) throw new Error("name 不能为空");
        const name = a.name.trim();
        const activate = a.activate !== false;
        setState((prev) => {
          const seed = a.spec
            ? applyPatch(emptySpec(), a.spec as Partial<ViewSpec>)
            : { ...(prev.views[prev.active] ?? emptySpec()) };
          return {
            active: activate ? name : prev.active,
            views: { ...prev.views, [name]: seed },
          };
        });
        return { ok: true, view: name };
      },
    };

    const switchViewTool: LocalTool = {
      spec: {
        name: "switch_view",
        description: "切换到一个已存在的命名视图",
        parameters: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
      },
      invoke: (args: unknown) => {
        const a = (args ?? {}) as { name?: string };
        if (!a.name) throw new Error("name 不能为空");
        let ok = false;
        setState((prev) => {
          if (!(a.name! in prev.views)) return prev;
          ok = true;
          return { ...prev, active: a.name! };
        });
        if (!ok) throw new Error(`视图 ${a.name} 不存在`);
        return { ok: true, view: a.name };
      },
    };

    const deleteViewTool: LocalTool = {
      spec: {
        name: "delete_view",
        description:
          "删除一个命名视图。不允许删默认视图；如果删的是当前活动视图，会切到默认视图。",
        parameters: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
      },
      invoke: (args: unknown) => {
        const a = (args ?? {}) as { name?: string };
        if (!a.name) throw new Error("name 不能为空");
        if (a.name === DEFAULT_VIEW_NAME)
          throw new Error("不能删除默认视图");
        setState((prev) => {
          if (!(a.name! in prev.views)) return prev;
          const next = { ...prev.views };
          delete next[a.name!];
          return {
            active: prev.active === a.name ? DEFAULT_VIEW_NAME : prev.active,
            views: next,
          };
        });
        return { ok: true };
      },
    };

    const listViewsTool: LocalTool = {
      spec: {
        name: "list_views",
        description: "列出当前表上的所有命名视图",
        parameters: { type: "object", properties: {} },
      },
      invoke: () => ({
        active: state.active,
        views: Object.entries(state.views).map(([name, s]) => ({
          name,
          mode: s.mode,
          hasChart: !!s.chart,
          hasCards: !!s.cards,
          hasMarkdown: !!s.markdown,
        })),
      }),
    };

    return [setViewTool, saveViewTool, switchViewTool, deleteViewTool, listViewsTool];
  }, [rawDataCols, state, setSpec]);

  const isDark = muiTheme.palette.mode === "dark";
  const gridTheme = isDark
    ? {
        accentColor: "#3b82f6",
        accentLight: "rgba(59,130,246,0.18)",
        textDark: "#e6e8eb",
        textMedium: "#b6bcc4",
        textLight: "#8b929a",
        textBubble: "#e6e8eb",
        bgIconHeader: "#8b929a",
        fgIconHeader: "#e6e8eb",
        textHeader: "#e6e8eb",
        textHeaderSelected: "#ffffff",
        bgCell: "#0e1116",
        bgCellMedium: "#161a22",
        bgHeader: "#1a1f29",
        bgHeaderHasFocus: "#222836",
        bgHeaderHovered: "#1f2532",
        bgBubble: "#1a1f29",
        bgBubbleSelected: "#3b82f6",
        bgSearchResult: "rgba(59,130,246,0.18)",
        borderColor: "rgba(255,255,255,0.07)",
        drilldownBorder: "rgba(255,255,255,0.12)",
        linkColor: "#60a5fa",
        cellHorizontalPadding: 10,
        cellVerticalPadding: 4,
        headerFontStyle: "600 12.5px",
        baseFontStyle: "12.5px",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      }
    : {
        accentColor: "#3b82f6",
        accentLight: "rgba(59,130,246,0.12)",
        textDark: "#1c2229",
        textMedium: "#4b5560",
        textLight: "#7b8794",
        textBubble: "#1c2229",
        bgIconHeader: "#7b8794",
        fgIconHeader: "#ffffff",
        textHeader: "#1c2229",
        textHeaderSelected: "#1c2229",
        bgCell: "#ffffff",
        bgCellMedium: "#f8f9fb",
        bgHeader: "#f3f5f8",
        bgHeaderHasFocus: "#e7ebf1",
        bgHeaderHovered: "#eaedf1",
        bgBubble: "#eef2f7",
        bgBubbleSelected: "#3b82f6",
        bgSearchResult: "rgba(59,130,246,0.18)",
        borderColor: "rgba(0,0,0,0.07)",
        drilldownBorder: "rgba(0,0,0,0.12)",
        linkColor: "#1d4ed8",
        cellHorizontalPadding: 10,
        cellVerticalPadding: 4,
        headerFontStyle: "600 12.5px",
        baseFontStyle: "12.5px",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      };

  let formula = "";
  if (activeCell) {
    const [c, r] = activeCell;
    const cn = dataCols[c]?.name;
    const v = cn && rows[r] ? rows[r][cn] : undefined;
    formula =
      v === null || v === undefined
        ? ""
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v);
  }
  const selectedRowCount = selection.rows.length;

  // Aggregate stats for the current cell-range selection (Excel-style status bar).
  const selectionStats = useMemo(() => {
    let cellCount = 0;
    const nums: number[] = [];
    const range = selection.current?.range;
    if (range) {
      for (let r = range.y; r < range.y + range.height; r++) {
        const row = rows[r];
        if (!row) continue;
        for (let c = range.x; c < range.x + range.width; c++) {
          const col = dataCols[c];
          if (!col) continue;
          cellCount++;
          const v = row[col.name];
          if (v === null || v === undefined || v === "") continue;
          const n = Number(v);
          if (Number.isFinite(n) && typeof v !== "boolean") nums.push(n);
        }
      }
    }
    if (nums.length === 0) return { cellCount, nums: 0 } as const;
    const sum = nums.reduce((a, b) => a + b, 0);
    return {
      cellCount,
      nums: nums.length,
      sum,
      avg: sum / nums.length,
      min: Math.min(...nums),
      max: Math.max(...nums),
    } as const;
  }, [selection, rows, dataCols]);

  function fmtNum(n: number): string {
    return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  }

  const viewCtx: ViewContext = useMemo(
    () => ({ schemaName: schema.name, rawDataCols, rows }),
    [schema.name, rawDataCols, rows]
  );

  const contextHint = useMemo(() => {
    const cols = rawDataCols.map((c) => `- ${c.name}: ${c.type}`).join("\n");
    const hidden =
      spec.hidden.length > 0 ? spec.hidden.join(", ") : "(无)";
    const sortStr = spec.sort
      ? `${spec.sort.column} ${spec.sort.direction}`
      : "(无)";
    const filterStr = spec.filter ?? "(无)";
    const viewList = Object.keys(state.views).join(", ");
    return [
      `用户当前正在查看 SQLite 表 \`${schema.name}\`（${rows.length} 行可见）。`,
      `这张表的列：\n${cols}`,
      `已有命名视图：${viewList}（当前活动：${state.active}，模式：${spec.mode}）。`,
      `当前视图状态 — 隐藏列：${hidden} · 排序：${sortStr} · 筛选：${filterStr}`,
      `**关键：你可以创建并维护多个命名视图。** 用户说"做一个 X"，倾向于 \`save_view({name:"X"})\` 新建，再 \`set_view({view:"X", ...})\` 配置。`,
      `用户说"画图/柱状图/趋势" → set_view mode=chart + chart 配置。`,
      `用户说"看板/卡片/分组" → set_view mode=cards + cards 配置。`,
      `用户说"报告/总结/dashboard/写一段说明" → set_view mode=markdown + markdown 配置。Markdown 支持模板：{{table}} {{rowCount}} {{sum:units}} {{avg:revenue}} {{rows.0.product}}。`,
      `用户说"切到 X 视图"/"看 X" → switch_view。"删掉 X" → delete_view。"列出所有视图" → list_views。`,
      `优先直接调工具改 UI，不要只回长文字。`,
    ].join("\n\n");
  }, [schema.name, rawDataCols, spec, state, rows.length]);

  const viewNames = Object.keys(state.views);
  const [renameOpen, setRenameOpen] = useState<{ name: string } | null>(null);
  const [tabMenu, setTabMenu] = useState<{ el: HTMLElement; name: string } | null>(null);

  // Column header context menu state.
  const [colMenu, setColMenu] = useState<{
    x: number;
    y: number;
    col: ColumnDef;
  } | null>(null);
  const [renameColOpen, setRenameColOpen] = useState<{ from: string } | null>(null);

  // Cell-edit dialog state (Excel-style modal editor).
  const [cellEdit, setCellEdit] = useState<{
    row: number;
    col: number;
    initial: unknown;
    prefix?: string; // optional first char if entry was triggered by typing
  } | null>(null);

  // Used to grab the chart's <svg> element for export.
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [exportMenu, setExportMenu] = useState<HTMLElement | null>(null);

  const beginCellEdit = useCallback(
    (cell: Item, prefix?: string) => {
      const [col, row] = cell;
      const c = dataCols[col];
      const r = rows[row];
      if (!c || !r) return;
      if (c.type === "boolean") {
        // Boolean cells toggle on click via Glide; pressing Enter flips them too.
        const cur = r[c.name];
        const next = !(cur === true || cur === 1 || cur === "1");
        onCellEdited(cell, {
          kind: GridCellKind.Boolean,
          data: next,
          allowOverlay: false,
        });
        return;
      }
      setCellEdit({ row, col, initial: r[c.name], prefix });
    },
    [dataCols, rows, onCellEdited]
  );

  return (
    <Stack direction="row" sx={{ flex: 1, minWidth: 0, height: "100%" }}>
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {/* Header: title + counts + actions */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
          sx={{
            px: 2.5,
            py: 1.2,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Stack direction="row" alignItems="baseline" spacing={1}>
            <Typography variant="h6">{schema.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {dataCols.length}/{rawDataCols.length} 列 · {rows.length} 行
              {spec.filter ? " · 已筛选" : ""}
              {spec.sort ? ` · 按 ${spec.sort.column} ${spec.sort.direction}` : ""}
            </Typography>
          </Stack>
          <Stack
            direction="row"
            spacing={0.3}
            alignItems="center"
            sx={{ flexShrink: 0 }}
          >
            <Tooltip title="新增行">
              <IconButton size="small" onClick={() => void addRow()}>
                <PlaylistAddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="新增列">
              <IconButton size="small" onClick={() => setColDialog(true)}>
                <ViewColumnIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip
              title={
                selectedRowCount > 0
                  ? `删除选中 ${selectedRowCount} 行`
                  : "删除选中（请先勾选行）"
              }
            >
              <span>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => void deleteSelectedRows()}
                  disabled={selectedRowCount === 0}
                >
                  <DeleteOutlineIcon fontSize="small" />
                  {selectedRowCount > 0 && (
                    <Typography
                      component="span"
                      sx={{ ml: 0.4, fontSize: 11 }}
                    >
                      {selectedRowCount}
                    </Typography>
                  )}
                </IconButton>
              </span>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            {(spec.hidden.length > 0 ||
              spec.sort ||
              spec.filter ||
              spec.order.length > 0) && (
              <Tooltip title="重置视图（保留列宽）">
                <IconButton
                  size="small"
                  onClick={() =>
                    setSpec((s) => ({
                      ...emptySpec(),
                      widths: s.widths,
                    }))
                  }
                >
                  <RestoreIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="重新加载">
              <span>
                <IconButton
                  size="small"
                  onClick={() => void reloadRows()}
                  disabled={loading}
                >
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip
              title={
                spec.mode === "spreadsheet"
                  ? "导出 CSV"
                  : spec.mode === "markdown"
                    ? "导出 Markdown"
                    : spec.mode === "chart"
                      ? "导出 SVG / PNG"
                      : "导出 (cards 暂不支持)"
              }
            >
              <span>
                <IconButton
                  size="small"
                  disabled={
                    spec.mode !== "spreadsheet" &&
                    spec.mode !== "markdown" &&
                    spec.mode !== "chart"
                  }
                  onClick={(e) => {
                    if (spec.mode === "chart") {
                      setExportMenu(e.currentTarget);
                    } else {
                      void exportCurrentView();
                    }
                  }}
                >
                  <FileDownloadOutlinedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Menu
              anchorEl={exportMenu}
              open={!!exportMenu}
              onClose={() => setExportMenu(null)}
            >
              <MenuItem
                onClick={() => {
                  setExportMenu(null);
                  void exportChartSvg();
                }}
              >
                <FileDownloadOutlinedIcon sx={{ fontSize: 16, mr: 1 }} /> 导出 SVG (矢量)
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setExportMenu(null);
                  void exportChartPng(2);
                }}
              >
                <FileDownloadOutlinedIcon sx={{ fontSize: 16, mr: 1 }} /> 导出 PNG (2x)
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setExportMenu(null);
                  void exportChartPng(3);
                }}
              >
                <FileDownloadOutlinedIcon sx={{ fontSize: 16, mr: 1 }} /> 导出 PNG (3x)
              </MenuItem>
            </Menu>
            <Tooltip title="SQL 编辑器">
              <IconButton size="small" onClick={() => setView("query")}>
                <Typography sx={{ fontSize: 11, fontWeight: 600 }}>
                  SQL
                </Typography>
              </IconButton>
            </Tooltip>
            <Tooltip title={chatOpen ? "收起 AI 面板" : "打开 AI 面板"}>
              <IconButton
                size="small"
                color={chatOpen ? "primary" : "default"}
                onClick={() => setChatOpen((v) => !v)}
              >
                {chatOpen ? (
                  <CloseIcon fontSize="small" />
                ) : (
                  <ChatIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
            <Tooltip title="删除整个表">
              <IconButton
                size="small"
                color="error"
                onClick={() => void dropTable()}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        {/* Named-view sheet tabs (Excel-like) */}
        <Stack
          direction="row"
          alignItems="center"
          sx={{
            px: 1.2,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: isDark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)",
          }}
        >
          <Tabs
            value={activeName}
            onChange={(_, v) =>
              setState((prev) => ({ ...prev, active: String(v) }))
            }
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 32,
              flex: 1,
              "& .MuiTab-root": {
                minHeight: 32,
                textTransform: "none",
                fontSize: 12.5,
                py: 0.5,
                px: 1.4,
                minWidth: 0,
              },
              "& .MuiTabs-indicator": { height: 2 },
            }}
          >
            {viewNames.map((name) => (
              <Tab
                key={name}
                value={name}
                label={
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={0.6}
                    sx={{ minWidth: 0 }}
                  >
                    <span>{name}</span>
                    {state.views[name]?.mode === "chart" && (
                      <BarChartIcon sx={{ fontSize: 13, opacity: 0.7 }} />
                    )}
                    {state.views[name]?.mode === "cards" && (
                      <ViewModuleIcon sx={{ fontSize: 13, opacity: 0.7 }} />
                    )}
                    {state.views[name]?.mode === "markdown" && (
                      <ArticleOutlinedIcon
                        sx={{ fontSize: 13, opacity: 0.7 }}
                      />
                    )}
                    {state.views[name]?.mode === "spreadsheet" && (
                      <GridOnIcon sx={{ fontSize: 13, opacity: 0.7 }} />
                    )}
                    {name === activeName && (
                      <IconButton
                        size="small"
                        component="span"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTabMenu({ el: e.currentTarget, name });
                        }}
                        sx={{ p: 0.2 }}
                      >
                        <MoreVertIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                  </Stack>
                }
              />
            ))}
          </Tabs>
          <Tooltip title="新建视图">
            <IconButton
              size="small"
              onClick={() => {
                let n = 1;
                while (state.views[`视图 ${n}`]) n++;
                const name = `视图 ${n}`;
                setState((prev) => ({
                  active: name,
                  views: { ...prev.views, [name]: emptySpec() },
                }));
              }}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={tabMenu?.el ?? null}
            open={!!tabMenu}
            onClose={() => setTabMenu(null)}
          >
            <MenuItem
              onClick={() => {
                if (tabMenu) setRenameOpen({ name: tabMenu.name });
                setTabMenu(null);
              }}
            >
              <EditOutlinedIcon sx={{ fontSize: 16, mr: 1 }} /> 重命名
            </MenuItem>
            <MenuItem
              onClick={() => {
                if (!tabMenu) return;
                const src = tabMenu.name;
                const base = `${src} 副本`;
                let candidate = base;
                let i = 2;
                while (state.views[candidate]) {
                  candidate = `${base} ${i}`;
                  i++;
                }
                setTabMenu(null);
                setState((prev) => {
                  const source = prev.views[src];
                  if (!source) return prev;
                  return {
                    active: candidate,
                    views: {
                      ...prev.views,
                      [candidate]: JSON.parse(JSON.stringify(source)) as ViewSpec,
                    },
                  };
                });
              }}
            >
              <ContentCopyIcon sx={{ fontSize: 16, mr: 1 }} /> 复制视图
            </MenuItem>
            <Divider />
            <MenuItem
              disabled={tabMenu?.name === DEFAULT_VIEW_NAME}
              onClick={() => {
                if (!tabMenu) return;
                const name = tabMenu.name;
                setTabMenu(null);
                if (
                  !confirm(`删除视图 "${name}"？（视图配置丢失，不影响数据）`)
                )
                  return;
                setState((prev) => {
                  const next = { ...prev.views };
                  delete next[name];
                  return {
                    active:
                      prev.active === name ? DEFAULT_VIEW_NAME : prev.active,
                    views: next,
                  };
                });
              }}
            >
              <DeleteOutlineIcon sx={{ fontSize: 16, mr: 1, color: "error.main" }} />
              <Box component="span" sx={{ color: "error.main" }}>
                删除视图
              </Box>
            </MenuItem>
          </Menu>
        </Stack>

        {/* Formula bar (Excel-style), only shown for spreadsheet */}
        {spec.mode === "spreadsheet" && (
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{
              px: 2.5,
              py: 0.6,
              borderBottom: 1,
              borderColor: "divider",
              bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
            }}
          >
            <Chip
              size="small"
              label={
                activeCell
                  ? `${dataCols[activeCell[0]]?.name ?? "?"} · 行 ${activeCell[1] + 1}`
                  : "未选中"
              }
              sx={{
                height: 22,
                fontSize: 11,
                fontFamily: "ui-monospace, monospace",
                minWidth: 130,
              }}
            />
            <Box
              sx={{
                flex: 1,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12.5,
                color: "text.primary",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minHeight: 22,
              }}
            >
              {formula}
            </Box>
            {spec.filter && (
              <Chip
                size="small"
                color="primary"
                variant="outlined"
                label={`WHERE ${spec.filter}`}
                onDelete={() => setSpec((s) => ({ ...s, filter: null }))}
                sx={{ height: 22, fontSize: 11 }}
              />
            )}
          </Stack>
        )}

        {/* Per-view mode toggle */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2.5, pt: 1, gap: 1, flexWrap: "wrap" }}
        >
          <ToggleButtonGroup
            value={spec.mode}
            exclusive
            size="small"
            onChange={(_, v) => {
              if (v) setSpec((s) => ({ ...s, mode: v as ViewMode }));
            }}
            sx={{
              "& .MuiToggleButton-root": {
                px: 1.2,
                py: 0.3,
                fontSize: 12,
                textTransform: "none",
                gap: 0.5,
              },
            }}
          >
            <ToggleButton value="spreadsheet">
              <GridOnIcon sx={{ fontSize: 14 }} /> 表格
            </ToggleButton>
            <ToggleButton value="chart" disabled={!spec.chart}>
              <BarChartIcon sx={{ fontSize: 14 }} /> 图表
            </ToggleButton>
            <ToggleButton value="cards" disabled={!spec.cards}>
              <ViewModuleIcon sx={{ fontSize: 14 }} /> 卡片
            </ToggleButton>
            <ToggleButton value="markdown" disabled={!spec.markdown}>
              <ArticleOutlinedIcon sx={{ fontSize: 14 }} /> Markdown
            </ToggleButton>
          </ToggleButtonGroup>
          {spec.mode !== "spreadsheet" && (
            <Typography variant="caption" color="text.secondary">
              {spec.mode === "chart" && spec.chart
                ? `${spec.chart.type} · x=${spec.chart.x} · y=${spec.chart.y.join(",")}${spec.chart.agg && spec.chart.agg !== "none" ? ` · ${spec.chart.agg}` : ""}`
                : spec.mode === "cards" && spec.cards
                  ? `title=${spec.cards.title}${spec.cards.groupBy ? ` · group=${spec.cards.groupBy}` : ""}`
                  : spec.mode === "markdown" && spec.markdown
                    ? spec.markdown.title ?? "Markdown"
                    : ""}
            </Typography>
          )}
        </Stack>

        {/* Type chip row */}
        <Box sx={{ px: 2.5, pt: 1 }}>
          <Stack direction="row" spacing={0.7} sx={{ flexWrap: "wrap", gap: 0.7 }}>
            {rawDataCols.map((c) => {
              const hidden = spec.hidden.includes(c.name);
              return (
                <Chip
                  key={c.name}
                  size="small"
                  variant={hidden ? "outlined" : "filled"}
                  label={
                    <span style={{ opacity: hidden ? 0.55 : 1 }}>
                      {hidden && <span style={{ marginRight: 4 }}>(隐)</span>}
                      <strong>{c.name}</strong>{" "}
                      <span style={{ opacity: 0.65 }}>{c.type}</span>
                    </span>
                  }
                  onClick={() =>
                    setSpec((s) => ({
                      ...s,
                      hidden: hidden
                        ? s.hidden.filter((n) => n !== c.name)
                        : [...s.hidden, c.name],
                    }))
                  }
                  sx={{ height: 22, cursor: "pointer" }}
                />
              );
            })}
          </Stack>
        </Box>

        {err && (
          <Alert
            severity="error"
            onClose={() => setErr(null)}
            sx={{ mx: 2.5, mt: 1 }}
          >
            {err}
          </Alert>
        )}

        <Box
          sx={{
            flex: 1,
            m: spec.mode === "spreadsheet" ? 2.5 : 0,
            mt: spec.mode === "spreadsheet" ? 1.2 : 1,
            minHeight: 0,
            position: "relative",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {loading ? (
            <Stack
              alignItems="center"
              justifyContent="center"
              sx={{ height: "100%" }}
            >
              <CircularProgress size={18} />
            </Stack>
          ) : spec.mode === "spreadsheet" ? (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                border: 1,
                borderColor: "divider",
                borderRadius: 1.5,
                overflow: "hidden",
              }}
            >
              <DataEditor
                ref={editorRef}
                columns={columns}
                rows={rows.length}
                getCellContent={getCellContent}
                onCellEdited={onCellEdited}
                onColumnResize={onColumnResize}
                onCellActivated={(cell) => beginCellEdit(cell)}
                onKeyDown={(e) => {
                  const cur = selection.current?.cell;
                  if (!cur) return;
                  // Excel-style: if a printable key is pressed on a selected
                  // cell, open the editor with that key as the prefix.
                  const k = e.key;
                  const isPrintable =
                    k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
                  if (isPrintable) {
                    e.preventDefault();
                    beginCellEdit(cur, k);
                  }
                }}
                onHeaderContextMenu={(colIdx, evt) => {
                  const c = dataCols[colIdx];
                  if (!c) return;
                  evt.preventDefault();
                  setColMenu({
                    x: evt.bounds.x + evt.localEventX,
                    y: evt.bounds.y + evt.localEventY,
                    col: c,
                  });
                }}
                rowMarkers="number"
                smoothScrollX
                smoothScrollY
                gridSelection={selection}
                onGridSelectionChange={(s) => {
                  setSelection(s);
                  setActiveCell(s.current?.cell ?? null);
                }}
                keybindings={{
                  copy: true,
                  paste: true,
                  downFill: true,
                  rightFill: true,
                  selectAll: true,
                  search: true,
                }}
                trailingRowOptions={{
                  sticky: true,
                  tint: true,
                  hint: "+  新行",
                }}
                onRowAppended={() => void addRow()}
                theme={gridTheme}
                width="100%"
                height="100%"
              />
            </Box>
          ) : spec.mode === "chart" && spec.chart ? (
            <Box
              ref={chartContainerRef}
              sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
            >
              <ChartView spec={spec.chart} ctx={viewCtx} />
            </Box>
          ) : spec.mode === "cards" && spec.cards ? (
            <CardsView spec={spec.cards} ctx={viewCtx} />
          ) : spec.mode === "markdown" && spec.markdown ? (
            <MarkdownView spec={spec.markdown} ctx={viewCtx} />
          ) : (
            <Stack
              alignItems="center"
              justifyContent="center"
              sx={{ flex: 1, color: "text.secondary", gap: 1, p: 3 }}
            >
              <Typography variant="body2">
                此视图尚未配置 {spec.mode}。让右侧 AI 帮你生成。
              </Typography>
            </Stack>
          )}
        </Box>

        {spec.mode === "spreadsheet" && (
          <Stack
            direction="row"
            alignItems="center"
            spacing={2}
            sx={{
              px: 2.5,
              py: 0.5,
              borderTop: 1,
              borderColor: "divider",
              bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11.5,
              color: "text.secondary",
              minHeight: 24,
            }}
          >
            <Box>
              {rows.length} 行 · {dataCols.length} 列
            </Box>
            {selectedRowCount > 0 && (
              <Box>
                <Box component="span" sx={{ color: "primary.main" }}>
                  {selectedRowCount}
                </Box>{" "}
                行选中
              </Box>
            )}
            {selectionStats.cellCount > 1 && (
              <>
                <Box>选中 {selectionStats.cellCount} 格</Box>
                {"sum" in selectionStats && selectionStats.nums > 0 && (
                  <>
                    <Box>sum {fmtNum(selectionStats.sum as number)}</Box>
                    <Box>avg {fmtNum(selectionStats.avg as number)}</Box>
                    <Box>min {fmtNum(selectionStats.min as number)}</Box>
                    <Box>max {fmtNum(selectionStats.max as number)}</Box>
                    <Box>count {selectionStats.nums}</Box>
                  </>
                )}
              </>
            )}
            <Box sx={{ flex: 1 }} />
            <Box>视图：{activeName}</Box>
          </Stack>
        )}

        <AddColumnDialog
          open={colDialog}
          existing={rawDataCols.map((c) => c.name)}
          onClose={() => setColDialog(false)}
          onAdd={async (col) => {
            await api.addColumn(schema.name, col);
            setColDialog(false);
            await onSchemaChanged();
            await reloadRows();
          }}
        />

        <RenameDialog
          value={renameOpen?.name ?? ""}
          existing={viewNames}
          open={!!renameOpen}
          onClose={() => setRenameOpen(null)}
          onSubmit={(newName) => {
            if (!renameOpen) return;
            const old = renameOpen.name;
            setState((prev) => {
              if (!(old in prev.views)) return prev;
              const next: Record<string, ViewSpec> = {};
              for (const [k, v] of Object.entries(prev.views)) {
                next[k === old ? newName : k] = v;
              }
              return {
                active: prev.active === old ? newName : prev.active,
                views: next,
              };
            });
            setRenameOpen(null);
          }}
        />

        {/* Column header context menu */}
        <Menu
          open={!!colMenu}
          onClose={() => setColMenu(null)}
          anchorReference="anchorPosition"
          anchorPosition={
            colMenu ? { left: colMenu.x, top: colMenu.y } : undefined
          }
          slotProps={{ paper: { sx: { minWidth: 200 } } }}
        >
          <Box sx={{ px: 1.5, py: 0.6 }}>
            <Typography variant="caption" color="text.secondary">
              列：<strong>{colMenu?.col.name}</strong>{" "}
              <span style={{ opacity: 0.65 }}>({colMenu?.col.type})</span>
            </Typography>
          </Box>
          <Divider />
          <MenuItem
            selected={spec.sort?.column === colMenu?.col.name && spec.sort?.direction === "asc"}
            onClick={() => {
              if (!colMenu) return;
              setSpec((s) => ({
                ...s,
                sort: { column: colMenu.col.name, direction: "asc" },
              }));
              setColMenu(null);
            }}
          >
            <ArrowUpwardIcon sx={{ fontSize: 16, mr: 1 }} /> 升序
          </MenuItem>
          <MenuItem
            selected={spec.sort?.column === colMenu?.col.name && spec.sort?.direction === "desc"}
            onClick={() => {
              if (!colMenu) return;
              setSpec((s) => ({
                ...s,
                sort: { column: colMenu.col.name, direction: "desc" },
              }));
              setColMenu(null);
            }}
          >
            <ArrowDownwardIcon sx={{ fontSize: 16, mr: 1 }} /> 降序
          </MenuItem>
          <MenuItem
            disabled={!spec.sort || spec.sort.column !== colMenu?.col.name}
            onClick={() => {
              setSpec((s) => ({ ...s, sort: null }));
              setColMenu(null);
            }}
          >
            <SortIcon sx={{ fontSize: 16, mr: 1 }} /> 取消排序
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={() => {
              if (!colMenu) return;
              const c = colMenu.col;
              const quote = (v: unknown) =>
                typeof v === "string"
                  ? `'${v.replace(/'/g, "''")}'`
                  : v === null || v === undefined
                    ? "NULL"
                    : String(v);
              const v = activeCell ? rows[activeCell[1]]?.[c.name] : undefined;
              const clause =
                v === null || v === undefined
                  ? `${quoteIdent(c.name)} IS NULL`
                  : `${quoteIdent(c.name)} = ${quote(v)}`;
              setSpec((s) => ({ ...s, filter: clause }));
              setColMenu(null);
            }}
          >
            <FilterAltIcon sx={{ fontSize: 16, mr: 1 }} /> 按选中值筛选
          </MenuItem>
          <MenuItem
            disabled={!spec.filter}
            onClick={() => {
              setSpec((s) => ({ ...s, filter: null }));
              setColMenu(null);
            }}
          >
            <ContentCutIcon sx={{ fontSize: 16, mr: 1 }} /> 清除筛选
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={() => {
              if (!colMenu) return;
              setSpec((s) => ({
                ...s,
                hidden: Array.from(new Set([...s.hidden, colMenu.col.name])),
              }));
              setColMenu(null);
            }}
          >
            <VisibilityOffIcon sx={{ fontSize: 16, mr: 1 }} /> 隐藏列
          </MenuItem>
          <MenuItem
            onClick={() => {
              if (!colMenu) return;
              setRenameColOpen({ from: colMenu.col.name });
              setColMenu(null);
            }}
          >
            <EditOutlinedIcon sx={{ fontSize: 16, mr: 1 }} /> 重命名列…
          </MenuItem>
          <MenuItem
            onClick={() => {
              if (!colMenu) return;
              const c = colMenu.col;
              setColMenu(null);
              // Measure max text width in this column among loaded rows.
              const canvas = document.createElement("canvas");
              const ctx = canvas.getContext("2d");
              if (!ctx) return;
              ctx.font =
                '12.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
              let maxW = ctx.measureText(c.name).width;
              for (const r of rows) {
                const v = r[c.name];
                let s: string;
                if (v === null || v === undefined) s = "";
                else if (typeof v === "object") s = JSON.stringify(v);
                else s = String(v);
                const w = ctx.measureText(s).width;
                if (w > maxW) maxW = w;
              }
              // Padding (Glide cell horiz padding 10 each side) + 8 buffer
              const target = Math.max(60, Math.min(640, Math.round(maxW + 28)));
              setSpec((s) => ({
                ...s,
                widths: { ...s.widths, [c.name]: target },
              }));
            }}
          >
            <StraightenIcon sx={{ fontSize: 16, mr: 1 }} /> 适配宽度
          </MenuItem>
          <MenuItem
            onClick={() => {
              if (!colMenu) return;
              navigator.clipboard?.writeText(colMenu.col.name).catch(() => {});
              setColMenu(null);
            }}
          >
            <ContentCopyIcon sx={{ fontSize: 16, mr: 1 }} /> 复制列名
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={async () => {
              if (!colMenu) return;
              const c = colMenu.col;
              setColMenu(null);
              if (
                !confirm(
                  `删除列「${c.name}」？所有行该列的值会丢失（无法撤销）`
                )
              )
                return;
              try {
                await api.dropColumn(schema.name, c.name);
                await onSchemaChanged();
                await reloadRows();
                // Remove references to this column from view state.
                setState((prev) => {
                  const remap = (s: ViewSpec): ViewSpec => ({
                    ...s,
                    hidden: s.hidden.filter((n) => n !== c.name),
                    order: s.order.filter((n) => n !== c.name),
                    widths: Object.fromEntries(
                      Object.entries(s.widths).filter(([k]) => k !== c.name)
                    ),
                    sort:
                      s.sort && s.sort.column === c.name ? null : s.sort,
                  });
                  const views: Record<string, ViewSpec> = {};
                  for (const [name, v] of Object.entries(prev.views))
                    views[name] = remap(v);
                  return { ...prev, views };
                });
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              }
            }}
            sx={{ color: "error.main" }}
          >
            <DeleteOutlineIcon sx={{ fontSize: 16, mr: 1 }} /> 删除列
          </MenuItem>
        </Menu>

        <CellEditDialog
          open={!!cellEdit}
          column={cellEdit ? dataCols[cellEdit.col] : undefined}
          rowNumber={cellEdit ? cellEdit.row + 1 : undefined}
          initial={cellEdit?.initial}
          prefix={cellEdit?.prefix}
          onClose={() => setCellEdit(null)}
          onSubmit={(value, advance) => {
            if (!cellEdit) return;
            onCellEdited([cellEdit.col, cellEdit.row], {
              kind: GridCellKind.Text,
              data: value,
              displayData: value,
              allowOverlay: false,
            });
            if (advance === "down" && cellEdit.row + 1 < rows.length) {
              const next = { row: cellEdit.row + 1, col: cellEdit.col };
              const c = dataCols[next.col];
              const r = rows[next.row];
              if (c && r) {
                setCellEdit({
                  row: next.row,
                  col: next.col,
                  initial: r[c.name],
                });
                return;
              }
            }
            if (advance === "right" && cellEdit.col + 1 < dataCols.length) {
              const next = { row: cellEdit.row, col: cellEdit.col + 1 };
              const c = dataCols[next.col];
              const r = rows[next.row];
              if (c && r) {
                setCellEdit({
                  row: next.row,
                  col: next.col,
                  initial: r[c.name],
                });
                return;
              }
            }
            setCellEdit(null);
          }}
        />

        <RenameDialog
          open={!!renameColOpen}
          value={renameColOpen?.from ?? ""}
          existing={rawDataCols.map((c) => c.name)}
          onClose={() => setRenameColOpen(null)}
          onSubmit={async (newName) => {
            if (!renameColOpen) return;
            const from = renameColOpen.from;
            setRenameColOpen(null);
            try {
              await api.renameColumn(schema.name, from, newName);
              await onSchemaChanged();
              await reloadRows();
              // Migrate viewState references (hidden/order/widths/sort/filter mentions)
              setState((prev) => {
                const remap = (s: ViewSpec): ViewSpec => ({
                  ...s,
                  hidden: s.hidden.map((n) => (n === from ? newName : n)),
                  order: s.order.map((n) => (n === from ? newName : n)),
                  widths: Object.fromEntries(
                    Object.entries(s.widths).map(([k, v]) => [
                      k === from ? newName : k,
                      v,
                    ])
                  ),
                  sort: s.sort
                    ? { ...s.sort, column: s.sort.column === from ? newName : s.sort.column }
                    : s.sort,
                });
                const views: Record<string, ViewSpec> = {};
                for (const [name, v] of Object.entries(prev.views)) views[name] = remap(v);
                return { ...prev, views };
              });
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
            }
          }}
        />
      </Box>

      {chatOpen && (
        <>
          <Box
            onMouseDown={onDragHandleDown}
            sx={{
              width: 6,
              cursor: "col-resize",
              flexShrink: 0,
              bgcolor: "transparent",
              borderLeft: 1,
              borderRight: 1,
              borderColor: "divider",
              "&:hover, &:active": {
                bgcolor: "primary.main",
                opacity: 0.5,
              },
              transition: "background-color .15s",
            }}
          />
          <Box
            sx={{
              width: chatWidth,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              bgcolor: "background.paper",
            }}
          >
            <ChatPanel
              title={`AI · ${schema.name}`}
              contextHint={contextHint}
              localTools={localTools}
              compact
              storageKey={`sqlad.chat.table.${schema.name}`}
            />
          </Box>
        </>
      )}
    </Stack>
  );
}

function AddColumnDialog({
  open,
  existing,
  onClose,
  onAdd,
}: {
  open: boolean;
  existing: string[];
  onClose: () => void;
  onAdd: (col: ColumnDef) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ColumnType>("text");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setType("text");
      setErr(null);
    }
  }, [open]);

  async function commit() {
    if (!name.trim()) return;
    if (existing.includes(name.trim())) {
      setErr("列名已存在");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onAdd({ name: name.trim(), type, nullable: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>新增列</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            size="small"
            label="列名"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <TextField
            select
            size="small"
            label="类型"
            value={type}
            onChange={(e) => setType(e.target.value as ColumnType)}
          >
            {TYPE_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          {err && <Alert severity="error">{err}</Alert>}
          <Typography variant="caption" color="text.secondary">
            SQLite 的 ALTER ADD COLUMN 新列总是可空（NULL）。
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          取消
        </Button>
        <Button
          startIcon={<AddIcon />}
          variant="contained"
          onClick={() => void commit()}
          disabled={busy || !name.trim()}
        >
          添加
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CellEditDialog({
  open,
  column,
  rowNumber,
  initial,
  prefix,
  onClose,
  onSubmit,
}: {
  open: boolean;
  column?: ColumnDef;
  rowNumber?: number;
  initial?: unknown;
  prefix?: string;
  onClose: () => void;
  onSubmit: (value: string, advance: "down" | "right" | null) => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isComposingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const start = prefix
      ? prefix
      : initial === null || initial === undefined
        ? ""
        : typeof initial === "object"
          ? JSON.stringify(initial)
          : String(initial);
    setValue(start);
    // Focus + put caret at the end on next tick.
    setTimeout(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        const len = el.value.length;
        try {
          el.setSelectionRange(len, len);
        } catch {
          /* ignore */
        }
      }
    }, 30);
  }, [open, initial, prefix]);

  if (!column) return null;

  const numeric = column.type === "integer" || column.type === "real";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: {
          // Smaller card so it feels inline, not modal.
          sx: { borderRadius: 2 },
        },
      }}
    >
      <DialogTitle sx={{ pb: 0.5 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography component="span" sx={{ fontWeight: 600 }}>
            {column.name}
          </Typography>
          <Chip
            size="small"
            label={column.type}
            sx={{ height: 18, fontSize: 10.5 }}
          />
          <Typography variant="caption" color="text.secondary">
            行 {rowNumber}
          </Typography>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 1.5 }}>
        <TextField
          inputRef={inputRef}
          fullWidth
          size="small"
          multiline
          maxRows={6}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onCompositionStart={() => (isComposingRef.current = true)}
          onCompositionEnd={() => (isComposingRef.current = false)}
          onKeyDown={(e) => {
            // IME composition: never submit on Enter mid-compose.
            if (isComposingRef.current || e.nativeEvent.isComposing) return;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit(value, "down");
            } else if (e.key === "Tab") {
              e.preventDefault();
              onSubmit(value, "right");
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder={
            numeric
              ? "数字（留空=NULL）"
              : column.type === "boolean"
                ? "true / false"
                : column.type === "json"
                  ? "JSON"
                  : "文本（留空=NULL，Shift+Enter 换行）"
          }
          sx={{
            "& .MuiInputBase-input": {
              fontFamily: numeric
                ? "ui-monospace, SFMono-Regular, Menlo, monospace"
                : undefined,
              fontSize: 13.5,
            },
          }}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 0.8, display: "block" }}
        >
          Enter 保存并下移 · Tab 保存并右移 · Esc 取消 · Shift+Enter 换行
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={() => onSubmit(value, null)}>
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RenameDialog({
  open,
  value,
  existing,
  onClose,
  onSubmit,
}: {
  open: boolean;
  value: string;
  existing: string[];
  onClose: () => void;
  onSubmit: (newName: string) => void;
}) {
  const [name, setName] = useState(value);
  useEffect(() => setName(value), [value]);
  const dup =
    name.trim() !== value && existing.includes(name.trim());
  const empty = !name.trim();
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>重命名视图</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          size="small"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={dup}
          helperText={dup ? "名称已存在" : ""}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button
          variant="contained"
          disabled={dup || empty}
          onClick={() => onSubmit(name.trim())}
        >
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
}
