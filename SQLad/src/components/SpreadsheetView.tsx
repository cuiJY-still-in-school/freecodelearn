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
  IconButton,
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
import GridOnIcon from "@mui/icons-material/GridOn";
import BarChartIcon from "@mui/icons-material/BarChart";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
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
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile, writeFile } from "@tauri-apps/plugin-fs";
import { api } from "../api/client";
import { useData, useUi } from "../store";
import type { ColumnDef, ColumnType, TableSchema } from "../api/types";
import { ChartView } from "../views/ChartView";
import { CardsView } from "../views/CardsView";
import { MarkdownView } from "../views/MarkdownView";
import {
  DEFAULT_VIEW_NAME,
  emptySpec,
  emptyState,
  migrateStoredView,
  type ChartSpec,
  type CardsSpec,
  type MarkdownSpec,
  type Row,
  type TableViewState,
  type ViewContext,
  type ViewMode,
  type ViewSpec,
} from "../views/types";

const TYPE_OPTIONS: { value: ColumnType; label: string }[] = [
  { value: "text", label: "文本" }, { value: "integer", label: "整数" },
  { value: "real", label: "小数" }, { value: "boolean", label: "布尔" },
  { value: "timestamp", label: "时间" }, { value: "json", label: "JSON" },
];

function loadState(table: string): TableViewState {
  try { const raw = localStorage.getItem(`sqlad.view.${table}`); if (raw) return migrateStoredView(JSON.parse(raw)); } catch { /* */ }
  return emptyState();
}
function saveState(table: string, state: TableViewState) {
  try { localStorage.setItem(`sqlad.view.${table}`, JSON.stringify(state)); } catch { /* */ }
}
function quoteIdent(s: string): string { return `"${s.replace(/"/g, '""')}"`; }
function isSafeWhere(s: string): boolean {
  if (s.includes(";")) return false;
  const b = ["insert ","update ","delete ","drop ","alter ","attach ","detach ","pragma ","create ","--","/*"];
  return !b.some(x => s.toLowerCase().includes(x));
}

export function SpreadsheetView({ schema, onSchemaChanged }: { schema: TableSchema; onSchemaChanged: () => Promise<void> | void }) {
  const muiTheme = useTheme();
  const editorRef = useRef<DataEditorRef>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [colDialog, setColDialog] = useState(false);
  const [selection, setSelection] = useState<GridSelection>({ columns: CompactSelection.empty(), rows: CompactSelection.empty() });
  const [_activeCell, setActiveCell] = useState<Item | null>(null);
  const [exportMenu, setExportMenu] = useState<HTMLElement | null>(null);
  const [colMenu, setColMenu] = useState<{ x: number; y: number; col: ColumnDef } | null>(null);
  const [renameColOpen, setRenameColOpen] = useState<{ from: string } | null>(null);
  const [tabMenu, setTabMenu] = useState<{ el: HTMLElement; name: string } | null>(null);
  const [renameOpen, setRenameOpen] = useState<{ name: string } | null>(null);
  const [cellEdit, setCellEdit] = useState<{ row: number; col: number; initial: unknown; prefix?: string } | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const tables = useData((s) => s.tables);
  const setActiveTable = useUi((s) => s.setActiveTable);

  const [state, setState] = useState<TableViewState>(() => loadState(schema.name));
  useEffect(() => { saveState(schema.name, state); }, [schema.name, state]);
  const activeName = state.active in state.views ? state.active : DEFAULT_VIEW_NAME;
  const spec: ViewSpec = state.views[activeName] ?? emptySpec();
  const setSpec = useCallback((updater: (s: ViewSpec) => ViewSpec) => {
    setState(prev => {
      const name = prev.active in prev.views ? prev.active : DEFAULT_VIEW_NAME;
      const current = prev.views[name] ?? emptySpec();
      return { ...prev, active: name, views: { ...prev.views, [name]: updater(current) } };
    });
  }, []);

  const rawDataCols = useMemo(() => schema.columns.filter(c => c.name !== "_id"), [schema]);
  const dataCols = useMemo(() => {
    const byName = new Map(rawDataCols.map(c => [c.name, c]));
    const ordered: ColumnDef[] = [];
    for (const name of spec.order) { const c = byName.get(name); if (c) { ordered.push(c); byName.delete(name); } }
    for (const c of rawDataCols) { if (byName.has(c.name)) ordered.push(c); }
    return ordered.filter(c => !spec.hidden.includes(c.name));
  }, [rawDataCols, spec.order, spec.hidden]);

  const reloadRows = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      let sql = `SELECT * FROM ${quoteIdent(schema.name)}`;
      if (spec.filter && isSafeWhere(spec.filter)) sql += ` WHERE ${spec.filter}`;
      if (spec.sort) sql += ` ORDER BY ${quoteIdent(spec.sort.column)} ${spec.sort.direction === "desc" ? "DESC" : "ASC"}, _id`;
      else sql += ` ORDER BY _id`;
      const r = await api.runQuery(sql);
      const idIdx = r.columns.indexOf("_id");
      setRows(r.rows.map((row, i) => { const obj: Record<string, unknown> = { _id: idIdx >= 0 ? Number(row[idIdx]) : i + 1 }; r.columns.forEach((c, j) => (obj[c] = row[j])); return obj as Row; }));
    } catch (e) { setErr(String(e)); } finally { setLoading(false); }
  }, [schema.name, spec.filter, spec.sort]);
  useEffect(() => { void reloadRows(); }, [reloadRows]);

  const columns: GridColumn[] = useMemo(() => dataCols.map(c => {
    const dw = c.type === "boolean" ? 80 : c.type === "integer" ? 100 : c.type === "real" ? 110 : c.type === "timestamp" ? 170 : 160;
    return { id: c.name, title: c.name, width: spec.widths[c.name] ?? dw };
  }), [dataCols, spec.widths]);

  const getCellContent = useCallback(([col, row]: Item): GridCell => {
    const c = dataCols[col]; const r = rows[row]; const raw = r?.[c?.name ?? ""]; const ct = c?.type ?? "text";
    if (ct === "boolean") { const b = raw === true || raw === 1 || raw === "1" || raw === "true" || raw === "TRUE"; return { kind: GridCellKind.Boolean, data: raw === null || raw === undefined ? false : b, allowOverlay: false }; }
    const isNum = ct === "integer" || ct === "real";
    let text = raw === null || raw === undefined ? "" : typeof raw === "object" ? JSON.stringify(raw) : String(raw);
    let display = text;
    if (isNum && text !== "") { const n = Number(text); if (Number.isFinite(n)) display = ct === "integer" ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 4 }); }
    return { kind: GridCellKind.Text, data: text, displayData: display, allowOverlay: false, contentAlign: isNum ? "right" : undefined };
  }, [dataCols, rows]);

  const onCellEdited = useCallback((cell: Item, newValue: EditableGridCell) => {
    const [col, row] = cell; const c = dataCols[col]; const r = rows[row]; if (!c || !r) return;
    let value: unknown;
    if (newValue.kind === GridCellKind.Boolean) value = newValue.data;
    else if (newValue.kind === GridCellKind.Text) {
      if (newValue.data === "") value = null;
      else if (c.type === "integer") { const n = Number(newValue.data); value = Number.isFinite(n) ? Math.trunc(n) : newValue.data; }
      else if (c.type === "real") { const n = Number(newValue.data); value = Number.isFinite(n) ? n : newValue.data; }
      else value = newValue.data;
    } else return;
    const previous = r[c.name];
    setRows(prev => { const next = [...prev]; next[row] = { ...r, [c.name]: value }; return next; });
    api.updateCell(schema.name, r._id, c.name, value).catch(e => { setErr(`更新失败：${e instanceof Error ? e.message : String(e)}`); setRows(prev => { const next = [...prev]; next[row] = { ...r, [c.name]: previous }; return next; }); });
  }, [dataCols, rows, schema.name]);
  const onColumnResize = useCallback((column: GridColumn, newSize: number) => { setSpec(s => ({ ...s, widths: { ...s.widths, [column.id ?? column.title]: newSize } })); }, [setSpec]);

  const beginCellEdit = useCallback((cell: Item, prefix?: string) => {
    const [col, row] = cell; const c = dataCols[col]; const r = rows[row]; if (!c || !r) return;
    if (c.type === "boolean") { onCellEdited(cell, { kind: GridCellKind.Boolean, data: !(r[c.name] === true || r[c.name] === 1 || r[c.name] === "1"), allowOverlay: false }); return; }
    setCellEdit({ row, col, initial: r[c.name], prefix });
  }, [dataCols, rows, onCellEdited]);

  async function addRow() {
    try { const newId = await api.insertBlankRow(schema.name); const blank: Row = { _id: newId }; dataCols.forEach(c => (blank[c.name] = null)); setRows(prev => [...prev, blank]); await onSchemaChanged(); } catch (e) { setErr(String(e)); }
  }
  async function deleteSelectedRows() {
    const indices: number[] = []; selection.rows.toArray().forEach(i => indices.push(i));
    if (indices.length === 0) return;
    const ids = indices.map(i => rows[i]?._id).filter((x): x is number => typeof x === "number");
    if (!confirm(`删除 ${ids.length} 行？`)) return;
    try { await api.deleteRows(schema.name, ids); setRows(prev => prev.filter(r => !ids.includes(r._id))); setSelection({ columns: CompactSelection.empty(), rows: CompactSelection.empty() }); await onSchemaChanged(); } catch (e) { setErr(String(e)); }
  }
  async function dropTable() { if (!confirm(`删除整个表 ${schema.name}？`)) return; try { await api.dropTable(schema.name); await onSchemaChanged(); } catch (e) { setErr(String(e)); } }

  // Export
  async function exportCSV() {
    const cols = dataCols.map(c => c.name);
    const esc = (v: unknown) => { if (v === null || v === undefined) return ""; const s = typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [cols.map(esc).join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n");
    const path = await saveDialog({ defaultPath: `${schema.name}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }] });
    if (path) await writeTextFile(path, csv);
  }
  function getChartSvg() { const root = chartContainerRef.current; const svg = root?.querySelector("svg"); if (!svg) return null; const clone = svg.cloneNode(true) as SVGElement; const bbox = (svg as SVGSVGElement).getBoundingClientRect(); clone.setAttribute("xmlns", "http://www.w3.org/2000/svg"); if (!clone.getAttribute("width")) clone.setAttribute("width", String(Math.round(bbox.width))); if (!clone.getAttribute("height")) clone.setAttribute("height", String(Math.round(bbox.height))); return { clone, xml: new XMLSerializer().serializeToString(clone), width: Math.round(bbox.width), height: Math.round(bbox.height) }; }
  async function exportChartSvg() {
    const got = getChartSvg(); if (!got) { setErr("等图表渲染完再导出"); return; }
    const out = `<?xml version="1.0"?>\n` + got.xml;
    const path = await saveDialog({ defaultPath: `${spec.chart?.title ?? schema.name}.svg`, filters: [{ name: "SVG", extensions: ["svg"] }] });
    if (path) await writeTextFile(path, out);
  }
  async function exportChartPng(scale = 2) {
    const got = getChartSvg(); if (!got) { setErr("等图表渲染完再导出"); return; }
    const blob = new Blob([got.xml], { type: "image/svg+xml;charset=utf-8" }); const url = URL.createObjectURL(blob);
    try {
      const img = new Image(); await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = e => reject(new Error(String(e))); img.src = url; });
      const canvas = document.createElement("canvas"); canvas.width = got.width * scale; canvas.height = got.height * scale; const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = muiTheme.palette.background.default; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pngBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("toBlob failed")), "image/png"));
      const buf = new Uint8Array(await pngBlob.arrayBuffer());
      const path = await saveDialog({ defaultPath: `${spec.chart?.title ?? schema.name}.png`, filters: [{ name: "PNG", extensions: ["png"] }] });
      if (path) await writeFile(path, buf);
    } finally { URL.revokeObjectURL(url); }
  }
  async function exportMarkdown() {
    if (!spec.markdown) return;
    const body = spec.markdown.markdown.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr) => {
      const e = expr.trim(); if (e === "table") return schema.name; if (e === "rowCount") return String(rows.length);
      const agg = e.match(/^(sum|avg|min|max|count):(.+)$/);
      if (agg) { const nums = rows.map(r => Number(r[agg[2].trim()])).filter(n => Number.isFinite(n)); if (nums.length === 0) return ""; if (agg[1] === "sum") return String(nums.reduce((a,b) => a+b,0)); if (agg[1] === "avg") return String(nums.reduce((a,b) => a+b,0)/nums.length); if (agg[1] === "min") return String(Math.min(...nums)); if (agg[1] === "max") return String(Math.max(...nums)); if (agg[1] === "count") return String(nums.length); }
      const dot = e.match(/^rows\.(\d+)\.(.+)$/); if (dot) { const v = rows[Number(dot[1])]?.[dot[2]]; return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); }
      return `{{${e}}}`;
    });
    const md = (spec.markdown.title ? `# ${spec.markdown.title}\n\n` : "") + body;
    const path = await saveDialog({ defaultPath: `${spec.markdown?.title ?? schema.name}.md`, filters: [{ name: "MD", extensions: ["md"] }] });
    if (path) await writeTextFile(path, md);
  }

  const viewCtx: ViewContext = useMemo(() => ({ schemaName: schema.name, rawDataCols, rows }), [schema.name, rawDataCols, rows]);
  const viewNames = Object.keys(state.views);
  const selectedRowCount = selection.rows.length;
  const isDark = muiTheme.palette.mode === "dark";
  const gridTheme = isDark ? { accentColor:"#3b82f6", accentLight:"rgba(59,130,246,0.18)", textDark:"#e6e8eb", textMedium:"#b6bcc4", textLight:"#8b929a", textBubble:"#e6e8eb", bgIconHeader:"#8b929a", fgIconHeader:"#e6e8eb", textHeader:"#e6e8eb", textHeaderSelected:"#fff", bgCell:"#0e1116", bgCellMedium:"#161a22", bgHeader:"#1a1f29", bgHeaderHasFocus:"#222836", bgHeaderHovered:"#1f2532", bgBubble:"#1a1f29", bgBubbleSelected:"#3b82f6", bgSearchResult:"rgba(59,130,246,0.18)", borderColor:"rgba(255,255,255,0.07)", drilldownBorder:"rgba(255,255,255,0.12)", linkColor:"#60a5fa", cellHorizontalPadding:10, cellVerticalPadding:4, headerFontStyle:"600 12.5px", baseFontStyle:"12.5px", fontFamily:'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace' } : { accentColor:"#3b82f6", accentLight:"rgba(59,130,246,0.12)", textDark:"#1c2229", textMedium:"#4b5560", textLight:"#7b8794", textBubble:"#1c2229", bgIconHeader:"#7b8794", fgIconHeader:"#fff", textHeader:"#1c2229", textHeaderSelected:"#1c2229", bgCell:"#fff", bgCellMedium:"#f8f9fb", bgHeader:"#f3f5f8", bgHeaderHasFocus:"#e7ebf1", bgHeaderHovered:"#eaedf1", bgBubble:"#eef2f7", bgBubbleSelected:"#3b82f6", bgSearchResult:"rgba(59,130,246,0.18)", borderColor:"rgba(0,0,0,0.07)", drilldownBorder:"rgba(0,0,0,0.12)", linkColor:"#1d4ed8", cellHorizontalPadding:10, cellVerticalPadding:4, headerFontStyle:"600 12.5px", baseFontStyle:"12.5px", fontFamily:'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace' };

  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1, borderBottom: 1, borderColor: "divider" }}>
        <TableChartOutlinedIcon sx={{ fontSize: 18, color: "primary.main" }} />
        <Typography variant="h6" sx={{ fontSize: 16 }}>{schema.name}</Typography>
        <Typography variant="caption" color="text.secondary">{rawDataCols.length} 列 · {rows.length} 行</Typography>
        <Box sx={{ flex: 1 }} />
        {/* Table switcher */}
        {tables.length > 1 && (
          <Stack direction="row" spacing={0.5} sx={{ mr: 1 }}>
            {tables.map(t => (
              <Chip key={t.name} size="small" label={t.name} variant={t.name === schema.name ? "filled" : "outlined"} color={t.name === schema.name ? "primary" : "default"} onClick={() => { if (t.name !== schema.name) setActiveTable(t.name); }} sx={{ height: 22, fontSize: 11, cursor: "pointer" }} />
            ))}
          </Stack>
        )}
        <Tooltip title="新增行"><IconButton size="small" onClick={() => void addRow()}><PlaylistAddIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="新增列"><IconButton size="small" onClick={() => setColDialog(true)}><ViewColumnIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="快速图表"><span><IconButton size="small" onClick={() => setSpec(s => ({ ...s, mode: "chart" }))}><BarChartIcon fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title={selectedRowCount > 0 ? `删除 ${selectedRowCount} 行` : "删除选中"}><span><IconButton size="small" color="error" disabled={selectedRowCount === 0} onClick={() => void deleteSelectedRows()}><DeleteOutlineIcon fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title="重新加载"><IconButton size="small" onClick={() => void reloadRows()} disabled={loading}><RefreshIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="导出"><IconButton size="small" onClick={e => { if (spec.mode === "chart") setExportMenu(e.currentTarget); else if (spec.mode === "spreadsheet") void exportCSV(); else if (spec.mode === "markdown") void exportMarkdown(); }} disabled={spec.mode === "cards"}><FileDownloadOutlinedIcon fontSize="small" /></IconButton></Tooltip>
        <Menu anchorEl={exportMenu} open={!!exportMenu} onClose={() => setExportMenu(null)}>
          <MenuItem onClick={() => { setExportMenu(null); void exportChartSvg(); }}>SVG</MenuItem>
          <MenuItem onClick={() => { setExportMenu(null); void exportChartPng(2); }}>PNG (2x)</MenuItem>
        </Menu>
        <Tooltip title="删表"><IconButton size="small" color="error" onClick={() => void dropTable()}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
      </Stack>

      {/* View tabs + mode toggle */}
      <Stack direction="row" alignItems="center" sx={{ px: 1.5, borderBottom: 1, borderColor: "divider", bgcolor: isDark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)" }}>
        <Tabs value={activeName} onChange={(_, v) => setState(prev => ({ ...prev, active: String(v) }))} variant="scrollable" scrollButtons="auto" sx={{ minHeight: 28, flex: 1, "& .MuiTab-root": { minHeight: 28, textTransform: "none", fontSize: 11.5, py: 0.3, px: 1, minWidth: 0, "& .MuiTab-iconWrapper": { mr: 0.4 } } }}>
          {viewNames.map(name => (
            <Tab key={name} value={name} label={<Stack direction="row" alignItems="center" spacing={0.4}>{name}{state.views[name]?.mode === "chart" ? <BarChartIcon sx={{ fontSize: 12 }} /> : state.views[name]?.mode === "cards" ? <ViewModuleIcon sx={{ fontSize: 12 }} /> : state.views[name]?.mode === "markdown" ? <ArticleOutlinedIcon sx={{ fontSize: 12 }} /> : <GridOnIcon sx={{ fontSize: 12 }} />}</Stack>}
              icon={name === activeName ? <IconButton size="small" component="span" onClick={e => { e.stopPropagation(); setTabMenu({ el: e.currentTarget, name }); }} sx={{ p: 0.1 }}><MoreVertIcon sx={{ fontSize: 12 }} /></IconButton> : undefined} iconPosition="end" />
          ))}
        </Tabs>
        <IconButton size="small" onClick={() => { let n = 1; while (state.views[`视图 ${n}`]) n++; setState(prev => ({ active: `视图 ${n}`, views: { ...prev.views, [`视图 ${n}`]: emptySpec() } })); }}><AddIcon sx={{ fontSize: 16 }} /></IconButton>
        <Menu anchorEl={tabMenu?.el ?? null} open={!!tabMenu} onClose={() => setTabMenu(null)}>
          <MenuItem onClick={() => { if (tabMenu) setRenameOpen({ name: tabMenu.name }); setTabMenu(null); }}><EditOutlinedIcon sx={{ fontSize: 14, mr: 1 }} />重命名</MenuItem>
          <MenuItem onClick={() => { if (!tabMenu) return; const src = tabMenu.name; let candidate = `${src} 副本`, i = 2; while (state.views[candidate]) candidate = `${src} 副本 ${i++}`; setTabMenu(null); setState(prev => { const source = prev.views[src]; if (!source) return prev; return { active: candidate, views: { ...prev.views, [candidate]: JSON.parse(JSON.stringify(source)) as ViewSpec } }; }); }}><ContentCopyIcon sx={{ fontSize: 14, mr: 1 }} />复制</MenuItem>
          <MenuItem disabled={tabMenu?.name === DEFAULT_VIEW_NAME} onClick={() => { if (!tabMenu) return; const name = tabMenu.name; setTabMenu(null); if (!confirm(`删除视图 "${name}"？`)) return; setState(prev => { const next = { ...prev.views }; delete next[name]; return { active: prev.active === name ? DEFAULT_VIEW_NAME : prev.active, views: next }; }); }}><DeleteOutlineIcon sx={{ fontSize: 14, mr: 1, color: "error.main" }} /><Box component="span" sx={{ color: "error.main" }}>删除</Box></MenuItem>
        </Menu>
      </Stack>

      <Stack direction="row" alignItems="center" sx={{ px: 2, pt: 0.6, pb: 0.4, gap: 1 }}>
        <ToggleButtonGroup value={spec.mode} exclusive size="small" onChange={(_, v) => { if (v) setSpec(s => ({ ...s, mode: v as ViewMode })); }} sx={{ "& .MuiToggleButton-root": { px: 1, py: 0.2, fontSize: 11, textTransform: "none", gap: 0.3, "& .MuiSvgIcon-root": { fontSize: 13 } } }}>
          <ToggleButton value="spreadsheet"><GridOnIcon />表格</ToggleButton>
          <ToggleButton value="chart"><BarChartIcon />图表</ToggleButton>
          <ToggleButton value="cards"><ViewModuleIcon />卡片</ToggleButton>
          <ToggleButton value="markdown"><ArticleOutlinedIcon />Markdown</ToggleButton>
        </ToggleButtonGroup>
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
          {rawDataCols.map(c => { const hidden = spec.hidden.includes(c.name); return <Chip key={c.name} size="small" variant={hidden ? "outlined" : "filled"} label={<span style={{ opacity: hidden ? 0.55 : 1, fontSize: 11 }}>{hidden && "(隐) "}<strong>{c.name}</strong> <span style={{ opacity: 0.6 }}>{c.type}</span></span>} onClick={() => setSpec(s => ({ ...s, hidden: hidden ? s.hidden.filter(n => n !== c.name) : [...s.hidden, c.name] }))} sx={{ height: 20 }} />; })}
        </Stack>
        {spec.filter && <Chip size="small" color="primary" variant="outlined" label={`筛选: ${spec.filter}`} onDelete={() => setSpec(s => ({ ...s, filter: null }))} sx={{ height: 20, fontSize: 11 }} />}
        {spec.sort && <Chip size="small" label={`${spec.sort.column} ${spec.sort.direction}`} onDelete={() => setSpec(s => ({ ...s, sort: null }))} sx={{ height: 20, fontSize: 11 }} />}
      </Stack>

      {err && <Alert severity="error" onClose={() => setErr(null)} sx={{ mx: 2, mt: 0.5 }}>{err}</Alert>}

      <Box sx={{ flex: 1, m: spec.mode === "spreadsheet" ? 1.5 : 0, mt: 0.5, minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }}>
        {loading ? <Stack alignItems="center" justifyContent="center" sx={{ height: "100%" }}><CircularProgress size={18} /></Stack>
        : spec.mode === "spreadsheet" ? <Box sx={{ position: "absolute", inset: 0, border: 1, borderColor: "divider", borderRadius: 1.5, overflow: "hidden" }}>
            <DataEditor ref={editorRef} columns={columns} rows={rows.length} getCellContent={getCellContent} onCellEdited={onCellEdited} onColumnResize={onColumnResize}
              onCellActivated={cell => beginCellEdit(cell)}
              onKeyDown={e => { const cur = selection.current?.cell; if (!cur) return; const k = e.key; if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); beginCellEdit(cur, k); } }}
              onHeaderContextMenu={(colIdx, evt) => { const c = dataCols[colIdx]; if (!c) return; evt.preventDefault(); setColMenu({ x: evt.bounds.x + evt.localEventX, y: evt.bounds.y + evt.localEventY, col: c }); }}
              rowMarkers="number" smoothScrollX smoothScrollY gridSelection={selection}
              onGridSelectionChange={s => { setSelection(s); setActiveCell(s.current?.cell ?? null); }}
              keybindings={{ copy: true, paste: true, downFill: true, rightFill: true, selectAll: true, search: true }}
              trailingRowOptions={{ sticky: true, tint: true, hint: "+ 新行" }} onRowAppended={() => void addRow()}
              theme={gridTheme} width="100%" height="100%" />
          </Box>
        : spec.mode === "chart" && spec.chart ? <Box ref={chartContainerRef} sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}><ChartView spec={spec.chart} ctx={viewCtx} /></Box>
        : spec.mode === "cards" && spec.cards ? <CardsView spec={spec.cards} ctx={viewCtx} />
        : spec.mode === "markdown" && spec.markdown ? <MarkdownView spec={spec.markdown} ctx={viewCtx} />
        : spec.mode === "chart" ? <ChartConfigPanel cols={rawDataCols} onApply={c => setSpec(s => ({ ...s, chart: c }))} />
        : spec.mode === "cards" ? <CardsConfigPanel cols={rawDataCols} onApply={c => setSpec(s => ({ ...s, cards: c }))} />
        : spec.mode === "markdown" ? <MarkdownConfigPanel cols={rawDataCols} tableName={schema.name} rows={rows} onApply={m => setSpec(s => ({ ...s, markdown: m }))} />
        : <Stack alignItems="center" justifyContent="center" sx={{ flex: 1, color: "text.secondary", p: 3 }}><Typography variant="body2">跟 AI 说「画个图」或「做个看板」来配置这个视图。</Typography></Stack>}
      </Box>

      {/* Status bar */}
      <Stack direction="row" alignItems="center" spacing={2} sx={{ px: 2, py: 0.4, borderTop: 1, borderColor: "divider", bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: "text.secondary", minHeight: 22 }}>
        <Box>{rows.length} 行 · {dataCols.length} 列</Box>
        <Box sx={{ flex: 1 }} />
        <Box>视图：{activeName}</Box>
      </Stack>

      {/* Column context menu */}
      <Menu open={!!colMenu} onClose={() => setColMenu(null)} anchorReference="anchorPosition" anchorPosition={colMenu ? { left: colMenu.x, top: colMenu.y } : undefined}>
        <Box sx={{ px: 1.5, py: 0.5 }}><Typography variant="caption">{colMenu?.col.name} ({colMenu?.col.type})</Typography></Box>
        <MenuItem onClick={() => { if (!colMenu) return; setSpec(s => ({ ...s, sort: { column: colMenu.col.name, direction: "asc" } })); setColMenu(null); }}><ArrowUpwardIcon sx={{ fontSize: 14, mr: 1 }} />升序</MenuItem>
        <MenuItem onClick={() => { if (!colMenu) return; setSpec(s => ({ ...s, sort: { column: colMenu.col.name, direction: "desc" } })); setColMenu(null); }}><ArrowDownwardIcon sx={{ fontSize: 14, mr: 1 }} />降序</MenuItem>
        <MenuItem onClick={() => { if (!colMenu) return; setSpec(s => ({ ...s, hidden: Array.from(new Set([...s.hidden, colMenu.col.name])) })); setColMenu(null); }}><VisibilityOffIcon sx={{ fontSize: 14, mr: 1 }} />隐藏</MenuItem>
        <MenuItem onClick={() => { if (!colMenu) return; const c = colMenu.col; navigator.clipboard?.writeText(c.name).catch(() => {}); setColMenu(null); }}><ContentCopyIcon sx={{ fontSize: 14, mr: 1 }} />复制列名</MenuItem>
        <MenuItem onClick={() => { if (!colMenu) return; setRenameColOpen({ from: colMenu.col.name }); setColMenu(null); }}><EditOutlinedIcon sx={{ fontSize: 14, mr: 1 }} />重命名</MenuItem>
        <MenuItem onClick={async () => { if (!colMenu) return; const c = colMenu.col; setColMenu(null); if (!confirm(`删除列「${c.name}」？无法撤销。`)) return; try { await api.dropColumn(schema.name, c.name); await onSchemaChanged(); await reloadRows(); } catch (e) { setErr(String(e)); } }} sx={{ color: "error.main" }}><DeleteOutlineIcon sx={{ fontSize: 14, mr: 1 }} />删除列</MenuItem>
      </Menu>

      {/* Cell edit dialog */}
      <Dialog open={!!cellEdit} onClose={() => setCellEdit(null)} fullWidth maxWidth="xs">
        {cellEdit && (() => { const c = dataCols[cellEdit.col]; if (!c) return null;
          return <>
            <DialogTitle sx={{ pb: 0.5 }}><Stack direction="row" alignItems="center" spacing={1}><Typography fontWeight={600}>{c.name}</Typography><Chip size="small" label={c.type} sx={{ height: 16, fontSize: 10 }} /><Typography variant="caption" color="text.secondary">行 {cellEdit.row + 1}</Typography></Stack></DialogTitle>
            <DialogContent><CellEditor value={cellEdit.initial} prefix={cellEdit.prefix} numeric={c.type === "integer" || c.type === "real"} onClose={() => setCellEdit(null)} onSubmit={val => { if (!cellEdit) return; onCellEdited([cellEdit.col, cellEdit.row], { kind: GridCellKind.Text, data: val, displayData: val, allowOverlay: false }); setCellEdit(null); }} /></DialogContent>
          </>;
        })()}
      </Dialog>

      {/* Add column */}
      <Dialog open={colDialog} onClose={() => setColDialog(false)} fullWidth maxWidth="xs"><DialogTitle>新增列</DialogTitle>
        <DialogContent><AddColumnForm existing={rawDataCols.map(c => c.name)} onAdd={async col => { await api.addColumn(schema.name, col); setColDialog(false); await onSchemaChanged(); await reloadRows(); }} onClose={() => setColDialog(false)} /></DialogContent>
      </Dialog>

      {/* Rename view / column dialogs */}
      <RenameDialog value={renameOpen?.name ?? ""} existing={viewNames} open={!!renameOpen} onClose={() => setRenameOpen(null)} onSubmit={newName => { if (!renameOpen) return; const old = renameOpen.name; setState(prev => { if (!(old in prev.views)) return prev; const next: Record<string, ViewSpec> = {}; for (const [k, v] of Object.entries(prev.views)) next[k === old ? newName : k] = v; return { active: prev.active === old ? newName : prev.active, views: next }; }); setRenameOpen(null); }} />
      <RenameDialog value={renameColOpen?.from ?? ""} existing={rawDataCols.map(c => c.name)} open={!!renameColOpen} onClose={() => setRenameColOpen(null)} onSubmit={async newName => { if (!renameColOpen) return; const from = renameColOpen.from; setRenameColOpen(null); try { await api.renameColumn(schema.name, from, newName); await onSchemaChanged(); await reloadRows(); } catch (e) { setErr(String(e)); } }} />
    </Box>
  );
}

// ---- Sub-components ----
function CellEditor({ value: initial, prefix, numeric, onClose, onSubmit }: { value?: unknown; prefix?: string; numeric?: boolean; onClose: () => void; onSubmit: (v: string) => void }) {
  const start = prefix ?? (initial === null || initial === undefined ? "" : typeof initial === "object" ? JSON.stringify(initial) : String(initial));
  const [val, setVal] = useState(start);
  const composing = useRef(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 30); }, []);
  return <Stack spacing={1.5} sx={{ mt: 0.5 }}>
    <TextField inputRef={ref} fullWidth size="small" multiline maxRows={6} value={val} onChange={e => setVal(e.target.value)}
      onCompositionStart={() => composing.current = true} onCompositionEnd={() => composing.current = false}
      onKeyDown={e => { if (composing.current || e.nativeEvent.isComposing) return; if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(val); } else if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
      InputProps={{ sx: { fontFamily: numeric ? "ui-monospace, monospace" : undefined, fontSize: 13 } }} />
    <Typography variant="caption" color="text.secondary">Enter 保存 · Esc 取消 · Shift+Enter 换行</Typography>
    <Box><Button variant="contained" size="small" onClick={() => onSubmit(val)}>保存</Button><Button size="small" onClick={onClose} sx={{ ml: 1 }}>取消</Button></Box>
  </Stack>;
}

function AddColumnForm({ existing, onAdd, onClose }: { existing: string[]; onAdd: (col: ColumnDef) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(""); const [type, setType] = useState<ColumnType>("text"); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  return <Stack spacing={2} sx={{ mt: 0.5 }}>
    <TextField size="small" label="列名" value={name} onChange={e => setName(e.target.value)} autoFocus />
    <TextField size="small" label="类型" select value={type} onChange={e => setType(e.target.value as ColumnType)}>{TYPE_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}</TextField>
    {err && <Alert severity="error">{err}</Alert>}
    <Typography variant="caption" color="text.secondary">新列总是可空（NULL）。</Typography>
    <DialogActions><Button onClick={onClose} disabled={busy}>取消</Button><Button variant="contained" disabled={busy || !name.trim()} onClick={async () => { if (!name.trim() || existing.includes(name.trim())) { setErr("列名重复"); return; } setBusy(true); try { await onAdd({ name: name.trim(), type, nullable: true }); } catch (e) { setErr(String(e)); } finally { setBusy(false); } }}>添加</Button></DialogActions>
  </Stack>;
}

function RenameDialog({ open, value, existing, onClose, onSubmit }: { open: boolean; value: string; existing: string[]; onClose: () => void; onSubmit: (n: string) => void }) {
  const [name, setName] = useState(value);
  useEffect(() => setName(value), [value]);
  const dup = name.trim() !== value && existing.includes(name.trim());
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs"><DialogTitle>重命名</DialogTitle><DialogContent><TextField autoFocus fullWidth size="small" value={name} onChange={e => setName(e.target.value)} error={dup} helperText={dup ? "已存在" : ""} sx={{ mt: 1 }} /></DialogContent><DialogActions><Button onClick={onClose}>取消</Button><Button variant="contained" disabled={dup || !name.trim()} onClick={() => onSubmit(name.trim())}>保存</Button></DialogActions></Dialog>;
}

// ---- Config panels (shown when a view mode is selected but no spec exists yet) ----
function ChartConfigPanel({ cols, onApply }: { cols: ColumnDef[]; onApply: (c: ChartSpec) => void }) {
  const numeric = cols.filter(c => c.type === "integer" || c.type === "real");
  const [x, setX] = useState(cols[0]?.name ?? "");
  const [y, setY] = useState<string[]>(numeric.length > 0 ? [numeric[0].name] : []);
  const [type, setType] = useState<ChartSpec["type"]>("bar");
  const toggleY = (name: string) => setY(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  return (
    <Stack spacing={2} sx={{ p: 3, maxWidth: 420, mx: "auto", flex: 1, justifyContent: "center" }}>
      <Stack direction="row" spacing={1} alignItems="center"><ShowChartIcon color="primary" /><Typography variant="h6">配置图表</Typography></Stack>
      <Typography variant="body2" color="text.secondary">选列就能出图。也可直接对左边 AI 说「画个柱状图」让它帮你。</Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="body2" sx={{ width: 60, flexShrink: 0 }}>类型</Typography>
        <ToggleButtonGroup size="small" value={type} exclusive onChange={(_, v) => v && setType(v)}>
          <ToggleButton value="bar">柱状</ToggleButton><ToggleButton value="line">折线</ToggleButton><ToggleButton value="pie">饼图</ToggleButton><ToggleButton value="area">面积</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="body2" sx={{ width: 60, flexShrink: 0 }}>X 轴</Typography>
        <TextField select size="small" value={x} onChange={e => setX(e.target.value)} fullWidth>
          {cols.map(c => <MenuItem key={c.name} value={c.name}>{c.name} ({c.type})</MenuItem>)}
        </TextField>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <Typography variant="body2" sx={{ width: 60, flexShrink: 0, mt: 1 }}>Y 轴</Typography>
        <Box sx={{ flex: 1 }}>
          {numeric.length === 0 && <Typography variant="caption" color="text.secondary">没有数字列</Typography>}
          {numeric.map(c => <Chip key={c.name} size="small" label={`${c.name} (${c.type})`} variant={y.includes(c.name) ? "filled" : "outlined"} color={y.includes(c.name) ? "primary" : "default"} onClick={() => toggleY(c.name)} sx={{ mr: 0.5, mb: 0.5 }} />)}
        </Box>
      </Stack>
      <Button variant="contained" startIcon={<ShowChartIcon />} disabled={!x || y.length === 0} onClick={() => onApply({ type, x, y })}>生成图表</Button>
    </Stack>
  );
}

function CardsConfigPanel({ cols, onApply }: { cols: ColumnDef[]; onApply: (c: CardsSpec) => void }) {
  const [title, setTitle] = useState(cols[0]?.name ?? "");
  const [fields, setFields] = useState<string[]>(cols.slice(0, 4).map(c => c.name));
  const toggleF = (name: string) => setFields(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  return (
    <Stack spacing={2} sx={{ p: 3, maxWidth: 420, mx: "auto", flex: 1, justifyContent: "center" }}>
      <Stack direction="row" spacing={1} alignItems="center"><ViewModuleIcon color="primary" /><Typography variant="h6">配置卡片</Typography></Stack>
      <Typography variant="body2" color="text.secondary">每一行变成一张卡片。或对 AI 说「做成 Kanban 看板」。</Typography>
      <TextField select size="small" label="标题列" value={title} onChange={e => setTitle(e.target.value)}>{cols.map(c => <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>)}</TextField>
      <Box><Typography variant="caption" color="text.secondary" gutterBottom>正文列（点击切换）</Typography>
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
          {cols.map(c => <Chip key={c.name} size="small" label={c.name} variant={fields.includes(c.name) ? "filled" : "outlined"} color={fields.includes(c.name) ? "primary" : "default"} onClick={() => toggleF(c.name)} />)}
        </Stack>
      </Box>
      <Button variant="contained" startIcon={<ViewModuleIcon />} disabled={!title} onClick={() => onApply({ title, fields })}>生成卡片</Button>
    </Stack>
  );
}

function MarkdownConfigPanel({ cols, tableName, rows, onApply }: { cols: ColumnDef[]; tableName: string; rows: Row[]; onApply: (m: MarkdownSpec) => void }) {
  const colList = cols.map(c => `- ${c.name} (${c.type})`).join("\n");
  const rowSample = rows.slice(0, 3).map((r, i) => `- 第 ${i+1} 行：${cols.map(c => `${c.name}=${r[c.name] ?? "—"}`).join(", ")}`).join("\n");
  const template = [
    `# ${tableName} 报告`,
    "",
    `共 **{{rowCount}}** 行。`,
    "",
    "## 列",
    colList,
    "",
    "## 数据摘要",
    rowSample,
    "",
    "> AI 也可以帮你写这份报告——对左边说「写个总结」。",
  ].join("\n");
  const [md, setMd] = useState(template);
  return (
    <Stack spacing={2} sx={{ p: 3, maxWidth: 560, mx: "auto", flex: 1, justifyContent: "center" }}>
      <Stack direction="row" spacing={1} alignItems="center"><ArticleOutlinedIcon color="primary" /><Typography variant="h6">Markdown 报告</Typography></Stack>
      <Typography variant="body2" color="text.secondary">支持模板：{"{{table}} {{rowCount}} {{sum:col}} {{avg:col}} {{rows.0.col}}"}</Typography>
      <TextField multiline minRows={8} maxRows={20} value={md} onChange={e => setMd(e.target.value)} InputProps={{ sx: { fontFamily: "ui-monospace, monospace", fontSize: 12.5 } }} />
      <Stack direction="row" spacing={1}>
        <Button variant="contained" startIcon={<ArticleOutlinedIcon />} onClick={() => onApply({ markdown: md })}>生成报告</Button>
        <Button variant="outlined" startIcon={<AutoAwesomeIcon />} onClick={() => onApply({ markdown: template })}>用模板重置</Button>
      </Stack>
    </Stack>
  );
}
