"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useThemeColor } from "@/lib/resolve-color";
import { ChartContainer } from "./chart-container";
import { Dot, Panel } from "./primitives";
import { getDashboardMovementMonthly } from "@/lib/api";
import { useAsync, useDashboardRefreshNonce } from "@/hooks/use-async";
import { useDashboardScope, scopeKey } from "@/hooks/use-dashboard-scope";

interface Row {
  month: string;
  in: number;
  out: number;
}

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
          {p.name}: <span className="font-semibold text-foreground">{p.value.toLocaleString("th-TH")}</span>
        </p>
      ))}
    </div>
  );
}

// A year of all-zero buckets still draws two flat lines along the x-axis, which reads as
// "movement collapsed to nothing" rather than "nothing has been recorded yet". Until the
// first รับเข้า/เบิกออก lands — master data imports carry no movement history — say so.
function MovementEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <span className="grid size-12 place-items-center rounded-full bg-secondary">
        <Activity className="size-5 text-muted-foreground" />
      </span>
      <div className="text-center">
        <p className="text-[13px] font-medium text-foreground">ยังไม่มีการเคลื่อนไหว</p>
        <p className="mt-0.5 text-xs text-muted-foreground">กราฟจะแสดงเมื่อมีการรับเข้าหรือเบิกออกครั้งแรก</p>
      </div>
    </div>
  );
}

export function MovementChart() {
  const nonce = useDashboardRefreshNonce();
  const scope = useDashboardScope();
  const { data: rows = [], isLoading, error, refetch } = useAsync(
    async () => (await getDashboardMovementMonthly(scope)) as Row[],
    [nonce, scopeKey(scope)],
  );
  const inColor = useThemeColor("--chart-2");
  const outColor = useThemeColor("--chart-1");
  // The route always returns 12 buckets, so an empty array never happens — "no data" is
  // every bucket sitting at zero.
  const noMovement = rows.every((r) => r.in === 0 && r.out === 0);

  return (
    <Panel
      title="แนวโน้มรับเข้า vs เบิกออก"
      hint="เปรียบเทียบการเคลื่อนไหวของพัสดุ ย้อนหลัง 1 ปี (หน่วย: ชิ้น)"
      action={
        !isLoading && !error && !noMovement ? (
          <div className="flex shrink-0 gap-3 text-[11px] font-medium">
            <span className="inline-flex items-center gap-1.5">
              <Dot style={{ background: inColor }} /> รับเข้า
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Dot style={{ background: outColor }} /> เบิกออก
            </span>
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
      ) : noMovement ? (
        <MovementEmpty />
      ) : (
        <div
          className="h-[280px] w-full"
          role="img"
          aria-label={`แนวโน้มรับเข้า vs เบิกออก: ${rows.map((d) => `${d.month} รับ ${d.in} เบิก ${d.out}`).join(", ")}`}
        >
          <ChartContainer>
            {({ width, height }) => (
              <AreaChart data={rows} width={width} height={height} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="movIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={inColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={inColor} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="movOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={outColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={outColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border)" }} />
                <Area type="monotone" dataKey="in" name="รับเข้า" stroke={inColor} strokeWidth={2} fill="url(#movIn)" animationDuration={400} animationEasing="ease-out" />
                <Area type="monotone" dataKey="out" name="เบิกออก" stroke={outColor} strokeWidth={2} fill="url(#movOut)" animationDuration={400} animationEasing="ease-out" />
              </AreaChart>
            )}
          </ChartContainer>
        </div>
      )}
    </Panel>
  );
}
