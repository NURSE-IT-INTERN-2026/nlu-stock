"use client";

import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip } from "recharts";
import { Clock } from "lucide-react";
import { useThemeColor } from "@/lib/resolve-color";
import { ChartContainer } from "./chart-container";
import { Panel, WidgetState } from "./primitives";
import { LOAN_BUCKETS, LOAN_BUCKET_LABELS } from "@/lib/dashboard-usage";
import { useLoanDuration } from "@/hooks/use-dashboard-queries";

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: { name: string } }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{payload[0].payload.name}</p>
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground">{payload[0].value.toLocaleString("th-TH")}</span> ครั้ง
      </p>
    </div>
  );
}

/**
 * How long loans that came back were out.
 *
 * Only closed loans are on the chart — an open one climbs a bucket every night with nothing
 * having happened, which would make the last bar grow on its own and read as behaviour
 * changing. The open ones get their own line under the chart instead of being hidden.
 */
export function LoanDurationChart() {
  const { data, isLoading, error, refetch } = useLoanDuration();
  const good = useThemeColor("--chart-2");
  const warn = useThemeColor("--chart-3");
  const late = useThemeColor("--chart-4");
  // The ramp is the message: returned-same-day and returned-after-a-week are not two
  // neighbouring facts, so they do not get two neighbouring colours.
  const colors = [good, good, warn, late];

  const rows = LOAN_BUCKETS.map((b) => ({ name: LOAN_BUCKET_LABELS[b], count: data?.counts[b] ?? 0 }));

  return (
    <Panel title="ระยะเวลาการยืม" hint="กระจายตามจำนวนวันก่อนคืน ย้อนหลัง 1 ปี (ครั้ง)">
      <WidgetState
        isLoading={isLoading}
        error={error}
        onRetry={() => refetch()}
        isEmpty={(data?.closed ?? 0) === 0}
        icon={Clock}
        emptyTitle="ยังไม่มีรายการที่คืนแล้ว"
        emptyHint={
          data && data.stillOut > 0
            ? `มี ${data.stillOut.toLocaleString("th-TH")} ครั้งที่ยังไม่คืน — กราฟจะแสดงเมื่อคืนครั้งแรก`
            : "กราฟจะแสดงเมื่อมีการคืนครั้งแรก"
        }
      >
        <div
          className="h-[240px] w-full"
          role="img"
          aria-label={`ระยะเวลาการยืม: ${rows.map((r) => `${r.name} ${r.count} ครั้ง`).join(", ")}`}
        >
          <ChartContainer>
            {({ width, height }) => (
              <BarChart data={rows} width={width} height={height} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--secondary)" }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                  {rows.map((_, i) => (
                    <Cell key={i} fill={colors[i]} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ChartContainer>
        </div>
        {data && data.stillOut > 0 && (
          <p className="mt-3 border-t pt-2.5 text-xs text-muted-foreground">
            ไม่นับอีก {data.stillOut.toLocaleString("th-TH")} ครั้งที่ยังไม่คืน — ยังไม่มีระยะเวลา
          </p>
        )}
      </WidgetState>
    </Panel>
  );
}
