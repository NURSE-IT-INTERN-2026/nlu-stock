"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { BarChart3 } from "lucide-react";
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

interface TopDispenseData {
  code: string;
  name: string;
  totalQuantity: number;
}

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

export function TopDispenseChart({ data }: TopDispenseChartProps) {
  const fillColor = useMemo(() => resolveToHex("--chart-1"), []);

  const chartData = data.map((d) => ({
    name: d.name.length > 20 ? d.name.slice(0, 18) + "…" : d.name,
    totalQuantity: d.totalQuantity,
  }));

  return (
    <Card className="flex flex-col h-full overflow-hidden pb-0 pt-0 gap-0">
      <CardHeader className="py-3 shrink-0">
        <CardTitle className="text-xs font-semibold text-foreground whitespace-nowrap font-sans">
          Top Dispensed This Month
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col !p-0 min-h-[240px] [&>div]:h-full">
        {chartData.length === 0 ? (
          <TopDispenseEmpty />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 24, bottom: 5, left: 16 }}>
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="totalQuantity" fill={fillColor} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
