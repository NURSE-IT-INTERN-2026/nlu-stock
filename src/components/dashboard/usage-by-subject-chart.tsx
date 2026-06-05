"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { PieChart } from "lucide-react";
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

export function UsageBySubjectChart({ data }: UsageBySubjectChartProps) {
  const fillColor = useMemo(() => resolveToHex("--chart-2"), []);

  const chartData = data.map((d) => ({
    name: d.label,
    totalQuantity: d.totalQuantity,
  }));

  return (
    <Card className="flex flex-col h-full overflow-hidden pb-0 pt-0 gap-0">
      <CardHeader className="py-3 shrink-0">
        <CardTitle className="text-xs font-semibold text-foreground whitespace-nowrap font-sans">
          Usage by Type This Month
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col !p-0 min-h-[240px] [&>div]:h-full">
        {chartData.length === 0 ? (
          <UsageByTypeEmpty />
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
