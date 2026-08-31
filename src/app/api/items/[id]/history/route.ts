import { prisma } from "@/lib/prisma";
import { requireAuth, json, notFound, getSearchParams, paginate } from "@/lib/api-utils";
import {
  ADJUSTMENT_REASON_LABELS, STATUS_LABELS, MAINT_TYPE_LABELS, MAINT_RESULT_LABELS,
  USAGE_TYPE_LABELS, RETURN_CONDITION_LABELS, type TimelineEventType,
} from "@/lib/constants";
import { isDuplicateOfLoanRow } from "@/lib/returns";
import { AdjustmentReason } from "@/generated/prisma/enums";
import { fmtDate, TH_DATE } from "@/lib/format";
import { NextRequest } from "next/server";
import type { AttachRecordType } from "@/lib/attachments";
import { groupTimelineCases, type Booking, type TimelineCase } from "@/lib/timeline-cases";
import { caseRangeBounds, listCases, type CaseState } from "@/lib/cases";

// A history row as the table renders it. Three text fields, each with one job:
//   note     — the bold title, the one thing worth scanning ("รับคืนจากซ่อม").
//   subtitle — a curated second line derived from structured data (loan status, repair venue,
//              maintenance result, a canned reason phrase). Safe for the table: never free-text.
//   notes    — the staff member's own free-text ("ทดสอบชำรุด รอบ 2"). Detail dialog only, so a
//              test string or a paragraph can never leak into or bloat the table row.
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
  subtitle: string;
  notes: string;
  user: string;
  // Stock balance before/after the event, when it moved qty stock. The จำนวน cell shows it as
  // `100 → 147` under the count, and the row detail spells it out in full.
  change?: { from: number; to: number } | null;
  // ค่าซ่อม, folded in from the MaintenanceRecord that closed the same trip. Dialog only.
  cost?: number | null;
  // หลักฐานแนบ — รูปอาการเสีย, ใบเสนอราคา, เอกสารรับคืน. Dialog only; the table stays text.
  //
  // Grouped by the record that owns the array rather than flattened, because the dialog can now
  // write back: "แนบเพิ่ม" needs a table and an id, not just a list of urls. A รับคืนจากซ่อม row
  // is the one event assembled from two records (the adjustment that moved the stock and the
  // maintenance record that closed the trip), so it carries two groups and each edits its own.
  // A group with no urls still ships — that is the empty state the แนบเพิ่ม button hangs off.
  // Events with no evidence column of their own (รับเข้า, ย้ายที่) get no group and stay read-only.
  attachments?: { recordType: AttachRecordType; recordId: string; urls: string[] }[];
  details: Record<string, unknown>;
};

const joinNotes = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");
// "รายวิชา" + "ภาษาอังกฤษ 2" → "รายวิชา ภาษาอังกฤษ 2"; either half alone stands on its own.
const joinLabel = (label: string | null, text: string | null) => [label, text].filter(Boolean).join(" ") || null;

// The subtitle earns its line only by saying something the chip and the รายการ cell have not
// said already. "ตัดจำหน่าย" under a row headed ตัดจำหน่าย is the same word twice; what is left
// here is the two reasons that carry a real state — where the units went, and what came back.
// The staff member's own note (which may be a test string) never appears here — it rides in
// `notes` for the detail dialog only.
const ADJUSTMENT_SUBTITLE: Partial<Record<AdjustmentReason, string>> = {
  [AdjustmentReason.DAMAGED_PENDING_REPAIR]: "รอดำเนินการซ่อม",
  [AdjustmentReason.REPAIR_RETURN]: "ซ่อมเสร็จ พร้อมใช้งาน",
};

// ยืม/นำไปใช้งาน rows say what left the store but not whether it is still out — the same row
// reads identically whether the 5 pieces came back in July or are three weeks overdue. The
// numbers are already on the DispenseRecord (quantity vs resolvedQty, dueAt), so this is the
// one thing the row was missing.
const loanStatus = (r: { quantity: number; resolvedQty: number; dueAt: Date | null }, unit: string) => {
  const owed = r.quantity - r.resolvedQty;
  if (owed <= 0) return "คืนครบแล้ว";
  const due = r.dueAt ? ` · กำหนดคืน ${fmtDate(r.dueAt, TH_DATE)}` : "";
  const late = r.dueAt && r.dueAt < new Date() ? "เกินกำหนด · " : "";
  return `${late}ค้าง ${owed} ${unit}${due}`;
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const data = await itemHistory(id, getSearchParams(request));
  return data ? json(data) : notFound("Item not found");
}

/**
 * ประวัติของพัสดุหนึ่งชิ้นตามตัวกรอง. Exported เพราะไฟล์ส่งออกอ่านทางนี้ทางเดียวกับหน้าจอ —
 * รายงานที่ query เองอีกชุดคือรายงานที่วันหนึ่งจะให้คำตอบไม่ตรงกับจอที่คนกดปุ่มมองอยู่.
 * คืน null เมื่อไม่มีพัสดุนี้ ให้ผู้เรียกเป็นคนตัดสินว่าจะตอบ 404 หรืออะไร.
 */
export async function itemHistory(id: string, searchParams: URLSearchParams) {
  const item = await prisma.item.findUnique({
    where: { id },
    select: {
      id: true,
      issueUnit: { select: { name: true } },
      category: { select: { profile: { select: { code: true, dispenseType: true } } } },
    },
  });
  if (!item) return null;

  const unit = item.issueUnit.name;
  const isConsumable = item.category.profile?.dispenseType === "CONSUMABLE";
  const isKit = item.category.profile?.code === "KIT";

  const { page, perPage, skip, take } = paginate(searchParams);
  const typeFilter = searchParams.get("type");
  // ตัวกรองชุดเดียวกับที่เวิร์กสเปซเคสใช้ — หน้านี้เลิกเป็น "ประวัติที่กรองได้แค่ประเภท" แล้ว
  const stateFilter = searchParams.get("state") as CaseState | null;
  const { from: fromDate, to: toDate } = caseRangeBounds(searchParams.get("range"));
  const q = searchParams.get("q")?.trim().toLowerCase() || null;
  // Piece mode: only the sources that carry a subItemId can be scoped to one copy.
  // ReceiveRecord / StockAdjustment / LocationChangeLog are item-level and drop out.
  const subItemId = searchParams.get("subItemId");

  const events: TimelineEvent[] = [];
  // adjustment id → ค่าซ่อม of the job that closed it; merged in once both queries have run.
  const repairJobs = new Map<string, { id: string; cost: number | null; attachments: string[]; bookingId: string | null }>();
  // adjustment id → its own หลักฐาน, so a closing row can reach the booking it closed without a
  // second query. Every adjustment for this item is already loaded below.
  const adjAttachments = new Map<string, string[]>();
  // แจ้งชำรุด bookings, for placing the ส่งซ่อม rows that carry no link back to one.
  const bookings = new Map<string, Booking>();
  // booking id → the id of the timeline row that closed it.
  const closedBy = new Map<string, string>();
  // ── ยืม cases ──
  // หนึ่งเคส = หนึ่งบรรทัดของใบ ไม่ใช่ทั้งใบ: ชามรูปไตที่คืนครบแล้วต้องอ่านว่าจบ ถึงแก้วน้ำในใบเดียวกัน
  // จะยังค้างอยู่. บรรทัดคือ DispenseRecord และ รับคืน ชี้กลับหาบรรทัดที่มันปิดอยู่แล้ว — ไม่มีอะไรต้องเดา.
  const loanKeyOf = new Map<string, string>(); // event id → dispense record id
  const loanOutstanding = new Map<string, number>(); // dispense record id → units still out

  const itemLevel = !subItemId;
  // เดิมมีโหมด `?lost=1` ที่ยิงคำถามคนละคำถามผ่านเส้นทางเดียวกันนี้ — เปลี่ยนทั้งเงื่อนไข where,
  // ชื่อแถว และรูปร่างของ details ทั้งหมด เพื่อป้อนแท็บประวัติสูญหายที่แยกต่างหาก. ตอนนี้ของหาย
  // เป็นเคส LC ซึ่งอ่านจาก src/lib/cases.ts เหมือนเคสอื่น โหมดนั้นจึงหายไปทั้งโหมด.
  const fetchReceive = itemLevel;
  const fetchAdjust = itemLevel;
  const fetchLocation = itemLevel;

  // ponytail: every row for this item is loaded, then sorted and sliced in memory. Paging
  // across 7 tables in SQL means a UNION ALL query or a materialised ledger; neither is
  // worth it while an item's history is in the hundreds. Revisit if one ever hits ~10k rows.
  const queries: Promise<void>[] = [];

  {
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
          // เหตุผล lives in usageNote; notes is where กิจกรรม/อื่นๆ wrote it before that, and
          // where นำไปใช้งาน still writes it (lib/constants recipientLabel uses the same order).
          const reason = r.usageNote?.trim() || r.notes?.trim() || null;
          // เบิกสิ้นเปลือง is not a case — nothing comes back and nobody is waiting on it.
          if (type !== "DISPENSE") {
            loanKeyOf.set(r.id, r.id);
            loanOutstanding.set(r.id, Math.max(0, r.quantity - r.resolvedQty));
          }
          events.push({
            id: r.id,
            type,
            date: r.dispensedAt,
            delta: -r.quantity,
            qty: r.quantity,
            // The name of what happened, fixed per event type. It used to be the usageType
            // ("รายวิชา"), which answers a different question — why the stock left, not what
            // was done to it — and left the row with no word for the action anywhere.
            note: type === "BORROW" ? "ยืมออก" : type === "INUSE" ? "ตั้งใช้ในห้อง" : "เบิกออก",
            subtitle: joinNotes(
              // Leads the line: on a ยืม row "ค้าง 5 ชิ้น" is the thing worth scanning, and
              // a consumable never comes back so it gets no status at all.
              isConsumable ? null : loanStatus(r, unit),
              // The purpose, now that the headline is the action: "รายวิชา ภาษาอังกฤษ 2".
              // อื่นๆ prints the เหตุผล bare — the label adds nothing the text does not say.
              r.usageType === "OTHER"
                ? reason
                : joinLabel(r.usageType ? USAGE_TYPE_LABELS[r.usageType] : null, reason),
              // Legacy rows only: someone typed a name back when ผู้รับ was a field of its own.
              r.recipient ? `ผู้รับ ${r.recipient}` : null,
              place ? `ห้องที่ตั้ง ${place}` : null,
            ),
            notes: "",
            user: r.staff.name,
            details: {
              quantity: r.quantity, usageType: r.usageType, returnedAt: r.returnedAt, loanType: r.loanType,
              resolvedQty: r.resolvedQty, dueAt: r.dueAt,
            },
          });
        }
      })
    );
  }

  {
    queries.push(
      prisma.returnRecord.findMany({
        where: { itemId: id, ...(subItemId ? { subItemId } : {}) },
        include: {
          returner: { select: { name: true } },
        },
        orderBy: { returnedAt: "desc" },
      }).then((records) => {
        for (const r of records) {
          if (r.dispenseRecordId) loanKeyOf.set(r.id, r.dispenseRecordId);
          events.push({
            id: r.id,
            type: "RETURN",
            date: r.returnedAt,
            // Stock only comes back when the piece came back usable. A ชำรุด/สูญหาย return
            // already has its own ปรับสต๊อก row carrying the write-off — counting it here too
            // would make the column stop adding up.
            delta: r.condition === "AVAILABLE" ? r.quantity : 0,
            qty: r.quantity,
            // The action, with the condition qualifying it — a ชำรุด return is still a return,
            // and a row that reads only "ชำรุด" is indistinguishable from a แจ้งชำรุด row.
            note: r.condition === "AVAILABLE"
              ? "รับคืน"
              : `รับคืน (${RETURN_CONDITION_LABELS[r.condition] ?? r.condition})`,
            subtitle: "",
            notes: r.notes ?? "",
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
            subtitle: "",
            notes: r.notes ?? "",
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
      }).then((records) => {
        for (const r of records) {
          adjAttachments.set(r.id, r.imageEvidenceUrls);
          if (r.reason === AdjustmentReason.DAMAGED_PENDING_REPAIR) {
            bookings.set(r.id, { openedAt: r.adjustedAt, closedAt: r.recoveredAt, qty: r.previousQty - r.newQty });
          }
          events.push({
            id: r.id,
            // Two reasons are events, not stock corrections: แจ้งชำรุด opens the repair flow, and
            // the row that hands repaired units back is stock walking in the door — the same
            // thing รับเข้า means everywhere else in the app. ยกเลิกคำขอชำรุด stays ปรับสต๊อก: it
            // withdraws a booking that should not have existed, it does not receive anything.
            type: r.reason === AdjustmentReason.DAMAGED_PENDING_REPAIR
                ? "DAMAGE_REPORT"
                : r.reason === AdjustmentReason.REPAIR_RETURN
                  ? "RECEIVE"
                  : "ADJUSTMENT",
            date: r.adjustedAt,
            delta: r.newQty - r.previousQty,
            qty: Math.abs(r.newQty - r.previousQty),
            // รายการ leads with the reason label alone — the จำนวน column already carries how many
            // units moved, and the before/after balance rides in `change`, so neither the yard
            // figure nor the "ปรับยอด X → Y" string crowds the cell any more.
            note: ADJUSTMENT_REASON_LABELS[r.reason] ?? r.reason,
            subtitle: ADJUSTMENT_SUBTITLE[r.reason] ?? "",
            notes: r.notes ?? "",
            change: { from: r.previousQty, to: r.newQty },
            user: r.adjuster.name,
            attachments: [{ recordType: "StockAdjustment", recordId: r.id, urls: r.imageEvidenceUrls }],
            details: { previousQty: r.previousQty, newQty: r.newQty, reason: r.reason },
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
      },
      include: { changer: { select: { name: true } }, subItem: { select: { subCode: true } } },
      orderBy: { changedAt: "desc" },
    }).then((records) => {
      for (const r of records) {
        // Loan transitions belong to the เบิก/รับคืน rows, both ways — see isDuplicateOfLoanRow.
        if (isDuplicateOfLoanRow(r)) continue;
        // A birth certificate, not a transition: ประกอบชุด logs AVAILABLE → AVAILABLE because
        // the set did not exist a moment earlier. "พร้อมใช้งาน → พร้อมใช้งาน" describes
        // nothing, so the reason — which names the set — becomes the headline.
        const sameStatus = r.previousStatus === r.newStatus;
        // A kit set is retired by ยกเลิกชุด, which hands its durables back. DISPOSED is the
        // right row in the database and the wrong word on the screen: nothing was written off.
        const to = isKit && r.newStatus === "DISPOSED" ? "ยกเลิกชุด" : (STATUS_LABELS[r.newStatus] ?? r.newStatus);
        events.push({
          id: r.id,
          // repairVenue is written by a ส่งซ่อม (and by the edits to one) on both paths — the
          // piece's DAMAGED → UNDER_REPAIR row and the qty booking's same-status audit row —
          // and ALSO by ส่งบำรุงรักษาภายนอก, which is not a repair. The status is what tells
          // them apart, and it has to: REPAIR_SENT is what lib/timeline-cases opens a ซ่อม case
          // from, so typing a maintenance trip that way invents a repair nobody reported.
          type: r.repairVenue && r.newStatus !== "PENDING_MAINTENANCE" ? "REPAIR_SENT" : "STATUS_CHANGE",
          date: r.changedAt,
          delta: null,
          // A qty ส่งซ่อม is the one status row about a count rather than a single piece.
          // It moves no stock (แจ้งชำรุด already did), so it fills จำนวน without a delta.
          qty: r.qty,
          // A repair trip is named by the action, on both paths — the piece's row said
          // "ชำรุด → ซ่อมบำรุง", which is the status machine talking, not what anyone did.
          note: r.repairVenue && r.newStatus === "UNDER_REPAIR"
            ? `ส่งซ่อม${r.repairVenue === "EXTERNAL" ? "ภายนอก" : "ภายใน"}`
            // Same reasoning one line up: name the action, not the status machine's arrow.
            // Same-status here is แก้ข้อมูลส่งบำรุงรักษา — the trip did not leave twice.
            : r.newStatus === "PENDING_MAINTENANCE"
            ? (sameStatus ? "แก้ข้อมูลส่งบำรุงรักษา" : "ส่งบำรุงรักษาภายนอก")
            : sameStatus
              // Legacy qty rows packed the whole line into `reason`
              // ("ส่งซ่อมภายนอก 47 ชิ้น · <repairNote>"); the writer now keeps qty and the note
              // in their own columns, so this only trims what the old rows still carry.
              ? (r.reason?.split(" · ")[0] ?? STATUS_LABELS[r.newStatus] ?? r.newStatus)
              : `${STATUS_LABELS[r.previousStatus] ?? r.previousStatus} → ${to}`,
          // The shop note is the one thing the headline does not already say — venue is part
          // of the action's name now. The damage note and free-text reason stay in `notes`.
          subtitle: r.repairVenue ? (r.repairNote ?? "") : "",
          notes: joinNotes(
            r.damageNote,
            // The headline already is the reason in that case — printing it twice is noise.
            // ส่งบำรุงรักษาภายนอก is the same situation: its reason IS the headline, and the
            // shop note it repeats is already sitting in `subtitle`.
            sameStatus || r.newStatus === "PENDING_MAINTENANCE" ? null : r.reason,
          ),
          user: r.changer.name,
          attachments: [{ recordType: "ItemStatusLog", recordId: r.id, urls: r.imageUrls }],
          details: { previousStatus: r.previousStatus, newStatus: r.newStatus, subItemId: r.subItemId, repairVenue: r.repairVenue },
        });
      }
    })
  );

  {
    queries.push(
      prisma.maintenanceRecord.findMany({
        where: { itemId: id, ...(subItemId ? { subItemId } : {}) },
        include: { performer: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }).then((records) => {
        for (const r of records) {
          // A qty repair writes this record AND the REPAIR_RETURN adjustment that hands the
          // units back, in one transaction — one รับคืนจากซ่อม, told twice. The adjustment is
          // the fuller row (qty, balance, the closing note), so it keeps the line and this
          // record hands over the one thing it alone knows: what the repair cost.
          if (r.adjustmentId) {
            repairJobs.set(r.adjustmentId, { id: r.id, cost: r.cost, attachments: r.attachmentUrls, bookingId: r.repairBookingId });
            continue;
          }
          events.push({
            id: r.id,
            // A CORRECTIVE record only ever exists as the tail of ชำรุด → ส่งซ่อม → รับคืน, so it
            // IS the รับคืนจากซ่อม event — filing it under บำรุงรักษา buried repairs among the
            // scheduled rounds, which are a different thing on a different cadence.
            type: r.type === "CORRECTIVE" ? "REPAIR_RETURN" : "MAINTENANCE",
            // The timeline is a log: rows sit where the action was recorded. `performedAt` is a
            // date the staff member picks (date input → 00:00 UTC → 07:00 on screen), so a repair
            // filed at 14:20 landed seven hours from the ปรับสต๊อก row of the very same
            // transaction. `createdAt` is when it was written, same clock as every other table.
            // performedAt stays the reporting date — the เคสงาน timeline still reads it.
            date: r.createdAt,
            delta: null,
            qty: null,
            note: r.type === "CORRECTIVE" ? "รับคืนจากซ่อม" : MAINT_TYPE_LABELS[r.type] ?? r.type,
            subtitle: MAINT_RESULT_LABELS[r.result] ?? r.result,
            notes: r.issue ?? "",
            user: r.performer.name,
            attachments: [{ recordType: "MaintenanceRecord", recordId: r.id, urls: r.attachmentUrls }],
            // subItemId is what scopes a piece's repair rows into one trip — see groupRepairTrips.
            details: { type: r.type, result: r.result, cost: r.cost, issue: r.issue, subItemId: r.subItemId },
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
            subtitle: "",
            notes: "",
            user: r.changer.name,
            details: { fromLabel: r.fromLabel, toLabel: r.toLabel },
          });
        }
      })
    );
  }

  await Promise.all(queries);

  for (const e of events) {
    const job = repairJobs.get(e.id);
    if (job) {
      e.cost = job.cost;
      if (job.bookingId) closedBy.set(job.bookingId, e.id);
      // The closing paperwork belongs to the row that shows the trip, not to a record the
      // timeline deliberately does not print. It keeps its own group: the files live on the
      // maintenance record, so that is where an edit has to land.
      e.attachments = [
        ...(e.attachments ?? []),
        { recordType: "MaintenanceRecord", recordId: job.id, urls: job.attachments },
      ];
      // …and the หลักฐาน the trip collected on its way out, which lives on the แจ้งชำรุด booking.
      // Staff file ส่งซ่อม → แก้ไข → รับคืน as one job; without this the last row — the one they
      // open when the job is done — shows none of the photos they attached along the way.
      // Null on trips closed before repairBookingId existed; those keep their evidence on the
      // แจ้งชำรุด row and this simply adds nothing.
      const booking = job.bookingId ? adjAttachments.get(job.bookingId) : undefined;
      if (booking && booking.length > 0) {
        e.attachments.push({ recordType: "StockAdjustment", recordId: job.bookingId!, urls: booking });
      }
    }
  }

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

  // `type` takes a comma-separated list as well as a single value, so one เคส in the picker
  // ("ซ่อมแซม") is one request covering แจ้งชำรุด/ส่งซ่อม/รับคืนจากซ่อม.
  const wanted = typeFilter ? new Set(typeFilter.split(",")) : null;
  const loanCaseOf = (e: TimelineEvent) => {
    const key = loanKeyOf.get(e.id);
    if (!key) return null;
    return { key, type: "BORROW" as const, done: (loanOutstanding.get(key) ?? 0) === 0 };
  };

  // จัดกลุ่มก่อนแล้วค่อยกรอง ไม่ใช่ทางกลับกัน: กรองก่อนจะทำให้เลือก "ซ่อมแซม" แล้วได้แถวแบนๆ
  // สามแถวแทนที่จะได้การ์ดเคสที่เล่าเรื่องเดียวกันครบทั้งใบ — ซึ่งคือสิ่งเดียวที่การ์ดมีไว้ทำ.
  // เคสถูกเก็บไว้เมื่อขั้นตอนใดขั้นตอนหนึ่งของมันตรงกับที่เลือก และเก็บไปทั้งใบ.
  const grouped = groupTimelineCases(events, bookings, closedBy, loanCaseOf);

  // สถานะกับคำค้นเป็นคำถามระดับเคส จึงต้องรู้จักเคสทั้งกองก่อนตัด ไม่ใช่แค่ใบที่อยู่หน้าปัจจุบัน.
  // Scoped to this item, so the extra build is a handful of indexed lookups.
  const known = new Map(
    (await listCases({ itemId: id, ...(subItemId ? { subItemId } : {}) })).map((c) => [c.id, c]),
  );
  const caseOf = (u: TimelineCase<TimelineEvent>) => known.get(`${u.caseType}:${u.id}`);

  const isCase = (u: TimelineEvent | TimelineCase<TimelineEvent>): u is TimelineCase<TimelineEvent> => "steps" in u;
  const stepsOf = (u: TimelineEvent | TimelineCase<TimelineEvent>) => (isCase(u) ? u.steps : [u]);

  let units = grouped;
  if (wanted) units = units.filter((u) => stepsOf(u).some((e) => wanted.has(e.type)));
  // ช่วงเวลาวัดที่ขั้นตอนไหนก็ได้ที่ตกในช่วง: เคสที่เปิดปีที่แล้วแต่เพิ่งปิดเมื่อวานคือความเคลื่อนไหว
  // ของสัปดาห์นี้ และนับเป็นของปีที่แล้วด้วยเมื่อกรองปีนั้น
  if (fromDate || toDate)
    units = units.filter((u) =>
      stepsOf(u).some((e) => (!fromDate || e.date >= fromDate) && (!toDate || e.date < toDate)));
  // แถวที่ไม่ใช่เคสไม่มีสถานะให้กรอง — เลือกสถานะแล้วเหลือแต่งาน ไม่ใช่การเคลื่อนไหวของของ
  if (stateFilter) units = units.filter((u) => isCase(u) && caseOf(u)?.state === stateFilter);
  if (q) {
    units = units.filter((u) => {
      const c = isCase(u) ? caseOf(u) : null;
      const hay = [
        c?.code, c?.subject, c?.statusLabel,
        ...stepsOf(u).flatMap((e) => [e.note, e.subtitle, e.notes, e.user]),
      ];
      return hay.some((h) => h?.toLowerCase().includes(q));
    });
  }

  const total = units.length;
  const paged = units.slice(skip, skip + take);

  // Number AND wording come straight off src/lib/cases.ts — the same builder /cases renders.
  // Deriving them here from the grouped events instead would give two answers that happen to
  // agree today: "ปิดงานแล้ว" on one screen and "ซ่อมเสร็จ" on the other is the same case
  // wearing two names, which is exactly what the case model was meant to end.
  for (const t of paged) {
    // ไอดีของเคสยืม/ตั้งใช้ในห้อง ขึ้นต้น BORROW ทั้งคู่ — มันคือแถวในตาราง ไม่ใช่ประเภท
    const c = isCase(t) ? caseOf(t) : null;
    if (!c || !isCase(t)) continue;
    t.code = c.code;
    t.statusLabel = c.statusLabel;
    t.subject = c.subject;
    // ตั้งใช้ในห้อง ถูกจับกลุ่มมาในกอง "ยืม" เพราะมันอยู่ตารางเดียวกัน แต่ป้ายที่คนอ่านต้องเป็น
    // ประเภทจริงของเคส ไม่ใช่ชื่อของตารางที่มันบังเอิญอยู่.
    t.caseType = c.type;
  }

  return { events: paged, page, perPage, total, counts, unit };
}
