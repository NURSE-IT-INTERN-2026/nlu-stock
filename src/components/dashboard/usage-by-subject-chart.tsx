"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { PieChart } from "lucide-react";
import { useThemeColor } from "@/lib/resolve-color";
import type { UsageByTypeData } from "@/lib/dashboard-types";

interface UsageBySubjectChartProps {
  data: UsageByTypeData[];
}

function UsageByTypeEmpty() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center border-t border-dashed border-muted-foreground/20 bg-muted/30">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-secondary">
        <PieChart className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="text-center mt-3">
        <p className="text-[13px] font-medium text-foreground">
          ยังไม่มีข้อมูลการใช้งาน
        </p>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          กราฟจะแสดงสัดส่วนเมื่อมีการเบิก
        </p>
      </div>
    </div>
  );
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: { name: string } }>;
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{d.payload.name}</p>
      <p className="text-muted-foreground">
        จำนวน: <span className="font-semibold text-foreground">{d.value.toLocaleString("th-TH")}</span> ชิ้น
      </p>
    </div>
  );
}

export function UsageBySubjectChart({ data }: UsageBySubjectChartProps) {
  const fillColor = useThemeColor("--chart-2");

  const chartData = data.map((d) => ({
    name: d.label,
    totalQuantity: d.totalQuantity,
  }));

  return (
    <Card className="flex flex-col h-full overflow-hidden pb-0 pt-0 gap-0">
      <CardHeader className="py-3 shrink-0">
        <CardTitle className="text-xs font-semibold text-foreground whitespace-nowrap font-sans">
          สัดส่วนการใช้งานเดือนนี้
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col !p-0 min-h-0 [&>div]:flex-1">
        {chartData.length === 0 ? (
          <UsageByTypeEmpty />
        ) : (
          <div className="flex-1 min-h-0" role="img" aria-label={`สัดส่วนการใช้งาน: ${chartData.map((d) => `${d.name} (${d.totalQuantity})`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 24, bottom: 5, left: 16 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="totalQuantity" fill={fillColor} radius={[4, 4, 0, 0]} animationDuration={400} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
