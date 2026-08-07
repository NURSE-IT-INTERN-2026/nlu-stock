import Link from "next/link";
import { fmtDate, TH_DAY } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RepairInProgressRow } from "@/lib/dashboard-types";

export function RepairInProgressList({ data }: { data: RepairInProgressRow[] }) {
  return (
    <Card className="pb-0">
      <CardHeader className="border-b py-3 flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold text-foreground">งานซ่อมที่กำลังดำเนินการ</CardTitle>
        <Link href="/items?status=UNDER_REPAIR" className="text-xs text-primary hover:underline">ดูทั้งหมด</Link>
      </CardHeader>
      <CardContent className="py-2">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">ไม่มีงานซ่อมค้าง</p>
        ) : (
          <ul className="divide-y">
            {data.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/items/${r.itemId}`}
                  className="flex items-center justify-between gap-2 py-2 text-sm hover:bg-muted/50 -mx-1 px-1 rounded"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground/80">{r.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{r.code}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(r.updatedAt, TH_DAY)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
