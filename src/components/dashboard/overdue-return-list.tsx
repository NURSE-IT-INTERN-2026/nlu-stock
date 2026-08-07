import Link from "next/link";
import { fmtDate, TH_DAY } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OverdueReturnRow } from "@/lib/dashboard-types";

export function OverdueReturnList({ data }: { data: OverdueReturnRow[] }) {
  return (
    <Card className="pb-0">
      <CardHeader className="border-b py-3 flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold text-foreground">คืนเกินกำหนด</CardTitle>
        <Link href="/alerts?overdueReturn=true" className="text-xs text-primary hover:underline">ดูทั้งหมด</Link>
      </CardHeader>
      <CardContent className="py-2">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">ไม่มีรายการค้างคืน</p>
        ) : (
          <ul className="divide-y">
            {data.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/items/${r.item.id}`}
                  className="flex items-center justify-between gap-2 py-2 text-sm hover:bg-muted/50 -mx-1 px-1 rounded"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground/80">{r.item.name}</p>
                    <p className="text-xs text-muted-foreground">{r.staff.name} · {r.quantity} ชิ้น</p>
                  </div>
                  <span className="shrink-0 text-xs text-destructive">ครบกำหนด {fmtDate(r.dueAt, TH_DAY)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
