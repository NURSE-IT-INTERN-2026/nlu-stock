import { prisma } from "@/lib/prisma";
import { requireAuth, json, notFound, getSearchParams, paginate } from "@/lib/api-utils";
import {
  ADJUSTMENT_REASON_LABELS, STATUS_LABELS, MAINT_TYPE_LABELS, MAINT_RESULT_LABELS,
  USAGE_TYPE_LABELS, RETURN_CONDITION_LABELS, type TimelineEventType,
} from "@/lib/constants";
import { isLoanEdge } from "@/lib/returns";
import { NextRequest } from "next/server";

// A history row as the table renders it: what happened, how much stock moved (signed,
// null when the event doesn't touch stock), why, who, when.
// note/detail are split rather than joined into one string: the หมายเหตุ cell leads with the
// one thing worth scanning (`ปรับยอด 130 → 125`) and demotes the supporting context to a
// second, quieter line, which one `·`-joined blob cannot do.
// `qty` is how many units the event involved; `delta` is how much stock actually moved.
// They differ on a ชำรุด/สูญหาย return — 3 pieces came back through the door (qty 3) but none
// of them re-entered usable stock (delta 0). Summing delta for the chips would report
// "รับคืน 0 ชิ้น" for a return that plainly happened, so the chips read qty.
type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  date: Date;
  delta: number | null;
  qty: number | null;
  note: string;
  detail: string;
  user: string;
  details: Record<string, unknown>;
};

const joinNotes = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const item = await prisma.item.findUnique({
    where: { id },
    select: {
      id: true,
      issueUnit: { select: { name: true } },
      category: { select: { profile: { select: { dispenseType: true } } } },
    },
  });
  if (!item) return notFound("Item not found");

  const unit = item.issueUnit.name;
  const isConsumable = item.category.profile?.dispenseType === "CONSUMABLE";

  const searchParams = getSearchParams(request);
  const { page, perPage, skip, take } = paginate(searchParams);
  const typeFilter = searchParams.get("type");
  // lost mode: merge the 3 loss sources (status→LOST, adjustment reason LOST, return LOST),
  // each filtered + enriched with the fields the lost-history table needs.
  const lost = searchParams.get("lost") === "1";
  // Piece mode: only the sources that carry a subItemId can be scoped to one copy.
  // ReceiveRecord / StockAdjustment / LocationChangeLog are item-level and drop out.
  const subItemId = searchParams.get("subItemId");

  const events: TimelineEvent[] = [];

  const itemLevel = !subItemId;
  const fetchDispense = !lost;
  const fetchReturn = !lost;
  const fetchReceive = !lost && itemLevel;
  const fetchAdjust = lost || itemLevel;
  const fetchMaint = !lost;
  const fetchLocation = !lost && itemLevel;

  // ponytail: every row for this item is loaded, then sorted and sliced in memory. Paging
  // across 7 tables in SQL means a UNION ALL query or a materialised ledger; neither is
  // worth it while an item's history is in the hundreds. Revisit if one ever hits ~10k rows.
  const queries: Promise<void>[] = [];

  if (fetchDispense) {
    queries.push(
      prisma.dispenseRecord.findMany({
        where: { itemId: id, ...(subItemId ? { subItemId } : {}) },
        include: { staff: { select: { name: true } }, location: { select: { building: true, room: true } } },
        orderBy: { dispensedAt: "desc" },
      }).then((records) => {
        for (const r of records) {
          // Same table, three different events. A consumable is used up; a durable either
          // sits in a room (INUSE) or is out on loan and owed back (BORROW).
          const type: TimelineEventType = isConsumable
            ? "DISPENSE"
            : r.loanType === "INUSE" ? "INUSE" : "BORROW";
          const place = r.location ? [r.location.building, r.location.room].filter(Boolean).join(" ") : null;
          events.push({
            id: r.id,
            type,
            date: r.dispensedAt,
            delta: -r.quantity,
            qty: r.quantity,
            // "อื่นๆ" as a headline says nothing — for that one type the free text IS the
            // event, so it leads and drops out of the quieter second line.
            note: r.usageType === "OTHER" && r.notes?.trim()
              ? r.notes.trim()
              : (r.usageType ? USAGE_TYPE_LABELS[r.usageType] : null) ?? "นำออกจากคลัง",
            detail: joinNotes(
              r.usageNote,
              r.recipient ? `ผู้รับ ${r.recipient}` : null,
              place ? `ห้องที่ตั้ง ${place}` : null,
              r.usageType === "OTHER" ? null : r.notes,
            ),
            user: r.staff.name,
            details: { quantity: r.quantity, usageType: r.usageType, returnedAt: r.returnedAt, loanType: r.loanType },
          });
        }
      })
    );
  }

  if (fetchReturn) {
    queries.push(
      prisma.returnRecord.findMany({
        where: { itemId: id, ...(subItemId ? { subItemId } : {}) },
        include: { returner: { select: { name: true } } },
        orderBy: { returnedAt: "desc" },
      }).then((records) => {
        for (const r of records) {
          events.push({
            id: r.id,
            type: "RETURN",
            date: r.returnedAt,
            // Stock only comes back when the piece came back usable. A ชำรุด/สูญหาย return
            // already has its own ปรับสต๊อก row carrying the write-off — counting it here too
            // would make the column stop adding up.
            delta: r.condition === "AVAILABLE" ? r.quantity : 0,
            qty: r.quantity,
            note: RETURN_CONDITION_LABELS[r.condition] ?? r.condition,
            detail: r.notes ?? "",
            user: r.returner.name,
            details: { quantity: r.quantity, condition: r.condition },
          });
        }
      })
    );
  }

  if (fetchReceive) {
    queries.push(
      prisma.receiveRecord.findMany({
        where: { itemId: id },
        include: { receiver: { select: { name: true } } },
        orderBy: { receivedAt: "desc" },
      }).then((records) => {
        for (const r of records) {
          events.push({
            id: r.id,
            type: "RECEIVE",
            date: r.receivedAt,
            delta: r.quantity,
            qty: r.quantity,
            note: "รับเข้าคลัง",
            detail: r.notes ?? "",
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
      }).then((records) => {
        for (const r of records) {
          events.push({
            id: r.id,
            type: "ADJUSTMENT",
            date: r.adjustedAt,
            delta: r.newQty - r.previousQty,
            qty: Math.abs(r.newQty - r.previousQty),
            note: lost
              ? `สูญหาย ${r.previousQty - r.newQty} ${unit}`
              : `ปรับยอด ${r.previousQty} → ${r.newQty}`,
            detail: joinNotes(lost ? null : ADJUSTMENT_REASON_LABELS[r.reason] ?? r.reason, r.notes),
            user: r.adjuster.name,
            details: lost
              ? { source: "ADJUSTMENT", qty: r.previousQty - r.newQty, notes: r.notes, recoveredAt: r.recoveredAt }
              : { previousQty: r.previousQty, newQty: r.newQty, reason: r.reason },
          });
        }
      })
    );
  }

  queries.push(
    prisma.itemStatusLog.findMany({
      where: {
        itemId: id,
        ...(subItemId ? { subItemId } : {}),
        ...(lost ? { newStatus: "LOST" as const } : {}),
      },
      include: { changer: { select: { name: true } }, subItem: { select: { subCode: true } } },
      orderBy: { changedAt: "desc" },
    }).then((records) => {
      for (const r of records) {
        // Loan transitions belong to the เบิก/รับคืน rows, both ways — see isLoanEdge.
        if (!lost && isLoanEdge(r)) continue;
        events.push({
          id: r.id,
          type: "STATUS_CHANGE",
          date: r.changedAt,
          delta: null,
          qty: null,
          note: `${STATUS_LABELS[r.previousStatus] ?? r.previousStatus} → ${STATUS_LABELS[r.newStatus] ?? r.newStatus}`,
          detail: joinNotes(
            r.repairVenue && r.newStatus === "UNDER_REPAIR" ? `ส่งซ่อม${r.repairVenue === "EXTERNAL" ? "ภายนอก" : "ภายใน"}` : null,
            r.damageNote,
            r.reason,
          ),
          user: r.changer.name,
          details: lost
            ? { source: "PIECE", subCode: r.subItem?.subCode ?? null, reason: r.reason, recoveredAt: r.recoveredAt }
            : { previousStatus: r.previousStatus, newStatus: r.newStatus, subItemId: r.subItemId, repairVenue: r.repairVenue },
        });
      }
    })
  );

  if (fetchMaint) {
    queries.push(
      prisma.maintenanceRecord.findMany({
        where: { itemId: id, ...(subItemId ? { subItemId } : {}) },
        include: { performer: { select: { name: true } } },
        orderBy: { performedAt: "desc" },
      }).then((records) => {
        for (const r of records) {
          events.push({
            id: r.id,
            type: "MAINTENANCE",
            date: r.performedAt,
            delta: null,
            qty: null,
            note: MAINT_TYPE_LABELS[r.type] ?? r.type,
            detail: joinNotes(MAINT_RESULT_LABELS[r.result] ?? r.result, r.issue),
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
      }).then((records) => {
        for (const r of records) {
          events.push({
            id: r.id,
            type: "LOCATION_CHANGE",
            date: r.changedAt,
            delta: null,
            qty: null,
            note: `${r.fromLabel ?? "—"} → ${r.toLabel ?? "ไม่ระบุ"}`,
            detail: "",
            user: r.changer.name,
            details: { fromLabel: r.fromLabel, toLabel: r.toLabel },
          });
        }
      })
    );
  }

  await Promise.all(queries);

  events.sort((a, b) => b.date.getTime() - a.date.getTime());

  // Counts come off the very same array the list is paged from, so the chips and the table
  // can no longer disagree — the old version counted in the DB but listed from a capped
  // in-memory merge, which is why the two never matched.
  // `qty` stays null for the types that never move stock (สถานะ/ซ่อม/ย้ายที่) — those chips
  // count occurrences instead, because "เปลี่ยนสถานะ 0 ชิ้น" would be a number pretending to
  // mean something.
  const counts = events.reduce<Record<string, { n: number; qty: number | null }>>((acc, e) => {
    const c = (acc[e.type] ??= { n: 0, qty: null });
    c.n += 1;
    if (e.qty !== null) c.qty = (c.qty ?? 0) + e.qty;
    return acc;
  }, {});

  const filtered = typeFilter ? events.filter((e) => e.type === typeFilter) : events;
  const total = filtered.length;
  const paged = filtered.slice(skip, skip + take);

  return json({ events: paged, page, perPage, total, counts, unit });
}
