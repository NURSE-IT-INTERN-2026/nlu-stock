"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
} from "recharts";
import { useThemeColor } from "@/lib/resolve-color";
import type { MonthlyDispenseData } from "@/lib/dashboard-types";
import { ChartContainer } from "./chart-container";

interface MonthlyDispenseChartProps {
  data: MonthlyDispenseData[];
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-muted-foreground">
        จำนวน: <span className="font-semibold text-foreground">{payload[0].value.toLocaleString("th-TH")}</span> ชิ้น
      </p>
    </div>
  );
}

export function MonthlyDispenseChart({ data }: MonthlyDispenseChartProps) {
  const fillColor = useThemeColor("--chart-1");

  return (
    <div className="h-full min-h-[260px] w-full" role="img" aria-label={`ภาพรวมการใช้งานวัสดุสิ้นเปลือง ย้อนหลัง 1 ปี: ${data.map((d) => `${d.month} (${d.total})`).join(", ")}`}>
      <ChartContainer>
        {({ width, height }) => (
          <BarChart data={data} width={width} height={height} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
            <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} />
            <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} width={40} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} />
            <Bar dataKey="total" fill={fillColor} radius={[4, 4, 0, 0]} animationDuration={400} animationEasing="ease-out" />
          </BarChart>
        )}
      </ChartContainer>
    </div>
  );
}
