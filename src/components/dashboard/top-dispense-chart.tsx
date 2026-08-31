"use client";

import { BarChart3 } from "lucide-react";
import type { TopDispenseData } from "@/lib/dashboard-types";
import { Panel } from "./primitives";

// ponytail: a ranked list, not a recharts BarChart. A horizontal bar chart spent 140px of
// YAxis on Thai names it still had to truncate at 18 chars, and needed ChartContainer +
// a custom tick renderer to do it. The same ranking in plain divs truncates at the real
// column width, keeps the full name in the title attribute, and drops the chart entirely.
/**
 * Every tab ranks its own kind of event with this list, so the wording comes from the caller:
 * a "รายการที่เบิกบ่อยที่สุด" heading over the ยืม tab names an action that tab does not count.
 * One verb drives the heading, the hint and the empty state together — they are the same
 * sentence three times and drifted apart when they were three props.
 */
export function TopDispenseChart({ data, verb }: { data: TopDispenseData[]; verb: string }) {
  const max = Math.max(...data.map((d) => d.records), 1);

  return (
    <Panel title={`รายการที่ถูก${verb}บ่อยที่สุด`} hint={`เรียงตามจำนวนครั้งที่ถูก${verb} ย้อนหลัง 1 ปี`}>
      {data.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10">
          <span className="grid size-12 place-items-center rounded-full bg-secondary">
            <BarChart3 className="size-5 text-muted-foreground" />
          </span>
          <div className="text-center">
            <p className="text-[13px] font-medium text-foreground">ยังไม่มีการ{verb}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">ข้อมูลจะแสดงเมื่อมีการ{verb}ครั้งแรก</p>
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
                {/* หน่วย hides in the title: ranking on it put whatever ships in hundreds at
                    the top forever, but it is still what explains a short bar that emptied a
                    shelf. */}
                <span className="truncate text-sm" title={`${d.code} ${d.name} · ${d.totalQuantity.toLocaleString("th-TH")} ชิ้น`}>
                  {d.name}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums">
                  {d.records.toLocaleString("th-TH")}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                {/* chart-4, not danger-500: the two are the same red in light mode, but only
                    chart-4 has a dark-mode step — danger-500 is defined once and stayed at
                    55% lightness on a dark card, so this bar and the identical one in
                    ตอนนี้ของอยู่ที่ไหน drifted apart in dark. danger-500 is also the alarm
                    token (dashboard-alert-bar, "หมด"), and a ranking is not an alarm. */}
                <div
                  className="bar-grow h-full rounded-full bg-chart-4"
                  style={{ width: `${(d.records / max) * 100}%`, animationDelay: `${i * 80}ms` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
