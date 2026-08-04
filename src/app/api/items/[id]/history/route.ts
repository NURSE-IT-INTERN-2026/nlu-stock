import { prisma } from "@/lib/prisma";
import { requireAuth, json, notFound, getSearchParams, paginate } from "@/lib/api-utils";
import { ADJUSTMENT_REASON_LABELS, STATUS_LABELS, MAINT_TYPE_LABELS, MAINT_RESULT_LABELS } from "@/lib/constants";
import { NextRequest } from "next/server";

type TimelineEvent = {
  id: string;
  type: "DISPENSE" | "RECEIVE" | "ADJUSTMENT" | "STATUS_CHANGE" | "MAINTENANCE" | "LOCATION_CHANGE";
  date: Date;
  description: string;
  user: string;
  details: Record<string, unknown>;
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const item = await prisma.item.findUnique({ where: { id }, select: { id: true } });
  if (!item) return notFound("Item not found");

  const searchParams = getSearchParams(request);
  const { page, perPage, skip, take } = paginate(searchParams);
  const typeFilter = searchParams.get("type");
  // lost mode: merge the 3 loss sources (status→LOST, adjustment reason LOST, return LOST),
  // each filtered + enriched with the fields the lost-history table needs.
  const lost = searchParams.get("lost") === "1";

  const events: TimelineEvent[] = [];

  const fetchDispense = !lost && (!typeFilter || typeFilter === "DISPENSE");
  const fetchReceive = !lost && (!typeFilter || typeFilter === "RECEIVE");
  const fetchAdjust = lost || !typeFilter || typeFilter === "ADJUSTMENT";
  const fetchStatus = lost || !typeFilter || typeFilter === "STATUS_CHANGE";
  const fetchMaint = !lost && (!typeFilter || typeFilter === "MAINTENANCE");
  const fetchLocation = !lost && (!typeFilter || typeFilter === "LOCATION_CHANGE");

  const queries: Promise<void>[] = [];

  if (fetchDispense) {
    queries.push(
      prisma.dispenseRecord.findMany({
        where: { itemId: id },
        include: { staff: { select: { name: true } }, item: { include: { issueUnit: { select: { name: true } } } } },
        orderBy: { dispensedAt: "desc" },
        take: 100,
      }).then((records) => {
        for (const r of records) {
          events.push({
            id: r.id,
            type: "DISPENSE",
            date: r.dispensedAt,
            description: `เบิก ${r.quantity} ${r.item.issueUnit.name}${r.returnedAt ? " (คืนแล้ว)" : ""}`,
            user: r.staff.name,
            details: { quantity: r.quantity, usageType: r.usageType, returnedAt: r.returnedAt },
          });
        }
      })
    );
  }

  if (fetchReceive) {
    queries.push(
      prisma.receiveRecord.findMany({
        where: { itemId: id },
        include: { receiver: { select: { name: true } }, item: { include: { issueUnit: { select: { name: true } } } } },
        orderBy: { receivedAt: "desc" },
        take: 100,
      }).then((records) => {
        for (const r of records) {
          events.push({
            id: r.id,
            type: "RECEIVE",
            date: r.receivedAt,
            description: `รับเข้า ${r.quantity} ${r.item.issueUnit.name}`,
            user: r.receiver.name,
            details: { quantity: r.quantity },
          });
        }
      })
    );
  }

  if (fetchAdjust) {
    queries.push(
      prisma.stockAdjustment.findMany({
        where: lost ? { itemId: id, reason: "LOST" } : { itemId: id },
        include: { adjuster: { select: { name: true } } },
        orderBy: { adjustedAt: "desc" },
        take: 100,
      }).then((records) => {
        for (const r of records) {
          events.push({
            id: r.id,
            type: "ADJUSTMENT",
            date: r.adjustedAt,
            description: lost
              ? `สูญหาย ${r.previousQty - r.newQty} ${r.reason}`
              : `ปรับยอด ${r.previousQty} → ${r.newQty} (${ADJUSTMENT_REASON_LABELS[r.reason] ?? r.reason})`,
            user: r.adjuster.name,
            details: lost
              ? { source: "ADJUSTMENT", qty: r.previousQty - r.newQty, notes: r.notes, recoveredAt: r.recoveredAt }
              : { previousQty: r.previousQty, newQty: r.newQty, reason: r.reason },
          });
        }
      })
    );
  }

  if (fetchStatus) {
    queries.push(
      prisma.itemStatusLog.findMany({
        where: lost ? { itemId: id, newStatus: "LOST" } : { itemId: id },
        include: { changer: { select: { name: true } }, subItem: { select: { subCode: true } } },
        orderBy: { changedAt: "desc" },
        take: 100,
      }).then((records) => {
        for (const r of records) {
          events.push({
            id: r.id,
            type: "STATUS_CHANGE",
            date: r.changedAt,
            description: `เปลี่ยนสถานะ ${STATUS_LABELS[r.previousStatus] ?? r.previousStatus} → ${STATUS_LABELS[r.newStatus] ?? r.newStatus}${r.repairVenue && r.newStatus === "UNDER_REPAIR" ? ` · ส่งซ่อม${r.repairVenue === "EXTERNAL" ? "ภายนอก" : "ภายใน"}` : ""}`,
            user: r.changer.name,
            details: lost
              ? { source: "PIECE", subCode: r.subItem?.subCode ?? null, reason: r.reason, recoveredAt: r.recoveredAt }
              : { previousStatus: r.previousStatus, newStatus: r.newStatus, subItemId: r.subItemId, repairVenue: r.repairVenue },
          });
        }
      })
    );
  }

  if (fetchMaint) {
    queries.push(
      prisma.maintenanceRecord.findMany({
        where: { itemId: id },
        include: { performer: { select: { name: true } } },
        orderBy: { performedAt: "desc" },
        take: 100,
      }).then((records) => {
        for (const r of records) {
          events.push({
            id: r.id,
            type: "MAINTENANCE",
            date: r.performedAt,
            description: `บำรุงรักษา${MAINT_TYPE_LABELS[r.type] ? ` ${MAINT_TYPE_LABELS[r.type]}` : ""} — ${MAINT_RESULT_LABELS[r.result] ?? r.result}`,
            user: r.performer.name,
            details: { type: r.type, result: r.result, cost: r.cost, issue: r.issue },
          });
        }
      })
    );
  }

  if (fetchLocation) {
    queries.push(
      prisma.locationChangeLog.findMany({
        where: { itemId: id },
        include: { changer: { select: { name: true } } },
        orderBy: { changedAt: "desc" },
        take: 100,
      }).then((records) => {
        for (const r of records) {
          events.push({
            id: r.id,
            type: "LOCATION_CHANGE",
            date: r.changedAt,
            description: `ย้ายที่ตั้ง ${r.fromLabel ?? "—"} → ${r.toLabel ?? "ไม่ระบุ"}`,
            user: r.changer.name,
            details: { fromLabel: r.fromLabel, toLabel: r.toLabel },
          });
        }
      })
    );
  }

  // Per-type totals straight from the DB, independent of the current filter and page —
  // so the chips keep showing the whole picture while one type is selected. usedQty is
  // the real "ถูกใช้งานไปเท่าไหร่": the sum of every dispensed quantity.
  const summary = lost ? undefined : Promise.all([
    prisma.dispenseRecord.count({ where: { itemId: id } }),
    prisma.receiveRecord.count({ where: { itemId: id } }),
    prisma.stockAdjustment.count({ where: { itemId: id } }),
    prisma.itemStatusLog.count({ where: { itemId: id } }),
    prisma.maintenanceRecord.count({ where: { itemId: id } }),
    prisma.locationChangeLog.count({ where: { itemId: id } }),
    prisma.dispenseRecord.aggregate({ where: { itemId: id }, _sum: { quantity: true } }),
  ]).then(([DISPENSE, RECEIVE, ADJUSTMENT, STATUS_CHANGE, MAINTENANCE, LOCATION_CHANGE, qty]) => ({
    DISPENSE, RECEIVE, ADJUSTMENT, STATUS_CHANGE, MAINTENANCE, LOCATION_CHANGE,
    usedQty: qty._sum.quantity ?? 0,
  }));

  const [, counts] = await Promise.all([Promise.all(queries), summary]);

  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const total = events.length;
  const paged = events.slice(skip, skip + take);

  return json({ events: paged, page, perPage, total, counts });
}
