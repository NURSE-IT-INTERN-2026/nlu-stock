"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useThemeColor } from "@/lib/resolve-color";
import { ChartContainer } from "./chart-container";
import { getDashboardMovementMonthly } from "@/lib/api";
import { useAsync, useDashboardRefreshNonce } from "@/hooks/use-async";

interface Row {
  month: string;
  in: number;
  out: number;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
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

export function MovementChart() {
  const nonce = useDashboardRefreshNonce();
  const { data: rows = [], isLoading, error, refetch } = useAsync(
    async () => (await getDashboardMovementMonthly()) as Row[],
    [nonce],
  );
  const inColor = useThemeColor("--chart-2");
  const outColor = useThemeColor("--chart-1");

  return (
    <Card className="w-full">
      <CardHeader className="border-b py-3">
        <CardTitle className="text-base font-semibold text-foreground">แนวโน้มรับเข้า vs เบิกออก</CardTitle>
        <p className="text-xs text-muted-foreground">เปรียบเทียบการเคลื่อนไหวของพัสดุ ย้อนหลัง 1 ปี (หน่วย: ชิ้น)</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <p className="text-sm text-destructive">{error.message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>โหลดใหม่</Button>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: inColor }} /> รับเข้า
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: outColor }} /> เบิกออก
              </span>
            </div>
            <div className="h-[300px] w-full" role="img" aria-label={`แนวโน้มรับเข้า vs เบิกออก: ${rows.map((d) => `${d.month} รับ ${d.in} เบิก ${d.out}`).join(", ")}`}>
              <ChartContainer>
                {({ width, height }) => (
                  <AreaChart data={rows} width={width} height={height} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
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
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} />
                    <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} width={44} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="in" name="รับเข้า" stroke={inColor} strokeWidth={2} fill="url(#movIn)" animationDuration={400} animationEasing="ease-out" />
                    <Area type="monotone" dataKey="out" name="เบิกออก" stroke={outColor} strokeWidth={2} fill="url(#movOut)" animationDuration={400} animationEasing="ease-out" />
                  </AreaChart>
                )}
              </ChartContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
