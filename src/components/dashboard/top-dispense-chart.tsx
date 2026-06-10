"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { useThemeColor } from "@/lib/resolve-color";
import type { TopDispenseData } from "@/lib/dashboard-types";

interface TopDispenseChartProps {
  data: TopDispenseData[];
}

function TopDispenseEmpty() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center border-t border-dashed border-muted-foreground/20 bg-muted/30">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-secondary">
        <BarChart3 className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="text-center mt-3">
        <p className="text-[13px] font-medium text-foreground">
          ยังไม่มีการเบิกเดือนนี้
        </p>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          ข้อมูลจะแสดงเมื่อมีการเบิกครั้งแรก
        </p>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ThaiTick(props: any) {
  const { x, y, payload } = props;
  const maxLen = 18;
  const label = payload.value.length > maxLen
    ? payload.value.slice(0, maxLen - 1) + "…"
    : payload.value;
  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="end"
      fill="var(--color-muted-foreground)"
      fontSize={12}
    >
      {label}
    </text>
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

export function TopDispenseChart({ data }: TopDispenseChartProps) {
  const fillColor = useThemeColor("--chart-1");

  const chartData = data.map((d) => ({
    name: d.name,
    totalQuantity: d.totalQuantity,
  }));

  return (
    <Card className="flex flex-col h-full overflow-hidden pb-0 pt-0 gap-0">
      <CardHeader className="py-3 shrink-0">
        <CardTitle className="text-xs font-semibold text-foreground whitespace-nowrap font-sans">
          รายการเบิกมากที่สุดเดือนนี้
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col !p-0 min-h-0 [&>div]:flex-1">
        {chartData.length === 0 ? (
          <TopDispenseEmpty />
        ) : (
          <div className="flex-1 min-h-0" role="img" aria-label={`รายการเบิกมากที่สุด: ${chartData.map((d) => `${d.name} (${d.totalQuantity})`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 24, bottom: 5, left: 4 }}>
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={140} tick={<ThaiTick />} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="totalQuantity" fill={fillColor} radius={[0, 4, 4, 0]} animationDuration={400} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
