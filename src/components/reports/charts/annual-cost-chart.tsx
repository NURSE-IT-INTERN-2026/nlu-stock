"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart, Pie, Cell, Tooltip, Legend,
} from "recharts";
import { ChartContainer } from "@/components/dashboard/chart-container";
import { useThemeColor } from "@/lib/resolve-color";

interface AnnualCostData {
  categoryName: string;
  totalPurchase: number;
  totalRepair: number;
}

interface AnnualCostChartProps {
  data: AnnualCostData[];
}

export function AnnualCostChart({ data }: AnnualCostChartProps) {
  // useThemeColor re-resolves when the theme flips; the local copy this replaced memoized on
  // [] and left the slices in their light-mode colours after a switch to dark.
  const colors = [
    useThemeColor("--chart-1"), useThemeColor("--chart-2"),
    useThemeColor("--chart-3"), useThemeColor("--chart-4"),
  ];

  const totalPurchase = data.reduce((s, d) => s + d.totalPurchase, 0);
  const totalRepair = data.reduce((s, d) => s + d.totalRepair, 0);

  const pieData = [
    { name: "ค่าจัดซื้อ", value: totalPurchase },
    { name: "ค่าซ่อมบำรุง", value: totalRepair },
  ].filter((d) => d.value > 0);

  if (pieData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">สัดส่วนค่าใช้จ่าย</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">No cost data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">สัดส่วนค่าใช้จ่าย</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer height={260}>
          {({ width, height }) => (
            <PieChart width={width} height={height}>
              <Pie
                data={pieData}
                isAnimationActive={false}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey="value"
                label={({ name, value }) => `${name}: ฿${value.toLocaleString()}`}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={colors[i % colors.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => `฿${Number(v).toLocaleString()}`} />
              <Legend />
            </PieChart>
          )}
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
