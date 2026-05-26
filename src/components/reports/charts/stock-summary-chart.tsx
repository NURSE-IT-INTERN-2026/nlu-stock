"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
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

interface StockSummaryData {
  categoryName: string;
  totalItems: number;
  totalQty: number;
  availableQty: number;
}

interface StockSummaryChartProps {
  data: StockSummaryData[];
}

export function StockSummaryChart({ data }: StockSummaryChartProps) {
  const color1 = useMemo(() => resolveToHex("--chart-1"), []);
  const color2 = useMemo(() => resolveToHex("--chart-2"), []);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Stock by Category</CardTitle>
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
        <CardTitle className="text-base font-semibold">Stock by Category</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <XAxis dataKey="categoryName" tick={{ fontSize: 12 }} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="totalQty" name="Total" fill={color1} radius={[4, 4, 0, 0]} />
            <Bar dataKey="availableQty" name="Available" fill={color2} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
