import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wrench, Hammer } from "lucide-react";
import type { RepairStatusData } from "@/lib/dashboard-types";

const TILE = [
  { key: "damaged" as const, label: "รอส่งซ่อม", icon: Wrench, cls: "text-danger-500", statuses: "DAMAGED" },
  { key: "underRepair" as const, label: "กำลังซ่อม", icon: Hammer, cls: "text-orange-500", statuses: "UNDER_REPAIR" },
];

export function RepairStatusWidget({ data }: { data: RepairStatusData }) {
  return (
    <Card className="pb-0">
      <CardHeader className="border-b py-3">
        <CardTitle className="text-base font-semibold text-foreground">สถานะงานบำรุงรักษา</CardTitle>
        <p className="text-xs text-muted-foreground">รอส่งซ่อม / กำลังซ่อม</p>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 py-4">
        {TILE.map(({ key, label, icon: Icon, cls, statuses }) => (
          <Link
            key={key}
            href={`/items?status=${statuses}`}
            className="flex flex-col items-center justify-center gap-1 rounded-xl border py-4 transition-colors hover:bg-muted/50"
          >
            <Icon className={`size-5 ${cls}`} />
            <span className={`text-2xl font-extrabold leading-none ${data[key] === 0 ? "text-muted-foreground" : "text-foreground"}`}>
              {data[key]}
            </span>
            <span className="text-xs text-muted-foreground">{label}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
