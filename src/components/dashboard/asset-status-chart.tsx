"use client";

import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChartContainer } from "./chart-container";
import { CountUp, Panel } from "./primitives";
import { getDashboardAssetStatus } from "@/lib/api";
import { useAsync, useDashboardRefreshNonce } from "@/hooks/use-async";
import { useDashboardScope, scopeKey } from "@/hooks/use-dashboard-scope";

interface Row {
  status: string;
  label: string;
  color: string;
  count: number;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Row }> }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{r.label}</p>
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground">{r.count.toLocaleString("th-TH")}</span> ชิ้น
      </p>
    </div>
  );
}

export function AssetStatusChart() {
  const nonce = useDashboardRefreshNonce();
  const scope = useDashboardScope();
  const { data: rows = [], isLoading, error, refetch } = useAsync(
    async () => (await getDashboardAssetStatus(scope)) as Row[],
    [nonce, scopeKey(scope)],
  );

  const total = rows.reduce((s, r) => s + r.count, 0);
  const pie = rows.filter((r) => r.count > 0);
  const okCount = rows.find((r) => r.status === "AVAILABLE")?.count ?? 0;
  const okPct = total > 0 ? Math.round((okCount / total) * 100) : 0;

  return (
    <Panel
      title="สถานะครุภัณฑ์ & ของคงทน"
      hint={total > 0 ? `สัดส่วนสถานะรายชิ้น จากทั้งหมด ${total.toLocaleString("th-TH")} ชิ้น` : "สัดส่วนสถานะรายชิ้น"}
    >
      {isLoading ? (
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <Skeleton className="size-44 shrink-0 rounded-full" />
          <div className="w-full space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-10">
          <p className="text-sm text-destructive">{error.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            โหลดใหม่
          </Button>
        </div>
      ) : total === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">ยังไม่มีครุภัณฑ์แบบติดตามรายชิ้น</p>
      ) : (
        <div className="grid flex-1 gap-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
          <div className="relative mx-auto w-[180px]">
            <ChartContainer height={180}>
              {({ width, height }) => (
                <PieChart width={width} height={height}>
                  <Pie
                    data={pie}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={82}
                    paddingAngle={2}
                    stroke="none"
                    animationDuration={400}
                    animationEasing="ease-out"
                  >
                    {pie.map((r) => (
                      <Cell key={r.status} fill={r.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              )}
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="text-2xl font-bold text-success">
                  <CountUp value={okPct} />%
                </p>
                <p className="text-[10px] text-muted-foreground">พร้อมใช้งาน</p>
              </div>
            </div>
          </div>

          <ul className="flex flex-col justify-between gap-1.5">
            {rows.map((r) => (
              <li
                key={r.status}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg px-2 py-1 text-sm transition-colors hover:bg-secondary/50"
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <i className="size-2 shrink-0 rounded-full" style={{ background: r.color }} />
                  <span className="truncate">{r.label}</span>
                </span>
                <span className="font-semibold tabular-nums">{r.count.toLocaleString("th-TH")}</span>
                <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                  {Math.round((r.count / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
