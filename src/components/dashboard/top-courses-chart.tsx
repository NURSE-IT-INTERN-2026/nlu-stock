"use client";

import { BookOpen } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Panel } from "./primitives";
import { useTopCourses } from "@/hooks/use-dashboard-queries";

// ponytail: plain divs, not a recharts BarChart — same call as top-dispense-chart. A recharts
// YAxis spends ~140px on labels it still truncates, and "261101 — ชีววิทยาทั่วไป" is longer
// than any item name. Here the bar truncates at the real column width and keeps the full
// label in `title`.
/**
 * `verb` for the same reason top-dispense-chart takes one: the route is scoped to the tab, so
 * on ยืม these bars count loans — and a "รายวิชาที่เบิกมากที่สุด" heading over rows literally
 * named "ยืมรอบสอง" names an action the tab does not count. One verb drives the heading, the
 * hint and both empty-state lines together.
 */
export function TopCoursesChart({ verb = "เบิก" }: { verb?: string }) {
  const { data, isLoading, error, refetch } = useTopCourses();
  const rows = data?.rows ?? [];
  const excluded = data?.excluded ?? 0;
  const max = Math.max(...rows.map((r) => r.records), 1);

  return (
    <Panel title={`รายวิชาที่${verb}มากที่สุด`} hint={`เรียงตามจำนวนครั้งที่${verb} ย้อนหลัง 1 ปี`}>
      {isLoading ? (
        <Skeleton className="h-[240px] w-full rounded-xl" />
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-10">
          <p className="text-sm text-destructive">{error.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            โหลดใหม่
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10">
          <span className="grid size-12 place-items-center rounded-full bg-secondary">
            <BookOpen className="size-5 text-muted-foreground" />
          </span>
          <div className="text-center">
            <p className="text-[13px] font-medium text-foreground">ยังไม่มีการ{verb}เพื่อรายวิชา</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {excluded > 0
                ? `มีการ${verb} ${excluded.toLocaleString("th-TH")} ครั้ง แต่ยังไม่มีครั้งไหนระบุรายวิชา`
                : `ข้อมูลจะแสดงเมื่อมีการ${verb}ที่เลือก “รายวิชา”`}
            </p>
          </div>
        </div>
      ) : (
        <ol className="flex flex-1 flex-col gap-3.5">
            {rows.map((r, i) => (
              <li key={r.courseCode}>
                <div className="mb-1.5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                  <span className="grid size-5 shrink-0 place-items-center rounded bg-secondary text-[10px] font-bold tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="truncate text-sm" title={`${r.label} · ${r.units.toLocaleString("th-TH")} ชิ้น`}>
                    {r.label}
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {r.records.toLocaleString("th-TH")}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="bar-grow h-full rounded-full bg-chart-1"
                    style={{ width: `${(r.records / max) * 100}%`, animationDelay: `${i * 80}ms` }}
                  />
                </div>
              </li>
            ))}
        </ol>
      )}
    </Panel>
  );
}
