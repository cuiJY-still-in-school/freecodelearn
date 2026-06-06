import { Box, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { useMemo } from "react";
import type { CardsSpec, ViewContext } from "./types";

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function CardsView({
  spec,
  ctx,
}: {
  spec: CardsSpec;
  ctx: ViewContext;
}) {
  const validCols = useMemo(
    () => new Set(ctx.rawDataCols.map((c) => c.name)),
    [ctx.rawDataCols]
  );

  const titleKey = validCols.has(spec.title) ? spec.title : ctx.rawDataCols[0]?.name;
  const subtitleKey =
    spec.subtitle && validCols.has(spec.subtitle) ? spec.subtitle : null;
  const badgeKey =
    spec.badge && validCols.has(spec.badge) ? spec.badge : null;
  const groupKey =
    spec.groupBy && validCols.has(spec.groupBy) ? spec.groupBy : null;
  const fieldKeys = (spec.fields ?? [])
    .filter((f) => validCols.has(f))
    .filter((f) => f !== titleKey && f !== subtitleKey && f !== badgeKey);

  const renderCard = (r: Record<string, unknown>) => (
    <Card
      key={String(r._id)}
      variant="outlined"
      sx={{
        minWidth: 240,
        maxWidth: 320,
        borderRadius: 2,
        transition: "transform .1s, box-shadow .1s",
        "&:hover": { transform: "translateY(-1px)", boxShadow: 2 },
      }}
    >
      <CardContent sx={{ p: 1.6, "&:last-child": { pb: 1.6 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle2" fontWeight={600} noWrap>
              {fmt(titleKey ? r[titleKey] : "")}
            </Typography>
            {subtitleKey && (
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ display: "block" }}
              >
                {fmt(r[subtitleKey])}
              </Typography>
            )}
          </Box>
          {badgeKey && r[badgeKey] !== null && r[badgeKey] !== undefined && (
            <Chip
              size="small"
              label={fmt(r[badgeKey])}
              sx={{ height: 20, fontSize: 11 }}
            />
          )}
        </Stack>
        {fieldKeys.length > 0 && (
          <Stack spacing={0.4} sx={{ mt: 1.2 }}>
            {fieldKeys.map((f) => (
              <Stack
                key={f}
                direction="row"
                justifyContent="space-between"
                spacing={1}
              >
                <Typography variant="caption" color="text.secondary">
                  {f}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: "ui-monospace, monospace",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 180,
                  }}
                >
                  {fmt(r[f])}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );

  if (groupKey) {
    // Kanban: one column per distinct value.
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const r of ctx.rows) {
      const key = fmt(r[groupKey]) || "—";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    return (
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          p: 2,
        }}
      >
        <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
          {Array.from(groups.entries()).map(([key, items]) => (
            <Box
              key={key}
              sx={{
                minWidth: 280,
                width: 280,
                bgcolor: (t) =>
                  t.palette.mode === "dark"
                    ? "rgba(255,255,255,0.03)"
                    : "rgba(0,0,0,0.025)",
                borderRadius: 2,
                p: 1.2,
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ px: 0.5, pb: 1 }}
              >
                <Typography variant="overline" sx={{ fontWeight: 600 }}>
                  {key}
                </Typography>
                <Chip
                  size="small"
                  label={items.length}
                  sx={{ height: 18, fontSize: 10.5 }}
                />
              </Stack>
              <Stack spacing={1}>{items.map(renderCard)}</Stack>
            </Box>
          ))}
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 1.5,
        }}
      >
        {ctx.rows.map(renderCard)}
      </Box>
    </Box>
  );
}
