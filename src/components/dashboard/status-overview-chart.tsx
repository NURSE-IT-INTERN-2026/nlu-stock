"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart, Pie, Cell, Tooltip,
} from "recharts";
import type { StatusData } from "@/lib/dashboard-types";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/constants";

interface StatusTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: { name: string } }>;
}

function StatusTooltip({ active, payload }: StatusTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{d.payload.name}</p>
      <p className="text-muted-foreground">
        จำนวน: <span className="font-semibold text-foreground">{d.value.toLocaleString("th-TH")}</span> รายการ
      </p>
    </div>
  );
}

interface StatusOverviewChartProps {
  data: StatusData[];
}

export function StatusOverviewChart({ data }: StatusOverviewChartProps) {
  const donutRef = useRef<HTMLDivElement>(null);
  const [donutSize, setDonutSize] = useState({ width: 0, height: 160 });
  const rafRef = useRef<number>(0);

  const handleResize = useCallback((entries: ResizeObserverEntry[]) => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const { width, height } = entries[0].contentRect;
      const w = Math.round(width);
      const h = Math.round(height);
      setDonutSize((prev) => {
        if (w === prev.width && h === prev.height) return prev;
        return { width: w, height: h };
      });
    });
  }, []);

  useEffect(() => {
    const el = donutRef.current;
    if (!el) return;
    const observer = new ResizeObserver(handleResize);
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [handleResize]);

  // Radius scales with container — 40% of smaller dimension, inner = 58% of outer
  const minDim = Math.min(donutSize.width, donutSize.height);
  const outerRadius = Math.max(24, minDim * 0.4);
  const innerRadius = Math.max(12, outerRadius * 0.58);

  const chartData = data.map((d) => ({
    name: STATUS_LABELS[d.status] || d.status,
    value: d.count,
    status: d.status,
  }));

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card className="h-full w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-foreground">
          สถานะภาพรวม
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">ไม่มีข้อมูล</p>
        ) : (
          <div className="status-layout">
          <div className="status-layout-inner flex flex-col items-center gap-3" role="img" aria-label={`Item status breakdown: ${chartData.map((e) => `${e.name}: ${e.value}`).join(", ")}`}>
            <div ref={donutRef} className="status-donut w-full shrink-0 relative" style={{ height: 160 }}>
              {donutSize.width > 0 && (
                <PieChart width={donutSize.width} height={donutSize.height}>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={innerRadius}
                    outerRadius={outerRadius}
                    dataKey="value"
                    animationDuration={400}
                    animationEasing="ease-out"
                  >
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.status] ?? STATUS_COLORS.DISPOSED} />
                    ))}
                  </Pie>
                  <Tooltip content={<StatusTooltip />} />
                </PieChart>
              )}
              {/* Center label — scales with donut */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="font-bold text-foreground" style={{ fontSize: Math.max(12, innerRadius * 0.55) }}>
                  {total.toLocaleString("th-TH")}
                </span>
                <span className="text-muted-foreground" style={{ fontSize: Math.max(8, innerRadius * 0.25) }}>
                  รายการ
                </span>
              </div>
            </div>
            <ul className="status-legend flex flex-col gap-0.5 w-full px-2">
              {chartData.map((entry) => (
                <li
                  key={entry.status}
                  className="flex items-center gap-1.5 text-xs rounded px-1.5 py-1 transition-colors hover:bg-muted/50"
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[entry.status] ?? STATUS_COLORS.DISPOSED }}
                  />
                  <span className="text-foreground/80">{entry.name}</span>
                  <span className="text-foreground font-semibold ml-auto">
                    {entry.value}
                    {donutSize.width > 200 && (
                      <span className="text-muted-foreground font-normal ml-0.5">
                        ({total > 0 ? Math.round((entry.value / total) * 100) : 0}%)
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
