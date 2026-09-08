"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "./primitives";
import { useLoanSummary, useInUseSummary } from "@/hooks/use-dashboard-queries";

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[116px] w-full rounded-2xl" />
      ))}
    </div>
  );
}

/**
 * ยืม KPIs.
 *
 * Unit rule for the page: **cards count things (ชิ้น), charts count events (ครั้ง)** — except
 * the first card, which is the month's activity and says ครั้ง on its face. Mixing them
 * unlabelled is how "ค้าง 23" gets read as 23 loans when it is 23 chairs.
 *
 * คืนตรงเวลา is the only card that measures whether the loop works rather than how busy it
 * was, which is why it takes the fourth slot over a second count of the same events.
 */
export function LoanKpis() {
  const { data, isLoading } = useLoanSummary();
  if (isLoading || !data) return <KpiSkeleton />;

  const { thisMonth, outstanding, overdue, onTimeRate } = data;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="ยืมออกเดือนนี้" value={thisMonth.toLocaleString("th-TH")} unit="ครั้ง" bar={[1, "bg-chart-1"]} />
      <StatCard
        label="ค้างยังไม่คืน"
        value={outstanding.toLocaleString("th-TH")}
        unit="ชิ้น"
        bar={[outstanding > 0 ? 0.7 : 0.04, "bg-warning"]}
      />
      <StatCard
        label="เกินกำหนดคืน"
        value={overdue.toLocaleString("th-TH")}
        unit="ชิ้น"
        // Share of the outstanding pile that is late — a bar at full width on 6 of 6 late
        // says something a bar scaled to nothing does not.
        bar={[outstanding > 0 ? overdue / outstanding : 0, "bg-destructive"]}
        hint={outstanding > 0 ? `จากค้างทั้งหมด ${outstanding.toLocaleString("th-TH")} ชิ้น` : undefined}
      />
      <StatCard
        label="คืนตรงเวลา"
        value={onTimeRate === null ? "—" : `${onTimeRate}`}
        unit={onTimeRate === null ? undefined : "%"}
        bar={[(onTimeRate ?? 0) / 100, "bg-success"]}
        hint={onTimeRate === null ? "ยังไม่มีรายการที่คืนแล้ว" : "ของที่คืนแล้ว ย้อนหลัง 1 ปี"}
      />
    </div>
  );
}

/** นำไปใช้งาน KPIs. Same unit rule. */
export function InUseKpis() {
  const { data, isLoading } = useInUseSummary();
  if (isLoading || !data) return <KpiSkeleton />;

  const { thisMonth, outstanding, locations, maintenanceOverdue } = data;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="นำออกใช้งานเดือนนี้" value={thisMonth.toLocaleString("th-TH")} unit="ครั้ง" bar={[1, "bg-chart-1"]} />
      {/* คำเดียวกับ loanType INUSE ที่ใช้ทั่วระบบ ไม่ใช่คำใหม่ — และไม่ใช่ "ใช้งานอยู่" ซึ่งเป็น
          ป้ายของ ItemStatus.IN_USE: การ์ดนี้นับจาก ledger (DispenseRecord ที่ยังไม่นำกลับ) จึงรวม
          ของนับจำนวนที่ไม่มีสถานะรายชิ้นให้อ่านด้วย. หน่วยเป็นชิ้น ไม่ใช่ครั้ง เหมือนการ์ดซ้ายมือ. */}
      <StatCard label="ตั้งใช้ในห้อง" value={outstanding.toLocaleString("th-TH")} unit="ชิ้น" bar={[outstanding > 0 ? 0.7 : 0.04, "bg-chart-4"]} />
      <StatCard label="จุดที่กระจายอยู่" value={locations.toLocaleString("th-TH")} unit="จุด" bar={[locations > 0 ? 0.6 : 0.04, "bg-chart-2"]} />
      <StatCard
        label="เลยกำหนดตรวจสอบ"
        value={maintenanceOverdue.toLocaleString("th-TH")}
        unit="ชิ้น"
        bar={[maintenanceOverdue > 0 ? 0.8 : 0.04, "bg-warning"]}
        // Warehouse-wide overdue maintenance lives on /alerts; this card is only the part
        // somebody has to walk to a room to reach.
        hint="เฉพาะของที่ตั้งใช้งานอยู่"
      />
    </div>
  );
}
