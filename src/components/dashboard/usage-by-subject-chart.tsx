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
  const fillColor = useMemo(() => resolveToHex("--chart-2"), []);

  const chartData = data.map((d) => ({
    name: d.label,
    totalQuantity: d.totalQuantity,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-foreground">
          Usage by Type This Month
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No data this month</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ bottom: 5 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="totalQuantity" fill={fillColor} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
