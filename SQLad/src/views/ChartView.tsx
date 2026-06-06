import {
  Alert,
  Box,
  Chip,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { useMemo } from "react";
import type { ChartSpec, Row, ViewContext } from "./types";

const PALETTE = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#a855f7",
  "#06b6d4",
  "#84cc16",
  "#f43f5e",
  "#0ea5e9",
  "#eab308",
];

function aggregate(
  rows: Row[],
  xKey: string,
  yKeys: string[],
  agg: ChartSpec["agg"],
  seriesKey?: string | null
): Array<Record<string, unknown>> {
  if (!agg || agg === "none") {
    // No aggregation: each row → one data point. If seriesKey set, pivot.
    if (seriesKey) {
      const buckets = new Map<string, Record<string, unknown>>();
      for (const r of rows) {
        const x = String(r[xKey] ?? "");
        const s = String(r[seriesKey] ?? "");
        if (!buckets.has(x)) buckets.set(x, { [xKey]: r[xKey] });
        const yKey = yKeys[0];
        if (yKey) {
          buckets.get(x)![s] = r[yKey];
        }
      }
      return Array.from(buckets.values());
    }
    return rows.map((r) => {
      const out: Record<string, unknown> = { [xKey]: r[xKey] };
      yKeys.forEach((y) => (out[y] = r[y]));
      return out;
    });
  }

  // Aggregating: group by x (and optionally series).
  type Bucket = {
    values: Record<string, number[]>;
    raw: Record<string, unknown>;
  };
  const buckets = new Map<string, Bucket>();
  for (const r of rows) {
    const x = String(r[xKey] ?? "");
    if (!buckets.has(x)) {
      buckets.set(x, { values: {}, raw: { [xKey]: r[xKey] } });
    }
    const b = buckets.get(x)!;
    if (seriesKey) {
      const sName = String(r[seriesKey] ?? "");
      const yKey = yKeys[0];
      if (!yKey) continue;
      const n = Number(r[yKey]);
      if (!Number.isFinite(n) && agg !== "count") continue;
      b.values[sName] ??= [];
      b.values[sName].push(agg === "count" ? 1 : n);
    } else {
      for (const yKey of yKeys) {
        const n = Number(r[yKey]);
        if (!Number.isFinite(n) && agg !== "count") continue;
        b.values[yKey] ??= [];
        b.values[yKey].push(agg === "count" ? 1 : n);
      }
    }
  }
  const reduce = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    switch (agg) {
      case "sum":
        return arr.reduce((a, b) => a + b, 0);
      case "avg":
        return arr.reduce((a, b) => a + b, 0) / arr.length;
      case "min":
        return Math.min(...arr);
      case "max":
        return Math.max(...arr);
      case "count":
        return arr.length;
      default:
        return arr[0];
    }
  };
  return Array.from(buckets.values()).map(({ values, raw }) => {
    const out: Record<string, unknown> = { ...raw };
    for (const [k, arr] of Object.entries(values)) {
      out[k] = reduce(arr);
    }
    return out;
  });
}

export function ChartView({
  spec,
  ctx,
}: {
  spec: ChartSpec;
  ctx: ViewContext;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const grid = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const text = isDark ? "#b6bcc4" : "#4b5560";

  const validCols = useMemo(
    () => new Set(ctx.rawDataCols.map((c) => c.name)),
    [ctx.rawDataCols]
  );

  const issues: string[] = [];
  if (!validCols.has(spec.x)) issues.push(`x 列 "${spec.x}" 不存在`);
  const yValid = spec.y.filter((y) => validCols.has(y));
  if (yValid.length === 0) issues.push("没有有效的 y 列");
  if (spec.series && !validCols.has(spec.series))
    issues.push(`series 列 "${spec.series}" 不存在`);

  const data = useMemo(
    () =>
      issues.length === 0
        ? aggregate(ctx.rows, spec.x, yValid, spec.agg ?? "none", spec.series)
        : [],
    [ctx.rows, spec.x, yValid, spec.agg, spec.series, issues.length]
  );

  if (issues.length > 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">{issues.join("；")}</Alert>
      </Box>
    );
  }

  // Determine series names actually present in `data`.
  const seriesNames: string[] = spec.series
    ? Array.from(
        new Set(
          data.flatMap((d) =>
            Object.keys(d).filter((k) => k !== spec.x)
          )
        )
      )
    : yValid;

  const header = (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.2 }}>
      <Typography variant="subtitle1" fontWeight={600}>
        {spec.title ?? `${spec.type} chart`}
      </Typography>
      <Chip size="small" label={spec.type} sx={{ height: 20, fontSize: 11 }} />
      {spec.agg && spec.agg !== "none" && (
        <Chip
          size="small"
          variant="outlined"
          label={`agg: ${spec.agg}`}
          sx={{ height: 20, fontSize: 11 }}
        />
      )}
      <Typography variant="caption" color="text.secondary">
        x: {spec.x} · y: {yValid.join(", ")}
        {spec.series ? ` · series: ${spec.series}` : ""}
      </Typography>
    </Stack>
  );

  const tooltipStyle = {
    backgroundColor: isDark ? "#161a22" : "#ffffff",
    border: `1px solid ${grid}`,
    fontSize: 12,
    color: isDark ? "#e6e8eb" : "#1c2229",
  };

  let chart: React.ReactNode = null;
  const commonAxis = {
    stroke: text,
    fontSize: 11,
    tickMargin: 6,
  };

  if (spec.type === "bar") {
    chart = (
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={grid} vertical={false} />
        <XAxis dataKey={spec.x} {...commonAxis} />
        <YAxis {...commonAxis} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: grid }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {seriesNames.map((s, i) => (
          <Bar
            key={s}
            dataKey={s}
            fill={PALETTE[i % PALETTE.length]}
            stackId={spec.stacked ? "a" : undefined}
            radius={[3, 3, 0, 0]}
          />
        ))}
      </BarChart>
    );
  } else if (spec.type === "line") {
    chart = (
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={grid} />
        <XAxis dataKey={spec.x} {...commonAxis} />
        <YAxis {...commonAxis} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {seriesNames.map((s, i) => (
          <Line
            key={s}
            type="monotone"
            dataKey={s}
            stroke={PALETTE[i % PALETTE.length]}
            dot={false}
            strokeWidth={2}
          />
        ))}
      </LineChart>
    );
  } else if (spec.type === "area") {
    chart = (
      <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={grid} />
        <XAxis dataKey={spec.x} {...commonAxis} />
        <YAxis {...commonAxis} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {seriesNames.map((s, i) => (
          <Area
            key={s}
            type="monotone"
            dataKey={s}
            stroke={PALETTE[i % PALETTE.length]}
            fill={PALETTE[i % PALETTE.length] + "55"}
            stackId={spec.stacked ? "a" : undefined}
          />
        ))}
      </AreaChart>
    );
  } else if (spec.type === "scatter") {
    chart = (
      <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke={grid} />
        <XAxis dataKey={spec.x} type="number" {...commonAxis} />
        <YAxis dataKey={yValid[0]} type="number" {...commonAxis} />
        <ZAxis range={[40, 200]} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: grid }} />
        <Scatter
          data={data}
          fill={PALETTE[0]}
        />
      </ScatterChart>
    );
  } else if (spec.type === "pie") {
    const yKey = yValid[0];
    const pieData = data.map((d, i) => ({
      name: String(d[spec.x]),
      value: Number(d[yKey] ?? 0),
      fill: PALETTE[i % PALETTE.length],
    }));
    chart = (
      <PieChart>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Pie
          data={pieData}
          dataKey="value"
          nameKey="name"
          innerRadius="40%"
          outerRadius="75%"
          paddingAngle={2}
          label={(p: { name?: string; percent?: number }) =>
            `${p.name ?? ""} ${((p.percent ?? 0) * 100).toFixed(0)}%`
          }
        >
          {pieData.map((p, i) => (
            <Cell key={i} fill={p.fill} />
          ))}
        </Pie>
      </PieChart>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        p: 2.5,
      }}
    >
      {header}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          {chart as React.ReactElement}
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}
