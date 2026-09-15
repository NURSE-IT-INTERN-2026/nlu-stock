"use client";

import { Button } from "@/components/ui/button";
import { getInUseRecords } from "@/lib/api";
import { recipientLabel } from "@/lib/constants";
import { useAsync, useDashboardRefreshNonce } from "@/hooks/use-async";
import { useDashboardScope } from "@/hooks/use-dashboard-scope";
import { scopeKey } from "@/lib/dashboard-scope";
import { fmtDate, TH_DAY } from "@/lib/format";
import { MoveTable, type MoveRow } from "./move-table";
import { DashboardSkeleton } from "./dashboard-skeleton";

// ของที่ถูกนำออกไปใช้งานตอนนี้ — reuses /api/dispense/in-use (open INUSE records, both kinds).
// เหตุผล stands in for ผู้ดูแล: นำไปใช้งาน has no borrower to chase, so where it went and what
// for is the actionable half.
//
// Scoped by the ประเภท/หมวดย่อย filter like every other widget on the tab — never the whole
// warehouse, or it contradicts the KPI cards right above it.
//
// Top TAKE only, then a link out. /api/dispense/in-use returns every open record, so paging it
// five at a time inside a dashboard card produced 52 pages — /receive?tab=in_use is the screen
// built for that list, with search and รับคืน on it.
const TAKE = 8;

export function InUseTable() {
  const nonce = useDashboardRefreshNonce();
  const scope = useDashboardScope();
  const { data, isLoading, error, refetch } = useAsync(
    async () => (await getInUseRecords(scope)).records,
    [nonce, scopeKey(scope)],
  );

  if (isLoading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="animate-fade-in py-8 text-center">
        <p className="mb-2 text-destructive">{error.message}</p>
        <Button variant="outline" onClick={() => refetch()}>
          โหลดใหม่
        </Button>
      </div>
    );
  }

  const all = data ?? [];
  const rows: MoveRow[] = all.slice(0, TAKE).map((r) => {
    const loc = r.location ?? r.item.location;
    return {
      id: r.id,
      itemId: r.item.id,
      date: fmtDate(new Date(r.dispensedAt), TH_DAY),
      name: r.subItem?.name ?? r.item.name,
      code: r.subItem?.subCode ?? r.item.code,
      kind: loc ? [loc.building, loc.room].filter(Boolean).join(" ") : undefined,
      qty: r.quantity - r.resolvedQty,
      // recipientLabel, not raw notes: it is the one definition of เหตุผล in the app (the
      // ค้างคืน table beside this one uses it too), and it drops the legacy "ห้องที่ตั้ง: …"
      // line that would otherwise repeat the สถานที่ column sitting right next to it.
      who: recipientLabel(r) ?? "—",
    };
  });

  return (
    <MoveTable
      title="ของที่ถูกนำออกไปใช้งาน"
      rows={rows}
      tone="issued"
      whoLabel="เหตุผล"
      emptyText="ยังไม่มีของที่นำไปใช้งาน"
      viewAll={{ href: "/receive?tab=in_use", total: all.length }}
    />
  );
}
