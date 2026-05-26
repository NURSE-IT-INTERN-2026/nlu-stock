"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useMemo } from "react";

function resolveToHex(cssVar: string): string {
  if (typeof window === "undefined") return "#888";
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  if (!raw) return "#888";
  if (raw.startsWith("#")) return raw;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return "#888";
  ctx.fillStyle = raw;
  return ctx.fillStyle;
}

interface AnnualCostData {
  categoryName: string;
  totalPurchase: number;
  totalRepair: number;
}

interface AnnualCostChartProps {
  data: AnnualCostData[];
}

export function AnnualCostChart({ data }: AnnualCostChartProps) {
  const colors = useMemo(
    () => [resolveToHex("--chart-1"), resolveToHex("--chart-2"), resolveToHex("--chart-3"), resolveToHex("--chart-4")],
    [],
  );

  const totalPurchase = data.reduce((s, d) => s + d.totalPurchase, 0);
  const totalRepair = data.reduce((s, d) => s + d.totalRepair, 0);

  const pieData = [
    { name: "Purchase", value: totalPurchase },
    { name: "Repair", value: totalRepair },
  ].filter((d) => d.value > 0);

  if (pieData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Cost Breakdown</CardTitle>
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
        <CardTitle className="text-base font-semibold">Cost Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={pieData}
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
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
