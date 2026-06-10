"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import { useThemeColors } from "@/lib/resolve-color";
import type { StatusData } from "@/lib/dashboard-types";

const STATUS_VAR_MAP: Record<string, string> = {
  AVAILABLE: "--chart-2",
  CHECKED_OUT: "--chart-1",
  DAMAGED: "--chart-4",
  UNDER_REPAIR: "--chart-3",
  LOST: "--chart-5",
  PENDING_MAINTENANCE: "--chart-5",
  DISPOSED: "--muted",
};

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Available",
  CHECKED_OUT: "Checked Out",
  DAMAGED: "Damaged",
  UNDER_REPAIR: "Under Repair",
  LOST: "Lost",
  PENDING_MAINTENANCE: "Pending Maint.",
  DISPOSED: "Disposed",
};

interface StatusTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: { name: string } }>;
}

function StatusTooltip({ active, payload }: StatusTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{d.payload.name}</p>
      <p className="text-muted-foreground">
        จำนวน: <span className="font-semibold text-foreground">{d.value.toLocaleString("th-TH")}</span> รายการ
      </p>
    </div>
  );
}

interface StatusOverviewChartProps {
  data: StatusData[];
}

export function StatusOverviewChart({ data }: StatusOverviewChartProps) {
  const colorMap = useThemeColors(Object.values(STATUS_VAR_MAP));

  const resolvedColorMap: Record<string, string> = {};
  for (const [status, cssVar] of Object.entries(STATUS_VAR_MAP)) {
    resolvedColorMap[status] = colorMap[cssVar] ?? "oklch(50% 0 0)";
  }

  const chartData = data.map((d) => ({
    name: STATUS_LABELS[d.status] || d.status,
    value: d.count,
    status: d.status,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-foreground">
          สถานะภาพรวม
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">ไม่มีข้อมูล</p>
        ) : (
          <div className="flex flex-col items-center gap-3" role="img" aria-label={`Item status breakdown: ${chartData.map((e) => `${e.name}: ${e.value}`).join(", ")}`}>
            <div className="w-full" style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={38}
                  outerRadius={65}
                  dataKey="value"
                  animationDuration={400}
                  animationEasing="ease-out"
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={resolvedColorMap[entry.status] || resolvedColorMap["DISPOSED"]} />
                  ))}
                </Pie>
                <Tooltip content={<StatusTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            </div>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 w-full px-2">
              {chartData.map((entry) => (
                <li
                  key={entry.status}
                  className="flex items-center gap-1.5 text-xs rounded px-1.5 py-1 transition-colors hover:bg-muted/50"
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: resolvedColorMap[entry.status] || resolvedColorMap["DISPOSED"] }}
                  />
                  <span className="truncate text-foreground/80">{entry.name}</span>
                  <span className="text-foreground font-semibold ml-auto">{entry.value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
