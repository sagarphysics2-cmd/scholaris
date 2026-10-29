"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Chart primitives (Recharts). Conventions from the data-viz method:
 * one y-axis, thin marks, 2px lines, rounded bar ends, recessive grid, tooltip on hover,
 * legend whenever there are ≥2 series, text in text colours (never the series colour).
 * Colours come from CSS tokens so light/dark themes swap automatically.
 */

/** Compact tick labels (12k, 1.2M) so large values never clip. */
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const tick = (unit: string) => (v: number) => `${Math.abs(v) >= 10000 ? compact.format(v) : v}${unit}`;

const axis = { stroke: "var(--muted-foreground)", fontSize: 12, tickLine: false, axisLine: false } as const;

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-medium text-foreground">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="font-medium tabular-nums text-foreground">{typeof p.value === "number" ? p.value.toLocaleString() : p.value}{unit}</span>
        </p>
      ))}
    </div>
  );
}

/** Legend labels stay in text colour — the swatch carries identity, not the text. */
const legendText = (value: string) => <span style={{ color: "var(--muted-foreground)" }}>{value}</span>;

export type SeriesDef = { key: string; label: string; color: string };

/** Line/area trend for change over time (e.g. daily attendance %). */
export function TrendChart({
  data,
  xKey,
  series,
  unit = "",
  height = 260,
  yDomain,
}: {
  data: Array<Record<string, string | number | null>>;
  xKey: string;
  series: SeriesDef[];
  unit?: string;
  height?: number;
  yDomain?: [number | "auto", number | "auto"];
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey={xKey} {...axis} minTickGap={24} />
          <YAxis {...axis} domain={yDomain ?? ["auto", "auto"]} tickFormatter={tick(unit)} width={48} />
          <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} />
          {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={legendText} />}
          {series.map((s) => (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} fill={`url(#grad-${s.key})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} connectNulls animationDuration={600} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Vertical bars — single series or stacked. */
export function BarsChart({
  data,
  xKey,
  series,
  unit = "",
  height = 260,
  stacked = false,
  layout = "vertical",
  yDomain,
}: {
  data: Array<Record<string, string | number | null>>;
  xKey: string;
  series: SeriesDef[];
  unit?: string;
  height?: number;
  stacked?: boolean;
  layout?: "vertical" | "horizontal";
  yDomain?: [number | "auto", number | "auto"];
}) {
  const horizontal = layout === "horizontal";
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, left: horizontal ? 8 : 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke="var(--border)" strokeDasharray="3 3" />
          {horizontal ? (
            <>
              <XAxis type="number" {...axis} tickFormatter={tick(unit)} domain={yDomain ?? [0, "auto"]} />
              <YAxis type="category" dataKey={xKey} {...axis} width={90} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} {...axis} interval={0} tick={{ fontSize: 11 }} />
              <YAxis {...axis} tickFormatter={tick(unit)} width={48} domain={yDomain ?? [0, "auto"]} />
            </>
          )}
          <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
          {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={legendText} />}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              stackId={stacked ? "a" : undefined}
              stroke="var(--card)"
              strokeWidth={stacked ? 1 : 0}
              radius={!stacked || i === series.length - 1 ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0}
              maxBarSize={44}
              animationDuration={600}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Part-to-whole donut with a labelled legend (values shown, so identity is never colour-alone). */
export function DonutChart({ data, height = 220, centerLabel, centerValue }: { data: Array<{ name: string; value: number; color: string }>; height?: number; centerLabel?: string; centerValue?: string }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="flex flex-col items-center gap-5">
      <div style={{ height, width: height }} className="relative shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="66%" outerRadius="100%" paddingAngle={data.filter((d) => d.value > 0).length > 1 ? 2 : 0} stroke="var(--card)" strokeWidth={2}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {centerValue && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-2xl font-semibold tabular-nums">{centerValue}</p>
              {centerLabel && <p className="text-xs text-muted-foreground">{centerLabel}</p>}
            </div>
          </div>
        )}
      </div>
      <ul className="w-full space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.color }} aria-hidden />
            <span className="text-muted-foreground">{d.name}</span>
            <span className="ml-auto font-medium tabular-nums">{d.value.toLocaleString()}</span>
            <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{total ? `${Math.round((d.value / total) * 100)}%` : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
