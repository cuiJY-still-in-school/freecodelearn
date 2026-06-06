import type { ColumnDef } from "../api/types";

export type Row = Record<string, unknown> & { _id: number };

export type ViewMode = "spreadsheet" | "chart" | "cards" | "markdown";

export type ChartType = "bar" | "line" | "area" | "scatter" | "pie";

export type ChartAgg = "none" | "sum" | "avg" | "count" | "min" | "max";

export interface ChartSpec {
  type: ChartType;
  /** Category / x-axis column. */
  x: string;
  /** Numeric series columns. */
  y: string[];
  /** Optional series-grouping column; if set, each distinct value becomes its own series. */
  series?: string | null;
  /** Aggregation applied per (x [, series]) bucket. "none" = no aggregation, plot raw rows. */
  agg?: ChartAgg;
  title?: string;
  /** Stacked bars/areas. */
  stacked?: boolean;
}

export interface CardsSpec {
  /** Column shown as card title. */
  title: string;
  /** Optional subtitle column. */
  subtitle?: string | null;
  /** Body columns shown as key/value rows. */
  fields?: string[];
  /** If set, group cards into kanban columns by this column's value. */
  groupBy?: string | null;
  /** Optional badge column (e.g. status). */
  badge?: string | null;
}

export interface MarkdownSpec {
  /** Markdown source. Rendered via marked + DOMPurify; supports tables,
   *  code blocks, headings, lists, blockquotes, etc. */
  markdown: string;
  title?: string;
}

/** Single view configuration. */
export interface ViewSpec {
  mode: ViewMode;
  hidden: string[];
  order: string[];
  widths: Record<string, number>;
  sort: { column: string; direction: "asc" | "desc" } | null;
  filter: string | null;
  chart: ChartSpec | null;
  cards: CardsSpec | null;
  markdown: MarkdownSpec | null;
}

export const emptySpec = (): ViewSpec => ({
  mode: "spreadsheet",
  hidden: [],
  order: [],
  widths: {},
  sort: null,
  filter: null,
  chart: null,
  cards: null,
  markdown: null,
});

/** Per-table state: multiple named views + which is active. */
export interface TableViewState {
  active: string;
  views: Record<string, ViewSpec>;
}

export const DEFAULT_VIEW_NAME = "默认";

export const emptyState = (): TableViewState => ({
  active: DEFAULT_VIEW_NAME,
  views: { [DEFAULT_VIEW_NAME]: emptySpec() },
});

/** Migrate any pre-multi-view stored value into the new shape. */
export function migrateStoredView(raw: unknown): TableViewState {
  if (!raw || typeof raw !== "object") return emptyState();
  const obj = raw as Record<string, unknown>;
  // Already in new shape?
  if (
    typeof obj.active === "string" &&
    obj.views &&
    typeof obj.views === "object"
  ) {
    return {
      active: obj.active,
      views: obj.views as Record<string, ViewSpec>,
    };
  }
  // Old single-spec shape — wrap it.
  // Also handle the older `html` field by mapping it into `markdown` as a
  // code block, since we no longer ship an HTML mode.
  const spec: ViewSpec = {
    mode: (obj.mode as ViewMode) ?? "spreadsheet",
    hidden: (obj.hidden as string[]) ?? [],
    order: (obj.order as string[]) ?? [],
    widths: (obj.widths as Record<string, number>) ?? {},
    sort: (obj.sort as ViewSpec["sort"]) ?? null,
    filter: (obj.filter as string | null) ?? null,
    chart: (obj.chart as ChartSpec | null) ?? null,
    cards: (obj.cards as CardsSpec | null) ?? null,
    markdown: (obj.markdown as MarkdownSpec | null) ?? null,
  };
  // Best-effort: if the legacy `html` object exists and markdown doesn't,
  // wrap the HTML in a code fence so the data isn't lost.
  if (!spec.markdown && obj.html && typeof obj.html === "object") {
    const h = obj.html as { html?: string; title?: string };
    if (typeof h.html === "string") {
      spec.markdown = {
        title: h.title,
        markdown: "```html\n" + h.html + "\n```",
      };
      if (spec.mode === ("html" as ViewMode)) spec.mode = "markdown";
    }
  } else if (spec.mode === ("html" as ViewMode)) {
    spec.mode = "spreadsheet";
  }
  return {
    active: DEFAULT_VIEW_NAME,
    views: { [DEFAULT_VIEW_NAME]: spec },
  };
}

export interface ViewContext {
  schemaName: string;
  rawDataCols: ColumnDef[];
  rows: Row[];
}
