"use client";

import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChartContainer } from "./chart-container";
import { getDashboardAssetStatus } from "@/lib/api";
import { useAsync, useDashboardRefreshNonce } from "@/hooks/use-async";

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
  const { data: rows = [], isLoading, error, refetch } = useAsync(
    async () => (await getDashboardAssetStatus()) as Row[],
    [nonce],
  );

  const total = rows.reduce((s, r) => s + r.count, 0);
  const pie = rows.filter((r) => r.count > 0);
  const okCount = rows.find((r) => r.status === "AVAILABLE")?.count ?? 0;
  const okPct = total > 0 ? Math.round((okCount / total) * 100) : 0;

  return (
    <Card className="h-full w-full">
      <CardHeader className="border-b py-3">
        <CardTitle className="text-base font-semibold text-foreground">สถานะครุภัณฑ์ &amp; ของคงทน</CardTitle>
        <p className="text-xs text-muted-foreground">
          สัดส่วนสถานะรายชิ้น {total > 0 ? `จากทั้งหมด ${total.toLocaleString("th-TH")} ชิ้น` : ""}
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
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
            <Button variant="outline" size="sm" onClick={() => refetch()}>โหลดใหม่</Button>
          </div>
        ) : total === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">ยังไม่มีครุภัณฑ์แบบติดตามรายชิ้น</p>
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="relative h-44 w-44 shrink-0">
              <ChartContainer height={176}>
                {({ width, height }) => (
                  <PieChart width={width} height={height}>
                    <Pie
                      data={pie}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={54}
                      outerRadius={78}
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
                  <p className="text-xl font-semibold tabular-nums text-success">{okPct}%</p>
                  <p className="text-[11px] text-muted-foreground">พร้อมใช้งาน</p>
                </div>
              </div>
            </div>
            <ul className="w-full space-y-1.5">
              {rows.map((r) => (
                <li key={r.status} className="flex items-center gap-2.5">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{r.label}</span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">{r.count.toLocaleString("th-TH")}</span>
                  <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                    {total > 0 ? Math.round((r.count / total) * 100) : 0}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
