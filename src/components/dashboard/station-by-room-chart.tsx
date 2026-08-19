"use client";

import { MapPin } from "lucide-react";
import { Panel, WidgetState } from "./primitives";
import { useStationByRoom } from "@/hooks/use-dashboard-queries";

// The half of "อยู่ไหน ทำอะไรอยู่" that the status donut cannot answer: the room lives on the
// dispense record, so the status column knows a piece is stationed but not where.
const TAKE = 5;

export function StationByRoomChart() {
  const { data, isLoading, error, refetch } = useStationByRoom();
  const all = data?.rows ?? [];
  const rows = all.slice(0, TAKE);
  const max = Math.max(...rows.map((r) => r.records), 1);
  const records = all.reduce((n, r) => n + r.records, 0);

  return (
    <Panel
      title="ตอนนี้ของอยู่ที่ไหน"
      hint={
        records > 0
          ? `กระจายอยู่ ${records.toLocaleString("th-TH")} ครั้ง ใน ${all.length.toLocaleString("th-TH")} จุด`
          : "ที่ตั้งใช้งานอยู่ตอนนี้"
      }
    >
      <WidgetState
        isLoading={isLoading}
        error={error}
        onRetry={() => refetch()}
        isEmpty={rows.length === 0}
        icon={MapPin}
        emptyTitle="ยังไม่มีของที่ตั้งใช้งาน"
        emptyHint="ข้อมูลจะแสดงเมื่อมีการนำพัสดุไปใช้งานในห้อง"
      >
        <ol className="flex flex-1 flex-col gap-3.5">
          {rows.map((r, i) => (
            <li key={r.locationId ?? "unlocated"}>
              <div className="mb-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <span
                  className={`truncate text-sm ${r.locationId ? "" : "italic text-muted-foreground"}`}
                  title={r.label}
                >
                  {r.label}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums">
                  {r.records.toLocaleString("th-TH")}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="bar-grow h-full rounded-full bg-chart-4"
                  style={{ width: `${(r.records / max) * 100}%`, animationDelay: `${i * 80}ms` }}
                />
              </div>
            </li>
          ))}
        </ol>
        {/* Without this a reader takes the five bars for every room stock is standing in. */}
        {all.length > TAKE && (
          <p className="mt-3 border-t pt-2.5 text-xs text-muted-foreground">
            แสดง {TAKE} จาก {all.length.toLocaleString("th-TH")} จุด
          </p>
        )}
      </WidgetState>
    </Panel>
  );
}
