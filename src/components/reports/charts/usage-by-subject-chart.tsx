"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
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

interface UsageByTypeData {
  usageType: string | null;
  label: string;
  totalQuantity: number;
}

interface UsageBySubjectChartProps {
  data: UsageByTypeData[];
}

export function UsageBySubjectChart({ data }: UsageBySubjectChartProps) {
  const fillColor = useMemo(() => resolveToHex("--chart-1"), []);

  const chartData = data.map((d) => ({
    name: d.label,
    totalQuantity: d.totalQuantity,
  }));

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Usage by Type</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">No data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Usage by Type</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
            <XAxis type="number" />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="totalQuantity" fill={fillColor} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
