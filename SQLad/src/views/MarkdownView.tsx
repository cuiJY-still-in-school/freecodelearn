import { Box, useTheme } from "@mui/material";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";
import type { MarkdownSpec, ViewContext } from "./types";

/** Lightweight template substitution: replaces `{{rows.0.product}}`,
 *  `{{table}}`, `{{rowCount}}` and `{{sum:units}}`, `{{avg:revenue}}` etc.
 *  Anything unmatched is left in place. Kept tiny on purpose so AI can rely
 *  on a stable, small surface. */
function applyTemplates(md: string, ctx: ViewContext): string {
  const rows = ctx.rows;
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
  return md.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr: string) => {
    const e = expr.trim();
    if (e === "table") return ctx.schemaName;
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
}

export function MarkdownView({
  spec,
  ctx,
}: {
  spec: MarkdownSpec;
  ctx: ViewContext;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const html = useMemo(() => {
    const src = applyTemplates(spec.markdown ?? "", ctx);
    const rendered = marked.parse(src, {
      gfm: true,
      breaks: false,
      async: false,
    }) as string;
    return DOMPurify.sanitize(rendered, {
      ADD_ATTR: ["target", "rel"],
      // Allow style attributes for AI-styled blocks but block scripts.
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
    });
  }, [spec.markdown, ctx]);

  return (
    <Box
      sx={{
        flex: 1,
        overflow: "auto",
        p: 3,
        // Markdown-rendered HTML styling. Scoped via `.md` class.
        "& .md": {
          fontSize: 14,
          lineHeight: 1.7,
          color: "text.primary",
          maxWidth: 920,
          mx: "auto",
        },
        "& .md h1": { fontSize: 26, fontWeight: 700, mt: 1.5, mb: 1.2 },
        "& .md h2": {
          fontSize: 20,
          fontWeight: 600,
          mt: 3,
          mb: 1,
          pb: 0.6,
          borderBottom: 1,
          borderColor: "divider",
        },
        "& .md h3": { fontSize: 16, fontWeight: 600, mt: 2.2, mb: 0.8 },
        "& .md p": { my: 1 },
        "& .md ul, & .md ol": { my: 1, pl: 3 },
        "& .md li": { my: 0.4 },
        "& .md a": {
          color: isDark ? "#60a5fa" : "#1d4ed8",
          textDecoration: "none",
          "&:hover": { textDecoration: "underline" },
        },
        "& .md code": {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12.5,
          bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
          px: 0.6,
          py: 0.1,
          borderRadius: 0.6,
        },
        "& .md pre": {
          bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
          p: 1.5,
          borderRadius: 1,
          overflowX: "auto",
          my: 1.4,
          border: 1,
          borderColor: "divider",
        },
        "& .md pre code": {
          bgcolor: "transparent",
          p: 0,
          fontSize: 12.5,
        },
        "& .md blockquote": {
          borderLeft: 3,
          borderColor: "primary.main",
          color: "text.secondary",
          pl: 1.6,
          my: 1.2,
          mx: 0,
        },
        "& .md table": {
          borderCollapse: "collapse",
          width: "100%",
          fontSize: 13,
          my: 1.4,
        },
        "& .md th, & .md td": {
          border: 1,
          borderColor: "divider",
          px: 1,
          py: 0.6,
          textAlign: "left",
        },
        "& .md th": {
          fontWeight: 600,
          bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
        },
        "& .md hr": {
          border: 0,
          borderTop: 1,
          borderColor: "divider",
          my: 2.2,
        },
        "& .md img": { maxWidth: "100%" },
      }}
    >
      {spec.title && (
        <Box
          component="h1"
          sx={{
            fontSize: 22,
            fontWeight: 700,
            mt: 0,
            mb: 1.5,
            maxWidth: 920,
            mx: "auto",
          }}
        >
          {spec.title}
        </Box>
      )}
      <Box className="md" dangerouslySetInnerHTML={{ __html: html }} />
    </Box>
  );
}
