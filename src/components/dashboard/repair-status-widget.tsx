"use client";

import Link from "next/link";
import type { RepairStatusData } from "@/lib/dashboard-types";
import { CountUp, Panel } from "./primitives";

// Tile tone is the state's own severity, not the count: ชำรุด is a fault waiting on someone,
// กำลังซ่อม is work already moving.
const TILE = [
  {
    key: "damaged" as const,
    label: "รอส่งซ่อม",
    status: "DAMAGED",
    cls: "bg-danger-500/10 text-danger-700 dark:text-danger-400",
  },
  {
    key: "underRepair" as const,
    label: "กำลังซ่อม",
    status: "UNDER_REPAIR",
    cls: "bg-warning/10 text-warning-700 dark:text-warning-200",
  },
];

export function RepairStatusWidget({ data }: { data: RepairStatusData }) {
  return (
    <Panel title="สถานะงานบำรุงรักษา" hint="รอส่งซ่อม / กำลังซ่อม">
      <div className="grid flex-1 grid-cols-2 gap-3">
        {TILE.map(({ key, label, status, cls }) => (
          <Link
            key={key}
            href={`/items?status=${status}`}
            aria-label={`${label} ${data[key]} ชิ้น`}
            className={`grid place-content-center rounded-xl p-4 text-center transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              data[key] === 0 ? "bg-secondary text-muted-foreground" : cls
            }`}
          >
            <CountUp value={data[key]} className="block text-3xl font-bold" />
            <span className="mt-1 text-[11px] font-medium opacity-80">{label}</span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}
