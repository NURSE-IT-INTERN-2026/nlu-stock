"use client";

import { BarChart3 } from "lucide-react";
import type { TopDispenseData } from "@/lib/dashboard-types";
import { Panel } from "./primitives";

// ponytail: a ranked list, not a recharts BarChart. A horizontal bar chart spent 140px of
// YAxis on Thai names it still had to truncate at 18 chars, and needed ChartContainer +
// a custom tick renderer to do it. The same ranking in plain divs truncates at the real
// column width, keeps the full name in the title attribute, and drops the chart entirely.
export function TopDispenseChart({ data }: { data: TopDispenseData[] }) {
  const max = Math.max(...data.map((d) => d.totalQuantity), 1);

  return (
    <Panel title="รายการเบิกมากที่สุดเดือนนี้" hint="เรียงตามจำนวนชิ้นที่ถูกเบิก">
      {data.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10">
          <span className="grid size-12 place-items-center rounded-full bg-secondary">
            <BarChart3 className="size-5 text-muted-foreground" />
          </span>
          <div className="text-center">
            <p className="text-[13px] font-medium text-foreground">ยังไม่มีการเบิกเดือนนี้</p>
            <p className="mt-0.5 text-xs text-muted-foreground">ข้อมูลจะแสดงเมื่อมีการเบิกครั้งแรก</p>
          </div>
        </div>
      ) : (
        // justify-start, not justify-between: the panel stretches to its taller neighbour, and
        // spreading a short list (this warehouse has months with one entry) across that height
        // leaves a single bar floating mid-card.
        <ol className="flex flex-1 flex-col gap-3.5">
          {data.map((d, i) => (
            <li key={d.id}>
              <div className="mb-1.5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                <span className="grid size-5 shrink-0 place-items-center rounded bg-secondary text-[10px] font-bold tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <span className="truncate text-sm" title={`${d.code} ${d.name}`}>
                  {d.name}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums">
                  {d.totalQuantity.toLocaleString("th-TH")}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="bar-grow h-full rounded-full bg-danger-500"
                  style={{ width: `${(d.totalQuantity / max) * 100}%`, animationDelay: `${i * 80}ms` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
