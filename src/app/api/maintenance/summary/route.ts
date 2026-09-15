import { NextRequest } from "next/server";
import { requireAuth, json } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { denied } = await requireAuth(request);
  if (denied) return denied;

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Start of current month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  // Start of next month
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Counts must match the schedule rows: one per live tracked copy (source = SubItem
  // dates) plus one per flat item (source = Item dates). Written-off copies excluded.
  // ส่งบำรุงข้างนอกแล้วยังไม่กลับมา ไม่นับว่าเกินกำหนด/ใกล้ถึงกำหนด — งานรอบนั้นทำอยู่แล้ว
  // มันมีการ์ดของตัวเอง และตารางก็แสดงแถวเป็น "กำลังบำรุงรักษา" ด้วยเหตุผลเดียวกัน
  // (api/reports/maintenance-schedule statusOf). ทั้งสามการ์ดจึงแบ่งกันสนิท ไม่นับซ้ำ.
  const OUT = "PENDING_MAINTENANCE" as const;
  const trackedWhere = (range: object) => ({
    nextMaintenanceDate: range,
    status: { notIn: ["DISPOSED", "LOST", OUT] as ("DISPOSED" | "LOST" | typeof OUT)[] },
    item: { isActive: true, trackIndividually: true },
  });
  const flatWhere = (range: object) => ({
    nextMaintenanceDate: range,
    status: { not: OUT },
    isActive: true,
    trackIndividually: false,
  });

  const [overdueSub, overdueFlat, dueSoonSub, dueSoonFlat, outSub, outFlat, completedThisMonth] = await Promise.all([
    prisma.subItem.count({ where: trackedWhere({ lt: now }) }),
    prisma.item.count({ where: flatWhere({ lt: now }) }),
    prisma.subItem.count({ where: trackedWhere({ gte: now, lte: in30Days }) }),
    prisma.item.count({ where: flatWhere({ gte: now, lte: in30Days }) }),
    // ส่งออกไปข้างนอกแล้วยังไม่ได้กลับมา. Matches the table's rows: a piece only appears there
    // once it has a nextMaintenanceDate at all, so the card counts the same population.
    prisma.subItem.count({
      where: {
        nextMaintenanceDate: { not: null },
        status: OUT,
        item: { isActive: true, trackIndividually: true },
      },
    }),
    prisma.item.count({
      where: { nextMaintenanceDate: { not: null }, status: OUT, isActive: true, trackIndividually: false },
    }),
    prisma.maintenanceRecord.count({
      where: { type: "PREVENTIVE", performedAt: { gte: monthStart, lt: monthEnd } },
    }),
  ]);

  return json({
    overdue: overdueSub + overdueFlat,
    dueSoon: dueSoonSub + dueSoonFlat,
    inMaintenance: outSub + outFlat,
    completedThisMonth,
  });
}
