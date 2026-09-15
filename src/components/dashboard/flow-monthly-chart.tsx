"use client";

import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Activity } from "lucide-react";
import { useThemeColor } from "@/lib/resolve-color";
import { ChartContainer } from "./chart-container";
import { Dot, Panel, WidgetState } from "./primitives";
import { useFlowMonthly } from "@/hooks/use-dashboard-queries";

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold text-foreground">{p.value.toLocaleString("th-TH")} ชิ้น</span>
        </p>
      ))}
    </div>
  );
}

/**
 * ออก vs กลับ over 12 months, for ยืม and นำไปใช้งาน alike — the labels are the only
 * difference, so one component serves both tabs.
 *
 * The gap between the two areas is the whole message: lines that track each other mean stock
 * comes home, a widening mouth means it does not. That is why both live on one chart instead
 * of two cards.
 *
 * ค้างสะสม is a Line, not a third Area: it is a level (how much is out right now) while the
 * other two are flows (how much moved this month), and only the flows are worth shading.
 *
 * All three are ชิ้น, never ครั้ง: loans minus return events is not a quantity of anything and
 * goes negative. The route carries the balance forward instead of subtracting the two totals.
 */
export function FlowMonthlyChart({
  title,
  hint,
  outLabel,
  backLabel,
  gapLabel,
}: {
  title: string;
  hint: string;
  outLabel: string;
  backLabel: string;
  gapLabel: string;
}) {
  const { data, isLoading, error, refetch } = useFlowMonthly();
  const outColor = useThemeColor("--chart-1");
  const backColor = useThemeColor("--chart-2");
  const gapColor = useThemeColor("--warning");
  const rows = data?.rows ?? [];
  // outstanding อยู่ในเงื่อนไขด้วย เพราะมันไม่ได้เกิดจากสองตัวข้างหน้า: route ตั้งต้นยอดยกมาจาก
  // ก่อนหน้าต่าง 12 เดือน แล้วค่อยบวกลบรายเดือน ของที่ยืมออกไปเมื่อ 14 เดือนก่อนและยังไม่คืนจึงมี
  // out = back = 0 ครบทั้งปีทั้งที่ยังค้างอยู่จริง. ตัดสินจากสองตัวแรกอย่างเดียวแปลว่าหน้าจอขึ้นว่า
  // "ยังไม่มีความเคลื่อนไหว" ทับยอดค้างที่ KPI การ์ดบนแท็บเดียวกันยังนับให้เห็นอยู่
  const empty = rows.every((r) => r.out === 0 && r.back === 0 && r.outstanding === 0);

  return (
    <Panel
      title={title}
      hint={hint}
      action={
        !isLoading && !error && !empty ? (
          <div className="flex shrink-0 gap-3 text-[11px] font-medium">
            <span className="inline-flex items-center gap-1.5">
              <Dot style={{ background: outColor }} /> {outLabel}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Dot style={{ background: backColor }} /> {backLabel}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Dot style={{ background: gapColor }} /> {gapLabel}
            </span>
          </div>
        ) : undefined
      }
    >
      <WidgetState
        isLoading={isLoading}
        error={error}
        onRetry={() => refetch()}
        isEmpty={empty}
        icon={Activity}
        emptyTitle="ยังไม่มีความเคลื่อนไหว"
        emptyHint="กราฟจะแสดงเมื่อมีรายการแรก"
        skeletonClassName="h-[320px] w-full rounded-xl"
      >
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            [outLabel, data?.totalOut ?? 0, "text-chart-1"],
            [backLabel, data?.totalBack ?? 0, "text-chart-2"],
            // The latest point of the line, not a 12-month sum — the other two chips total a
            // flow, this one reads a level, and summing a level would be meaningless.
            [gapLabel, data?.outstanding ?? 0, "text-warning"],
          ].map(([label, value, cls]) => (
            <div key={label as string} className="rounded-xl bg-secondary/50 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">{label as string}</p>
              <p className={`text-lg font-bold tabular-nums ${cls as string}`}>
                {(value as number).toLocaleString("th-TH")}
              </p>
            </div>
          ))}
        </div>
        <div
          className="h-[260px] w-full"
          role="img"
          aria-label={`${title} (ชิ้น): ${rows.map((r) => `${r.month} ${outLabel} ${r.out} ${backLabel} ${r.back} ${gapLabel} ${r.outstanding}`).join(", ")}`}
        >
          <ChartContainer>
            {({ width, height }) => (
              <ComposedChart data={rows} width={width} height={height} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="flowOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={outColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={outColor} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="flowBack" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={backColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={backColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border)" }} />
                <Area type="monotone" dataKey="out" name={outLabel} stroke={outColor} strokeWidth={2} fill="url(#flowOut)" isAnimationActive={false} />
                <Area type="monotone" dataKey="back" name={backLabel} stroke={backColor} strokeWidth={2} fill="url(#flowBack)" isAnimationActive={false} />
                <Line type="monotone" dataKey="outstanding" name={gapLabel} stroke={gapColor} strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              </ComposedChart>
            )}
          </ChartContainer>
        </div>
      </WidgetState>
    </Panel>
  );
}
