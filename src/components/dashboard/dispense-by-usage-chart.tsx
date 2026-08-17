"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useThemeColor } from "@/lib/resolve-color";
import { ChartContainer } from "./chart-container";
import { Dot, Panel } from "./primitives";
import { USAGE_SERIES, USAGE_SERIES_LABELS, USAGE_SERIES_COLORS, type UsageSeries } from "@/lib/dashboard-usage";
import type { DispenseByUsageMonth } from "@/lib/dashboard-types";
import { useDispenseByUsage } from "@/hooks/use-dashboard-queries";

// Recharts reads flat keys off each datum, so the API's { records: {SERIES: n} } map is
// spread out here. `units` is carried alongside for the tooltip and never drawn.
type Datum = { month: string; units: Record<string, number> } & Record<UsageSeries, number>;

function toChartData(rows: DispenseByUsageMonth[]): Datum[] {
  return rows.map((r) => ({
    month: r.month,
    units: r.units,
    ...(Object.fromEntries(USAGE_SERIES.map((s) => [s, r.records[s] ?? 0])) as Record<UsageSeries, number>),
  }));
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; dataKey: string; value: number; color: string; payload: Datum }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const shown = payload.filter((p) => p.value > 0);
  const total = payload.reduce((n, p) => n + p.value, 0);
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium text-foreground">
        {label} · รวม {total.toLocaleString("th-TH")} ครั้ง
      </p>
      {/* Top of the stack first, so the rows read in the order the bands are drawn. */}
      {[...shown].reverse().map((p) => (
        <p key={p.dataKey} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}:{" "}
          <span className="font-semibold text-foreground">{p.value.toLocaleString("th-TH")} ครั้ง</span>
          {/* หน่วย is the detail, not the measure: it explains a tall band that moved little
              stock, and stays out of the axis so the bar keeps meaning "how often". */}
          <span className="text-xs">· {(p.payload.units[p.dataKey] ?? 0).toLocaleString("th-TH")} ชิ้น</span>
        </p>
      ))}
    </div>
  );
}

// Twelve all-zero buckets still draw a full axis, which reads as "การเบิกหยุดไปแล้ว" rather
// than "ยังไม่เคยมีใครเบิก" — master data imports carry no movement history.
function UsageEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <span className="grid size-12 place-items-center rounded-full bg-secondary">
        <Activity className="size-5 text-muted-foreground" />
      </span>
      <div className="text-center">
        <p className="text-[13px] font-medium text-foreground">ยังไม่มีการเบิกออก</p>
        <p className="mt-0.5 text-xs text-muted-foreground">กราฟจะแสดงเมื่อมีการเบิกครั้งแรก</p>
      </div>
    </div>
  );
}

export function DispenseByUsageChart() {
  const { data: rows = [], isLoading, error, refetch } = useDispenseByUsage();

  // One hook per series, fixed order — useThemeColor takes a single var.
  const colors: Record<UsageSeries, string> = {
    COURSE: useThemeColor(USAGE_SERIES_COLORS.COURSE),
    ACTIVITY: useThemeColor(USAGE_SERIES_COLORS.ACTIVITY),
    OTHER: useThemeColor(USAGE_SERIES_COLORS.OTHER),
    STATION: useThemeColor(USAGE_SERIES_COLORS.STATION),
    UNKNOWN: useThemeColor(USAGE_SERIES_COLORS.UNKNOWN),
  };

  const data = toChartData(rows);
  // A series nobody used is a legend entry that teaches nothing — and "ไม่ระบุ" only exists
  // for rows written before usageType was required, so on a clean warehouse it must not show.
  const active = USAGE_SERIES.filter((s) => data.some((d) => d[s] > 0));

  return (
    <Panel
      title="การเบิกออกรายเดือน"
      hint="แยกตามการใช้งาน ย้อนหลัง 1 ปี (หน่วย: ครั้ง)"
      action={
        active.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-[11px] font-medium">
            {active.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <Dot style={{ background: colors[s] }} /> {USAGE_SERIES_LABELS[s]}
              </span>
            ))}
          </div>
        ) : undefined
      }
    >
      {isLoading ? (
        <Skeleton className="h-[280px] w-full rounded-xl" />
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-10">
          <p className="text-sm text-destructive">{error.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            โหลดใหม่
          </Button>
        </div>
      ) : active.length === 0 ? (
        <UsageEmpty />
      ) : (
        <div
          className="h-[280px] w-full"
          role="img"
          aria-label={`การเบิกออกรายเดือนแยกตามการใช้งาน: ${data
            .map((d) => `${d.month} ${active.map((s) => `${USAGE_SERIES_LABELS[s]} ${d[s]}`).join(" ")}`)
            .join(", ")}`}
        >
          <ChartContainer>
            {({ width, height }) => (
              <BarChart data={data} width={width} height={height} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--secondary)" }} />
                {active.map((s, i) => (
                  <Bar
                    key={s}
                    dataKey={s}
                    stackId="usage"
                    name={USAGE_SERIES_LABELS[s]}
                    fill={colors[s]}
                    // Only the top band gets the rounded cap, or every segment reads as its
                    // own bar and the stack stops looking like one month's total.
                    radius={i === active.length - 1 ? [6, 6, 0, 0] : undefined}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            )}
          </ChartContainer>
        </div>
      )}
    </Panel>
  );
}
