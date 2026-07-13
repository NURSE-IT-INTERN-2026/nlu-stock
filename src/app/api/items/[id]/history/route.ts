import { prisma } from "@/lib/prisma";
import { requireAuth, json, notFound, getSearchParams, paginate } from "@/lib/api-utils";
import { ADJUSTMENT_REASON_LABELS, STATUS_LABELS } from "@/lib/constants";
import { NextRequest } from "next/server";

// ponytail: inline label maps — only used here, no need to promote to constants yet.
const MAINT_TYPE_LABELS = { PREVENTIVE: "ป้องกัน", CORRECTIVE: "แก้ไข" } as const;
const MAINT_RESULT_LABELS = { AVAILABLE: "ใช้งานได้", NEEDS_MORE_REPAIR: "ต้องซ่อมต่อ", DISPOSED: "ตัดจำหน่าย" } as const;

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

  const events: TimelineEvent[] = [];

  const fetchDispense = !typeFilter || typeFilter === "DISPENSE";
  const fetchReceive = !typeFilter || typeFilter === "RECEIVE";
  const fetchAdjust = !typeFilter || typeFilter === "ADJUSTMENT";
  const fetchStatus = !typeFilter || typeFilter === "STATUS_CHANGE";
  const fetchMaint = !typeFilter || typeFilter === "MAINTENANCE";
  const fetchLocation = !typeFilter || typeFilter === "LOCATION_CHANGE";

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
        where: { itemId: id },
        include: { adjuster: { select: { name: true } } },
        orderBy: { adjustedAt: "desc" },
        take: 100,
      }).then((records) => {
        for (const r of records) {
          events.push({
            id: r.id,
            type: "ADJUSTMENT",
            date: r.adjustedAt,
            description: `ปรับยอด ${r.previousQty} → ${r.newQty} (${ADJUSTMENT_REASON_LABELS[r.reason] ?? r.reason})`,
            user: r.adjuster.name,
            details: { previousQty: r.previousQty, newQty: r.newQty, reason: r.reason },
          });
        }
      })
    );
  }

  if (fetchStatus) {
    queries.push(
      prisma.itemStatusLog.findMany({
        where: { itemId: id },
        include: { changer: { select: { name: true } } },
        orderBy: { changedAt: "desc" },
        take: 100,
      }).then((records) => {
        for (const r of records) {
          events.push({
            id: r.id,
            type: "STATUS_CHANGE",
            date: r.changedAt,
            description: `เปลี่ยนสถานะ ${STATUS_LABELS[r.previousStatus] ?? r.previousStatus} → ${STATUS_LABELS[r.newStatus] ?? r.newStatus}`,
            user: r.changer.name,
            details: { previousStatus: r.previousStatus, newStatus: r.newStatus, subItemId: r.subItemId },
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

  await Promise.all(queries);

  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const total = events.length;
  const paged = events.slice(skip, skip + take);

  return json({ events: paged, page, perPage, total });
}
