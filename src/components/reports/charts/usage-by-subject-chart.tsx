"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { PieChart } from "lucide-react";
import { useThemeColor } from "@/lib/resolve-color";
import { ChartContainer } from "@/components/dashboard/chart-container";
import { Panel } from "@/components/dashboard/primitives";

interface UsageByTypeData {
  usageType: string | null;
  label: string;
  totalQuantity: number;
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

// Reports-only since the dashboard moved to รายวิชา (top-courses-chart). title/hint come from
// the caller because /reports draws this over whatever range the filter bar is set to.
// It sits in a plain stack there, where ChartContainer's height:100% of an only-min-height
// parent computes to 0 and the chart renders blank — `height` gives it a definite box.
export function UsageBySubjectChart({
  data,
  title,
  hint,
  height,
}: {
  data: UsageByTypeData[];
  title: string;
  hint: string;
  height: number;
}) {
  // ponytail: one fill, not a colour per bar. The categories are already named on the axis,
  // so a second encoding would carry no information.
  const fillColor = useThemeColor("--chart-2");
  const chartData = data.map((d) => ({ name: d.label, totalQuantity: d.totalQuantity }));

  return (
    <Panel title={title} hint={hint}>
      {chartData.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10">
          <span className="grid size-12 place-items-center rounded-full bg-secondary">
            <PieChart className="size-5 text-muted-foreground" />
          </span>
          <div className="text-center">
            <p className="text-[13px] font-medium text-foreground">ยังไม่มีข้อมูลการใช้งาน</p>
            <p className="mt-0.5 text-xs text-muted-foreground">กราฟจะแสดงสัดส่วนเมื่อมีการเบิก</p>
          </div>
        </div>
      ) : (
        <div
          style={{ height }}
          role="img"
          aria-label={`สัดส่วนการใช้งาน: ${chartData.map((d) => `${d.name} (${d.totalQuantity})`).join(", ")}`}
        >
          <ChartContainer>
            {({ width, height }) => (
              <BarChart data={chartData} width={width} height={height} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--secondary)" }} />
                <Bar dataKey="totalQuantity" fill={fillColor} radius={[6, 6, 0, 0]} isAnimationActive={false} />
              </BarChart>
            )}
          </ChartContainer>
        </div>
      )}
    </Panel>
  );
}
