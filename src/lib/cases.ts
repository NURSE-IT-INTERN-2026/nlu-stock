// เคส = งานหนึ่งงานที่มีจุดเริ่ม จุดจบ และคนรออยู่ระหว่างนั้น.
//
// ไม่มีตาราง `Case` ในฐานข้อมูล และไม่ต้องมี — ทุกเคสที่ระบบนี้มีถูกเขียนไว้แล้วในตารางที่มีอยู่ เพียงแต่
// กระจายกันคนละที่จนไม่มีใครเห็นว่ามันคืองานเดียวกัน. ไฟล์นี้คือที่ที่ประกอบมันกลับ:
//
//   RC ซ่อมแซม   — ของนับจำนวน: StockAdjustment(DAMAGED_PENDING_REPAIR) หนึ่งแถวคือหนึ่งเคส
//                  ของติดตามรายชิ้น: ลำดับ ItemStatusLog ของชิ้นนั้น ตั้งแต่ →ชำรุด จนถึงงานปิด
//   MC บำรุงรักษา — MaintenanceRecord(PREVENTIVE) หนึ่งแถวคือหนึ่งเคส และเป็นเคสจุดเดียว:
//                  ระบบไม่ได้ "เปิดงานบำรุงไว้ล่วงหน้าแล้วรอทำ" มันบันทึกตอนทำเสร็จแล้ว
//   BR ยืม        — loanGroupId เดียว = การกดยืมหนึ่งครั้ง ซึ่งมีได้หลายพัสดุ
//
// เคสยืมมีสองสถานะซ้อนกันโดยตั้งใจ: สถานะรวมของทั้งเคส (ใช้ในหน้ารายการเคส) กับสถานะรายบรรทัด
// (ใช้ตอนการ์ดไปโผล่ในประวัติของพัสดุชิ้นเดียว — ชามรูปไตที่คืนแล้วต้องอ่านว่าจบ ถึงเคสรวมจะยังค้างชิ้นอื่น).
import { prisma } from "@/lib/prisma";
import { AdjustmentReason, ItemStatus, LoanType, MaintenanceType } from "@/generated/prisma/enums";
import type { AttachRecordType } from "@/lib/attachments";
import { CASE_PREFIX, type CaseType, type CaseState } from "@/lib/case-types";
import { codesFor, sourceKey } from "@/lib/case-codes";
import { USAGE_TYPE_LABELS } from "@/lib/constants";

export { CASE_PREFIX, CASE_TYPE_LABELS } from "@/lib/case-types";
export type { CaseType, CaseState } from "@/lib/case-types";

export type Attach = { recordType: AttachRecordType; recordId: string; urls: string[] };

/**
 * One dot on a case's timeline. `at === null` means the step has not happened yet — it still
 * renders, hollow, because a repair that has been reported but not sent is defined by the step
 * it is missing. `waiting` is the label for the connector BELOW the dot ("รอส่งซ่อม · 3 วัน"):
 * รอส่งซ่อม has no timestamp of its own (it is `repairSentAt IS NULL`), so it is a span between
 * two dots, never a dot.
 */
export type CaseStep = {
  key: string;
  label: string;
  at: Date | null;
  by: string | null;
  detail: string | null;
  cost: number | null;
  attachments: Attach[];
  waiting: string | null;
};

export type CaseSummary = {
  /** Routing key. `<TYPE>:<source row id>` — no Case table, so the source row IS the identity. */
  id: string;
  type: CaseType;
  code: string;
  state: CaseState;
  statusLabel: string;
  /**
   * บรรทัดที่คนอ่านจริง — เคสนี้เรื่องอะไร. รหัสเคสเป็นเลขอ้างอิง ไม่ใช่ชื่อ: "RC-2569-0320"
   * บอกไม่ได้ว่าเกิดอะไรขึ้น และงานซ่อมสิบเคสหน้าตาเหมือนกันหมด.
   *
   * ระบบปั้นเองจากข้อมูลที่มีอยู่ ไม่ให้คนตั้ง — ชื่อที่คนพิมพ์เองจะว่างบ้าง สะกดต่างกันบ้าง แล้ว
   * สุดท้ายก็เชื่อถือไม่ได้. อาการที่แจ้งไว้แล้ว ("ขาโต๊ะหัก ซ่อมเองไม่ได้") ดีกว่าคำกลางๆ อย่าง
   * "ชำรุด/เสียหาย" ซึ่งพูดซ้ำกับประเภทเคสเฉยๆ; คำกลางเป็นแค่ตัวสำรองตอนไม่มีใครเขียนอะไรไว้.
   */
  subject: string;
  title: string;
  itemId: string;
  itemCode: string;
  subCode: string | null;
  qty: number | null;
  unit: string;
  cost: number | null;
  openedAt: Date;
  updatedAt: Date;
  openedBy: string;
};

export type RelatedCase = { id: string; code: string; type: CaseType; note: string };

/**
 * เอกสารต้นทาง — การกดเบิก/ยืมหนึ่งครั้ง (loanGroupId) ซึ่งจ่ายของออกได้หลายรายการพร้อมกัน.
 *
 * เอกสารกับเคสไม่ใช่สิ่งเดียวกัน: ใบเดียวจ่ายชามรูปไตกับแก้วน้ำ แล้วสองอย่างนั้นคืนคนละวัน จบคนละ
 * เวลา — แต่ละบรรทัดจึงมี lifecycle ของตัวเอง และได้เลขเคสของตัวเอง ส่วนใบได้เลข DOC- ของมันเอง.
 *
 * บรรทัดเบิกใช้ (CONSUME) อยู่ในเอกสารด้วย เพราะมันถูกจ่ายออกไปในครั้งเดียวกันจริงๆ แต่ไม่มีเคส
 * ของตัวเอง — ของสิ้นเปลืองออกไปแล้วไม่กลับ ไม่มีอะไรให้ปิด. `caseId` จึงเป็น null บนบรรทัดพวกนั้น.
 */
export type CaseDocument = {
  code: string;
  at: Date;
  by: string;
  lines: {
    caseId: string | null;
    itemId: string;
    itemCode: string;
    name: string;
    subCode: string | null;
    qty: number;
    unit: string;
    kind: string;
    statusLabel: string;
  }[];
};

/**
 * สิ่งที่ทำได้กับเคสนี้ตอนนี้ — มีเฉพาะเคสที่เปิดค้างและมีปุ่มจริงรออยู่.
 *
 * ไม่ได้ทำเป็นระบบ action ทั่วไป: ตอนนี้มีอยู่กรณีเดียว และเคสส่วนใหญ่ปิดผ่านหน้างานของมันเอง
 * (รับคืนจากซ่อม อยู่ที่หน้าซ่อม, รับคืน อยู่ที่หน้ารับคืน) ซึ่งเป็นที่ที่ถูกแล้ว. ตรวจชุดต่างออกไป
 * เพราะมันไม่มีหน้างานของตัวเอง — เดิมต้องไล่หาทีละชุดในแท็บชุดประกอบของพัสดุนั้น.
 */
export type CaseAction =
  | { kind: "KIT_CHECK"; targetId: string; label: string }
  /** targetId = "PIECE|ADJUSTMENT:<recordId>:<itemId>" — the recover route needs all three. */
  | { kind: "RECOVER"; targetId: string; label: string };

export type CaseDetail = CaseSummary & {
  action?: CaseAction | null;
  fields: { label: string; value: string }[];
  steps: CaseStep[];
  document: CaseDocument | null;
  related: RelatedCase[];
  attachments: Attach[];
};

// ชนิดที่ต้องกลับเข้าคลัง. CONSUME ไม่อยู่ในนี้ — เบิกใช้ออกไปแล้วไม่กลับ จึงไม่มีอะไรให้ปิด.
// Mutable on purpose: an `as const` array here is readonly, which Prisma's `in` filter rejects.
const LOAN_KINDS: LoanType[] = [LoanType.BORROW, LoanType.INUSE];

// ── Case codes ────────────────────────────────────────────────────────────────
// เลขมาจากตาราง case_codes จ่ายครั้งเดียวไม่เปลี่ยนอีก — ดูเหตุผลใน src/lib/case-codes.ts.
// ไฟล์นี้รู้แค่ว่าเคสหนึ่งมาจากแถวไหน (`caseSource`) ที่เหลือเป็นเรื่องของตัวจ่ายเลข.

/** เคสไอดีที่ UI ใช้ → แถวต้นทางในรูปที่ตัวจ่ายเลขเข้าใจ (ไม่มีชื่อประเภทติดไปด้วย). */
function caseSourceKey(caseId: string): string {
  const type = caseTypeOf(caseId);
  const row = sourceId(caseId);
  // REPAIR มาได้จากสองตาราง: ใบแจ้งชำรุดของของนับจำนวน กับ log →ชำรุด ของชิ้นที่ติดตามรายชิ้น.
  // แยกด้วย prefix ของ cuid ไม่ได้ จึงให้ตัวเรียกบอกมาแทน — ดู repairSourceKey.
  if (type === "MAINTENANCE") return sourceKey("maint", row);
  if (type === "BORROW" || type === "INUSE") return sourceKey("disp", row);
  if (type === "KIT_CHECK") return sourceKey("ret", row);
  // เคสสูญหายพาชื่อตารางมาในไอดีอยู่แล้ว เพราะมันมาได้จากสองตาราง (log:… / adj:…)
  if (type === "LOST") return row;
  return sourceKey("adj", row); // REPAIR: overridden below where the kind is known
}

const repairKey = (row: string, piece: boolean) => sourceKey(piece ? "log" : "adj", row);

/** Codes for a mixed batch of cases, from the stored table (assigning any that are new). */
export async function attachCodes<T extends { id: string; type: CaseType; openedAt: Date }>(
  cases: T[],
  /** REPAIR cases whose source is a piece's status log rather than a qty booking. */
  pieceIds?: Set<string>,
): Promise<Map<string, string>> {
  const keyOf = (c: T) =>
    c.type === "REPAIR" ? repairKey(sourceId(c.id), !!pieceIds?.has(c.id)) : caseSourceKey(c.id);
  const codes = await codesFor(
    cases.map((c) => ({ sourceKey: keyOf(c), openedAt: c.openedAt, prefix: CASE_PREFIX[c.type] })),
  );
  return new Map(cases.map((c) => [c.id, codes.get(keyOf(c)) ?? ""]));
}

/** DOC-2569-0455 — ใบเบิกก็มีเลขนิ่งของตัวเอง จ่ายจากตารางเดียวกับเลขเคส. */
async function docCode(loanGroupId: string, at: Date): Promise<string> {
  const key = sourceKey("doc", loanGroupId);
  const codes = await codesFor([{ sourceKey: key, openedAt: at, prefix: "DOC" }]);
  return codes.get(key) ?? "";
}

/** ทุกบรรทัดที่ออกไปพร้อมกันในใบเดียว — รวมของสิ้นเปลืองที่ไม่มีเคสของตัวเอง. */
async function documentFor(l: LoanRow): Promise<CaseDocument | null> {
  const key = l.loanGroupId;
  // แถวเก่าที่ไม่มี loanGroupId คือใบของตัวเองใบเดียว ไม่มีอะไรให้เปิดดูเพิ่ม
  if (!key) return null;
  const rows = await prisma.dispenseRecord.findMany({
    where: { loanGroupId: key },
    include: {
      item: { select: itemSelect },
      subItem: { select: { subCode: true } },
      staff: { select: { name: true } },
    },
    orderBy: { dispensedAt: "asc" },
  });
  if (rows.length <= 1) return null;
  return {
    code: await docCode(key, rows[0].dispensedAt),
    at: rows[0].dispensedAt,
    by: rows[0].staff.name,
    lines: rows.map((r) => {
      const outstanding = Math.max(0, r.quantity - r.resolvedQty);
      const consume = r.loanType === LoanType.CONSUME;
      return {
        caseId: consume ? null : `BORROW:${r.id}`,
        itemId: r.item.id,
        itemCode: r.item.code,
        name: r.item.name,
        subCode: r.subItem?.subCode ?? null,
        qty: r.quantity,
        unit: r.item.issueUnit.name,
        kind: consume ? "เบิกใช้" : r.loanType === LoanType.INUSE ? "ตั้งใช้ในห้อง" : "ยืม",
        statusLabel: consume ? "จ่ายออกแล้ว" : outstanding === 0 ? "คืนครบแล้ว" : `ค้าง ${outstanding}`,
      };
    }),
  };
}

export const sourceId = (caseId: string) => caseId.slice(caseId.indexOf(":") + 1);
export const caseTypeOf = (caseId: string) => caseId.slice(0, caseId.indexOf(":")) as CaseType;

// ── Shared bits ───────────────────────────────────────────────────────────────
const days = (from: Date, to: Date = new Date()) =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));

const venueLabel = (v: string | null | undefined) =>
  v === "EXTERNAL" ? "ภายนอก" : v === "INTERNAL" ? "ภายใน" : null;

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ") || null;

const itemSelect = {
  id: true,
  code: true,
  name: true,
  issueUnit: { select: { name: true } },
} as const;

// ── RC: ของนับจำนวน ───────────────────────────────────────────────────────────
// เคสคือ booking แถวเดียว. `repairSentAt` / `recoveredAt` บนแถวนั้นคือความจริงเรื่องสถานะ —
// อ่านจากแถวปิดอย่างเดียวไม่ได้ เพราะ trip เก่าที่เขียนก่อนมี repairBookingId ผูกแถวปิดกลับไม่ได้.
const qtyBookingArgs = {
  where: { reason: AdjustmentReason.DAMAGED_PENDING_REPAIR },
  include: {
    item: { select: itemSelect },
    adjuster: { select: { name: true } },
    closedBy: { include: { performer: { select: { name: true } } } },
    fromReturn: { select: { id: true, dispenseRecordId: true, returnedAt: true } },
  },
} as const;

type QtyBooking = Awaited<ReturnType<typeof prisma.stockAdjustment.findMany<typeof qtyBookingArgs>>>[number];

/**
 * ยกเลิกคำขอชำรุด กับ ปิดด้วยการซ่อม ทั้งคู่ stamp `recoveredAt` แถวเดียวกัน — ต่างกันตรงแถว audit ที่
 * เขียนคู่กันมาใน transaction เดียวกัน (DAMAGE_CANCELLED กับ REPAIR_RETURN, ดู restoreDamagedQty).
 *
 * เดิมโค้ดนี้อ่านว่า "ปิดแล้วแต่ไม่มีงานซ่อมผูกอยู่ = ถูกยกเลิก" ซึ่งพังกับแถวที่เขียนก่อนคอลัมน์
 * repairBookingId จะมี: งานซ่อมที่เสร็จเรียบร้อยไปแสดงเป็น "ยกเลิกคำขอ" ทั้งที่ของกลับเข้าคลังแล้ว —
 * เขียนผลลัพธ์ตรงข้ามกับที่เกิดขึ้นจริง ซึ่งแย่กว่าไม่เขียนอะไรเลย.
 *
 * ตัวที่พิสูจน์การยกเลิกได้จริงคือแถว DAMAGE_CANCELLED ของพัสดุตัวนั้นที่ประทับเวลาพร้อมกัน. ไม่เจอ
 * = ปิดแล้วแต่บอกไม่ได้ว่าปิดทางไหน จึงพูดแค่ว่า "ปิดแล้ว".
 */
export type CancelIndex = Set<string>;

const cancelKey = (itemId: string, at: Date) => `${itemId}|${Math.floor(at.getTime() / 1000)}`;

/** Both stamps are `new Date()` inside one transaction — the same second, or the next one. */
function wasCancelled(index: CancelIndex, itemId: string, recoveredAt: Date | null): boolean {
  if (!recoveredAt) return false;
  const sec = Math.floor(recoveredAt.getTime() / 1000);
  return index.has(`${itemId}|${sec}`) || index.has(`${itemId}|${sec - 1}`) || index.has(`${itemId}|${sec + 1}`);
}

async function loadCancelIndex(itemId?: string): Promise<CancelIndex> {
  const rows = await prisma.stockAdjustment.findMany({
    where: { reason: AdjustmentReason.DAMAGE_CANCELLED, ...(itemId ? { itemId } : {}) },
    select: { itemId: true, adjustedAt: true },
  });
  return new Set(rows.map((r) => cancelKey(r.itemId, r.adjustedAt)));
}

function qtySummary(b: QtyBooking, cancelIndex: CancelIndex): CaseSummary {
  const closer = b.closedBy[0];
  const qty = b.previousQty - b.newQty;
  const cancelled = wasCancelled(cancelIndex, b.itemId, b.recoveredAt);
  const state: CaseState = cancelled ? "CANCELLED" : closer || b.recoveredAt ? "DONE" : "OPEN";
  const statusLabel = cancelled
    ? "ยกเลิกคำขอ"
    : closer
      ? closer.result === "DISPOSED" ? "ตัดจำหน่าย" : "ซ่อมเสร็จ"
      // Closed, but the job that closed it cannot be named — a legacy row. "ปิดแล้ว" is all
      // this knows, and all it should say.
      : b.recoveredAt ? "ปิดแล้ว"
      : b.repairSentAt ? "อยู่ระหว่างซ่อม" : "รอส่งซ่อม";
  return {
    id: `REPAIR:${b.id}`,
    type: "REPAIR",
    code: "",
    state,
    statusLabel,
    subject: b.notes?.trim() || "ชำรุด/เสียหาย",
    title: b.item.name,
    itemId: b.item.id,
    itemCode: b.item.code,
    subCode: null,
    qty,
    unit: b.item.issueUnit.name,
    cost: closer?.cost ?? null,
    openedAt: b.adjustedAt,
    updatedAt: closer?.createdAt ?? b.repairSentAt ?? b.adjustedAt,
    openedBy: b.adjuster.name,
  };
}

// ── RC: ชิ้นที่ติดตามรายชิ้น ───────────────────────────────────────────────────
// ชิ้นหนึ่งมีสถานะเดียว แถวซ่อมของมันจึงเรียงต่อกันเป็นลำดับแน่นอน ไม่ต้องเดาว่าแถวไหนของทริปไหน:
// →ชำรุด เปิด, →ส่งซ่อม อยู่ระหว่างทาง, งาน CORRECTIVE ปิด, ชำรุด→พร้อมใช้งาน คือยกเลิกคำขอ.
type PieceLog = {
  id: string;
  subItemId: string | null;
  previousStatus: ItemStatus;
  newStatus: ItemStatus;
  reason: string | null;
  damageNote: string | null;
  repairVenue: string | null;
  repairNote: string | null;
  qty: number | null;
  imageUrls: string[];
  changedAt: Date;
  changer: { name: string };
  fromReturnId: string | null;
  item: { id: string; code: string; name: string; issueUnit: { name: string } };
  subItem: { subCode: string } | null;
};

type PieceJob = {
  id: string;
  subItemId: string | null;
  result: string;
  cost: number | null;
  issue: string | null;
  description: string | null;
  attachmentUrls: string[];
  createdAt: Date;
  performer: { name: string };
};

export type PieceCase = {
  opener: PieceLog;
  sent: PieceLog[];
  closedByJob: PieceJob | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
};

/** Walk one piece's repair rows oldest-first and cut them into cases. */
export function walkPieceCases(logs: PieceLog[], jobs: PieceJob[]): PieceCase[] {
  const out: PieceCase[] = [];
  const bySub = new Map<string, { logs: PieceLog[]; jobs: PieceJob[] }>();
  for (const l of logs) {
    if (!l.subItemId) continue;
    (bySub.get(l.subItemId) ?? bySub.set(l.subItemId, { logs: [], jobs: [] }).get(l.subItemId)!).logs.push(l);
  }
  for (const j of jobs) {
    if (!j.subItemId) continue;
    const b = bySub.get(j.subItemId);
    if (b) b.jobs.push(j);
  }

  for (const { logs: ls, jobs: js } of bySub.values()) {
    ls.sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
    js.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    // Scoped to this piece. Jobs are matched inside this array and never across pieces —
    // a repair bill for copy C02 must not close the open case on C01.
    const mine: PieceCase[] = [];
    let open: PieceCase | null = null;
    for (const l of ls) {
      if (l.newStatus === ItemStatus.DAMAGED) {
        if (open) mine.push(open);
        open = { opener: l, sent: [], closedByJob: null, cancelledAt: null, cancelledBy: null };
        continue;
      }
      if (!open) continue;
      if (l.newStatus === ItemStatus.UNDER_REPAIR) { open.sent.push(l); continue; }
      // ชำรุด → พร้อมใช้งาน ตรงๆ คือ SUPERADMIN กดยกเลิกคำขอ (ไม่เคยส่งซ่อม)
      if (l.previousStatus === ItemStatus.DAMAGED && l.newStatus === ItemStatus.AVAILABLE) {
        open.cancelledAt = l.changedAt;
        open.cancelledBy = l.changer.name;
        mine.push(open);
        open = null;
      }
    }
    if (open) mine.push(open);
    // Each job closes the newest still-open case that had already started when it was filed.
    for (const j of js) {
      const target = [...mine].reverse().find((c) => !c.closedByJob && !c.cancelledAt && c.opener.changedAt <= j.createdAt);
      if (target) target.closedByJob = j;
    }
    out.push(...mine);
  }
  return out;
}

function pieceSummary(c: PieceCase): CaseSummary {
  const o = c.opener;
  const job = c.closedByJob;
  const state: CaseState = c.cancelledAt ? "CANCELLED" : job ? "DONE" : "OPEN";
  const statusLabel = c.cancelledAt
    ? "ยกเลิกคำขอ"
    : job
      ? job.result === "DISPOSED" ? "ตัดจำหน่าย" : "ซ่อมเสร็จ"
      : c.sent.length ? "อยู่ระหว่างซ่อม" : "รอส่งซ่อม";
  const last = c.sent[c.sent.length - 1];
  return {
    id: `REPAIR:${o.id}`,
    type: "REPAIR",
    code: "",
    state,
    statusLabel,
    subject: o.damageNote?.trim() || o.reason?.trim() || "ชำรุด/เสียหาย",
    title: o.item.name,
    itemId: o.item.id,
    itemCode: o.item.code,
    subCode: o.subItem?.subCode ?? null,
    qty: 1,
    unit: o.item.issueUnit.name,
    cost: job?.cost ?? null,
    openedAt: o.changedAt,
    updatedAt: c.cancelledAt ?? job?.createdAt ?? last?.changedAt ?? o.changedAt,
    openedBy: o.changer.name,
  };
}

// ── MC: บำรุงรักษา ────────────────────────────────────────────────────────────
// เคสจุดเดียว ไม่มีขั้นตอน: ระบบไม่ได้เปิดงานบำรุงไว้ล่วงหน้าแล้วรอทำ มันบันทึกตอนทำเสร็จแล้ว.
// `nextMaintenanceDate` เป็นวันบนพัสดุ ไม่ใช่งานที่ค้างอยู่ จึงไม่กลายเป็นเคสของตัวเอง.
const maintArgs = {
  where: { type: MaintenanceType.PREVENTIVE },
  include: {
    item: { select: itemSelect },
    subItem: { select: { subCode: true } },
    performer: { select: { name: true } },
  },
} as const;

type MaintRow = Awaited<ReturnType<typeof prisma.maintenanceRecord.findMany<typeof maintArgs>>>[number];

function maintSummary(m: MaintRow): CaseSummary {
  return {
    id: `MAINTENANCE:${m.id}`,
    type: "MAINTENANCE",
    code: "",
    state: "DONE",
    // ไม่ปั้น "รอบที่ 2/2569" ขึ้นมา — ระบบไม่ได้นับรอบไว้ที่ไหน เลขที่คำนวณสดจึงไม่มีใครเป็นเจ้าของ
    subject: m.issue?.trim() || m.description?.trim() || "ตรวจบำรุงตามรอบ",
    statusLabel: m.result === "DISPOSED" ? "ตัดจำหน่าย" : m.result === "NEEDS_MORE_REPAIR" ? "ต้องซ่อมต่อ" : "เสร็จสิ้น",
    title: m.item.name,
    itemId: m.item.id,
    itemCode: m.item.code,
    subCode: m.subItem?.subCode ?? null,
    qty: null,
    unit: m.item.issueUnit.name,
    cost: m.cost ?? null,
    openedAt: m.performedAt,
    updatedAt: m.createdAt,
    openedBy: m.performer.name,
  };
}

// ── BR: ยืม ───────────────────────────────────────────────────────────────────
// เคสคือการกดยืมหนึ่งครั้ง (loanGroupId) ซึ่งมีได้หลายพัสดุ. สถานะรวมของเคสตอบว่า "ยืมครั้งนี้จบยัง"
// ส่วนสถานะรายบรรทัดตอบว่า "ชิ้นนี้จบยัง" — สองคำถามคนละคำถาม และหน้าที่ต่างกันคนละหน้า.
const loanArgs = {
  where: { loanType: { in: LOAN_KINDS } },
  include: {
    item: { select: itemSelect },
    subItem: { select: { subCode: true } },
    staff: { select: { name: true } },
    location: { select: { building: true, room: true } },
    returns: { include: { returner: { select: { name: true } } }, orderBy: { returnedAt: "asc" } },
  },
} as const;

type LoanRow = Awaited<ReturnType<typeof prisma.dispenseRecord.findMany<typeof loanArgs>>>[number];

const loanType = (l: LoanRow): CaseType => (l.loanType === LoanType.INUSE ? "INUSE" : "BORROW");

/** ตั้งใช้ในห้องไม่มีกำหนดคืน — อายุการตั้งจึงเป็นตัวเดียวที่บอกได้ว่ามันค้างนานผิดปกติหรือยัง. */
const AGEING_DAYS = 180;

function loanSummary(l: LoanRow): CaseSummary {
  const outstanding = Math.max(0, l.quantity - l.resolvedQty);
  const overdue = !!l.dueAt && l.dueAt < new Date() && outstanding > 0;
  const lastReturn = l.returns.reduce<Date | null>(
    (max, r) => (!max || r.returnedAt > max ? r.returnedAt : max), null);
  const inRoom = l.loanType === LoanType.INUSE;
  const age = days(l.dispensedAt);
  return {
    // ไอดียังขึ้นต้น BORROW: มันคือ "แถวไหนในตาราง dispense" ไม่ใช่ "ประเภทเคสอะไร" — ประเภท
    // เปลี่ยนได้ แถวต้นทางเปลี่ยนไม่ได้ และเลขเคสก็ผูกกับแถว ไม่ได้ผูกกับประเภท.
    id: `BORROW:${l.id}`,
    type: loanType(l),
    code: "",
    subject: join(
      l.usageType ? USAGE_TYPE_LABELS[l.usageType] : null,
      l.usageNote?.trim() || l.notes?.trim() || null,
    ) ?? (inRoom ? "ตั้งใช้ในห้อง" : "ยืมใช้งาน"),
    state: outstanding > 0 ? "OPEN" : "DONE",
    statusLabel: outstanding === 0
      ? (inRoom ? "คืนเข้าพัสดุแล้ว" : "คืนครบแล้ว")
      // เกินกำหนดใช้กับ ยืม เท่านั้น. ตั้งใช้ในห้องไม่มีกำหนดให้เกิน จึงวัดด้วยอายุแทน —
      // ไม่งั้นของที่ตั้งค้างมาปีนึงกับของที่เพิ่งตั้งเมื่อวานอ่านเหมือนกันเป๊ะ.
      : inRoom ? (age >= AGEING_DAYS ? `ตั้งใช้มา ${age} วัน` : "ตั้งใช้ในห้อง")
      : overdue ? "เกินกำหนด" : "กำลังยืม",
    title: l.item.name,
    itemId: l.item.id,
    itemCode: l.item.code,
    subCode: l.subItem?.subCode ?? null,
    qty: l.quantity,
    unit: l.item.issueUnit.name,
    cost: null,
    openedAt: l.dispensedAt,
    updatedAt: lastReturn ?? l.dispensedAt,
    openedBy: l.staff.name,
  };
}

// ── Loading ───────────────────────────────────────────────────────────────────
// ponytail: repair and maintenance rows are loaded whole and merged in memory — both tables are
// small (a stock room repairs things in the dozens per year) and merging three shapes in SQL
// means a UNION ALL nobody will want to edit. Loans are the one table that grows fast, so its
// filters go to the database. Revisit if repairs ever reach ~10k rows.
const pieceLogSelect = {
  id: true, subItemId: true, previousStatus: true, newStatus: true, reason: true,
  damageNote: true, repairVenue: true, repairNote: true, qty: true, imageUrls: true, changedAt: true,
  fromReturnId: true,
  changer: { select: { name: true } },
  item: { select: itemSelect },
  subItem: { select: { subCode: true } },
} as const;

const pieceJobSelect = {
  id: true, subItemId: true, result: true, cost: true, issue: true, description: true,
  attachmentUrls: true, createdAt: true,
  performer: { select: { name: true } },
} as const;

async function loadPieceCases(itemId?: string): Promise<PieceCase[]> {
  const where = itemId ? { itemId } : {};
  const [logs, jobs] = await Promise.all([
    prisma.itemStatusLog.findMany({
      where: {
        ...where,
        subItemId: { not: null },
        OR: [
          { newStatus: { in: [ItemStatus.DAMAGED, ItemStatus.UNDER_REPAIR] } },
          { previousStatus: ItemStatus.DAMAGED, newStatus: ItemStatus.AVAILABLE },
        ],
      },
      select: pieceLogSelect,
    }),
    prisma.maintenanceRecord.findMany({
      where: { ...where, type: MaintenanceType.CORRECTIVE, subItemId: { not: null } },
      select: pieceJobSelect,
    }),
  ]);
  return walkPieceCases(logs as PieceLog[], jobs as PieceJob[]);
}

const KIT_PROFILE = { item: { category: { profile: { code: "KIT" } } } } as const;

async function loadKitChecks(itemId?: string, subItemId?: string): Promise<KitCheckCase[]> {
  const scope = { ...(itemId ? { itemId } : {}), ...(subItemId ? { subItemId } : {}) };
  const [returns, closers] = await Promise.all([
    prisma.returnRecord.findMany({
      where: { ...scope, subItemId: subItemId ?? { not: null }, subItem: KIT_PROFILE },
      select: {
        id: true, subItemId: true, returnedAt: true,
        returner: { select: { name: true } },
        item: { select: itemSelect },
        subItem: { select: { subCode: true } },
      },
    }),
    prisma.itemStatusLog.findMany({
      where: {
        ...scope,
        subItemId: subItemId ?? { not: null },
        OR: [{ reason: { startsWith: "ตรวจชุด" } }, { reason: { startsWith: "ยกเลิกชุด" } }],
      },
      select: {
        id: true, subItemId: true, changedAt: true, reason: true, newStatus: true,
        changer: { select: { name: true } },
      },
    }),
  ]);
  return walkKitChecks(returns as KitReturnRow[], closers as KitCloseRow[]);
}

export type CaseFilter = {
  type?: CaseType;
  state?: CaseState;
  itemId?: string;
  /** Scope to one tracked copy. Qty repairs drop out — they are about a count, not a piece. */
  subItemId?: string;
  from?: Date;
  to?: Date;
  q?: string;
};

export async function listCases(f: CaseFilter = {}): Promise<CaseSummary[]> {
  // ยืม กับ ตั้งใช้ในห้อง อ่านจากตารางเดียวกัน แยกกันตอนสรุป — โหลดทั้งคู่เมื่อถามหาอย่างใดอย่างหนึ่ง
  const want = (t: CaseType) => !f.type || f.type === t;
  const wantLoans = want("BORROW") || want("INUSE");
  const itemWhere = f.itemId ? { itemId: f.itemId } : {};
  const subWhere = f.subItemId ? { subItemId: f.subItemId } : {};

  const [cancelIndex, qty, pieces, maints, kitChecks, losses, loans] = await Promise.all([
    want("REPAIR") ? loadCancelIndex(f.itemId) : new Set<string>(),
    // A qty booking is about N units of an item, never about one copy — scoping to a copy
    // excludes it rather than showing a case that is not about the thing on screen.
    want("REPAIR") && !f.subItemId
      ? prisma.stockAdjustment.findMany({ ...qtyBookingArgs, where: { ...qtyBookingArgs.where, ...itemWhere } })
      : [],
    want("REPAIR") ? loadPieceCases(f.itemId) : [],
    want("MAINTENANCE")
      ? prisma.maintenanceRecord.findMany({ ...maintArgs, where: { ...maintArgs.where, ...itemWhere, ...subWhere } })
      : [],
    want("KIT_CHECK") ? loadKitChecks(f.itemId, f.subItemId) : [],
    want("LOST") ? loadLostCases(f.itemId, f.subItemId) : [],
    wantLoans
      ? prisma.dispenseRecord.findMany({
          ...loanArgs,
          where: {
            ...loanArgs.where,
            ...itemWhere,
            ...subWhere,
            ...(f.from || f.to ? { dispensedAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) } } : {}),
          },
        })
      : [],
  ]);

  const shownPieces = pieces.filter((c) => !f.subItemId || c.opener.subItemId === f.subItemId);

  let cases: CaseSummary[] = [
    ...qty.map((b) => qtySummary(b, cancelIndex)),
    ...shownPieces.map(pieceSummary),
    ...maints.map(maintSummary),
    ...kitChecks.map(kitCheckSummary),
    ...losses.map(lostSummary),
    ...loans.map(loanSummary).filter((c) => want(c.type)),
  ];

  if (f.state) cases = cases.filter((c) => c.state === f.state);
  if (f.from) cases = cases.filter((c) => c.openedAt >= f.from!);
  if (f.to) cases = cases.filter((c) => c.openedAt < f.to!);
  // Which REPAIR cases are a piece's status log rather than a qty booking — the two live in
  // different tables and the code table keys on the row, not on the case type.
  const pieceIds = new Set(shownPieces.map((c) => `REPAIR:${c.opener.id}`));

  cases.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  // Numbering first, then search: RC-2569-0142 is the one thing people will paste into the box,
  // and it does not exist until the codes are attached.
  const codes = await attachCodes(cases, pieceIds);
  const withCodes = cases.map((c) => ({ ...c, code: codes.get(c.id) ?? "" }));
  if (!f.q) return withCodes;
  const q = f.q.trim().toLowerCase();
  return withCodes.filter((c) =>
    c.code.toLowerCase().includes(q) ||
    c.title.toLowerCase().includes(q) ||
    c.itemCode.toLowerCase().includes(q) ||
    c.openedBy.toLowerCase().includes(q));
}

// ── Detail ────────────────────────────────────────────────────────────────────
const step = (s: Partial<CaseStep> & { key: string; label: string }): CaseStep => ({
  at: null, by: null, detail: null, cost: null, attachments: [], waiting: null, ...s,
});

/** The ส่งซ่อม audit rows of a qty booking. They carry no FK back to it — see repair-trips.ts. */
async function qtySentLogs(b: QtyBooking): Promise<PieceLog[]> {
  if (!b.repairSentAt) return [];
  const qty = b.previousQty - b.newQty;
  const rows = (await prisma.itemStatusLog.findMany({
    where: {
      itemId: b.itemId,
      subItemId: null,
      repairVenue: { not: null },
      changedAt: { gte: b.adjustedAt, ...(b.recoveredAt ? { lte: b.recoveredAt } : {}) },
    },
    select: pieceLogSelect,
    orderBy: { changedAt: "asc" },
  })) as PieceLog[];
  // Two bookings open at once with the same count cannot be told apart from these rows, and a
  // step shown under the wrong case is worse than a step not shown at all. `qty` is what
  // separates them when it can; a single candidate in the window needs no separating.
  const sameQty = rows.filter((r) => r.qty === qty);
  return sameQty.length ? sameQty : rows.length === 1 ? rows : [];
}

function qtySteps(b: QtyBooking, sent: PieceLog[], cancelIndex: CancelIndex): CaseStep[] {
  const closer = b.closedBy[0];
  const qty = b.previousQty - b.newQty;
  const steps: CaseStep[] = [
    step({
      key: "reported",
      label: "แจ้งชำรุด",
      at: b.adjustedAt,
      by: b.adjuster.name,
      detail: join(`${qty} ${b.item.issueUnit.name}`, b.notes),
      attachments: [{ recordType: "StockAdjustment", recordId: b.id, urls: b.imageEvidenceUrls }],
      // รอส่งซ่อม ไม่มี timestamp ของตัวเอง (มันคือ repairSentAt = null) จึงเป็นช่วงบนเส้นเชื่อม
      // ไม่ใช่จุด — เขียนเป็นจุดเมื่อไหร่ก็ต้องกุเวลาให้มันเมื่อนั้น.
      waiting: b.repairSentAt
        ? `รอส่งซ่อม · ${days(b.adjustedAt, b.repairSentAt)} วัน`
        : b.recoveredAt ? null : `รอส่งซ่อม · ${days(b.adjustedAt)} วัน แล้ว`,
    }),
  ];

  if (b.repairSentAt) {
    const first = sent[0];
    steps.push(step({
      key: "sent",
      label: "ส่งซ่อม",
      at: b.repairSentAt,
      by: first?.changer.name ?? null,
      detail: join(venueLabel(b.repairVenue), b.repairNote),
      attachments: first ? [{ recordType: "ItemStatusLog", recordId: first.id, urls: first.imageUrls }] : [],
    }));
    for (const edit of sent.slice(1)) {
      steps.push(step({
        key: `edit:${edit.id}`,
        label: "แก้ข้อมูลส่งซ่อม",
        at: edit.changedAt,
        by: edit.changer.name,
        detail: join(edit.reason, venueLabel(edit.repairVenue), edit.repairNote),
        attachments: [{ recordType: "ItemStatusLog", recordId: edit.id, urls: edit.imageUrls }],
      }));
    }
  } else if (!b.recoveredAt) {
    steps.push(step({ key: "sent", label: "ส่งซ่อม" }));
  }

  if (closer) {
    steps.push(step({
      key: "closed",
      label: closer.result === "DISPOSED" ? "ตัดจำหน่าย" : "รับคืนจากซ่อม",
      at: closer.createdAt,
      by: closer.performer.name,
      detail: closer.description ?? closer.issue,
      cost: closer.cost,
      attachments: [{ recordType: "MaintenanceRecord", recordId: closer.id, urls: closer.attachmentUrls }],
    }));
  } else if (b.recoveredAt) {
    // Same rule as the status pill: only claim the cancel door when a DAMAGE_CANCELLED row
    // proves it. Otherwise the booking closed and this is all that can honestly be said.
    steps.push(step({
      key: "closed",
      label: wasCancelled(cancelIndex, b.itemId, b.recoveredAt) ? "ยกเลิกคำขอชำรุด" : "ปิดเคส",
      at: b.recoveredAt,
      detail: wasCancelled(cancelIndex, b.itemId, b.recoveredAt)
        ? null
        : "บันทึกก่อนระบบเชื่อมงานซ่อมเข้ากับใบแจ้ง — แถวรับคืนจากซ่อมแสดงแยกอยู่ในไทม์ไลน์",
    }));
  } else {
    steps.push(step({ key: "closed", label: "รับคืนจากซ่อม" }));
  }
  return steps;
}

function pieceSteps(c: PieceCase): CaseStep[] {
  const o = c.opener;
  const firstSent = c.sent[0];
  const steps: CaseStep[] = [
    step({
      key: "reported",
      label: "แจ้งชำรุด",
      at: o.changedAt,
      by: o.changer.name,
      detail: join(o.damageNote, o.reason),
      attachments: [{ recordType: "ItemStatusLog", recordId: o.id, urls: o.imageUrls }],
      waiting: firstSent
        ? `รอส่งซ่อม · ${days(o.changedAt, firstSent.changedAt)} วัน`
        : c.cancelledAt ? null : `รอส่งซ่อม · ${days(o.changedAt)} วัน แล้ว`,
    }),
  ];

  if (firstSent) {
    steps.push(step({
      key: "sent",
      label: "ส่งซ่อม",
      at: firstSent.changedAt,
      by: firstSent.changer.name,
      detail: join(venueLabel(firstSent.repairVenue), firstSent.repairNote),
      attachments: [{ recordType: "ItemStatusLog", recordId: firstSent.id, urls: firstSent.imageUrls }],
    }));
    for (const edit of c.sent.slice(1)) {
      steps.push(step({
        key: `edit:${edit.id}`,
        label: "แก้ข้อมูลส่งซ่อม",
        at: edit.changedAt,
        by: edit.changer.name,
        detail: join(edit.reason, venueLabel(edit.repairVenue), edit.repairNote),
        attachments: [{ recordType: "ItemStatusLog", recordId: edit.id, urls: edit.imageUrls }],
      }));
    }
  } else if (!c.cancelledAt) {
    steps.push(step({ key: "sent", label: "ส่งซ่อม" }));
  }

  const job = c.closedByJob;
  if (job) {
    steps.push(step({
      key: "closed",
      label: job.result === "DISPOSED" ? "ตัดจำหน่าย" : "ซ่อมเสร็จ พร้อมใช้งาน",
      at: job.createdAt,
      by: job.performer.name,
      detail: join(job.issue, job.description),
      cost: job.cost,
      attachments: [{ recordType: "MaintenanceRecord", recordId: job.id, urls: job.attachmentUrls }],
    }));
  } else if (c.cancelledAt) {
    steps.push(step({ key: "cancelled", label: "ยกเลิกคำขอชำรุด", at: c.cancelledAt, by: c.cancelledBy }));
  } else {
    steps.push(step({ key: "closed", label: "รับคืนจากซ่อม" }));
  }
  return steps;
}

function loanSteps(l: LoanRow): CaseStep[] {
  const first = l;
  const outstanding = Math.max(0, l.quantity - l.resolvedQty);
  const steps: CaseStep[] = [
    step({
      key: "out",
      label: first.loanType === LoanType.INUSE ? "ตั้งใช้ในห้อง" : "ยืมออก",
      at: first.dispensedAt,
      by: first.staff.name,
      detail: join(
        `${l.quantity} ${l.item.issueUnit.name}`,
        first.dueAt ? `กำหนดคืน ${first.dueAt.toLocaleDateString("th-TH")}` : null,
        first.usageNote,
      ),
    }),
  ];
  const rets = [...l.returns].sort((a, b) => a.returnedAt.getTime() - b.returnedAt.getTime());
  for (const r of rets) {
    steps.push(step({
      key: `ret:${r.id}`,
      label: r.condition === "AVAILABLE" ? "รับคืน" : `รับคืน (${r.condition === "DAMAGED" ? "ชำรุด" : "สูญหาย"})`,
      at: r.returnedAt,
      by: r.returner.name,
      detail: join(`${r.quantity} ${l.item.issueUnit.name}`, r.notes),
    }));
  }
  if (outstanding > 0) {
    const due = l.dueAt;
    steps.push(step({
      key: "await",
      label: l.loanType === LoanType.INUSE ? "ยังตั้งใช้อยู่" : "รอรับคืน",
      detail: join(
        `${outstanding} ${l.item.issueUnit.name}`,
        l.loanType === LoanType.INUSE
          ? `ตั้งใช้มาแล้ว ${days(l.dispensedAt)} วัน`
          : due && due < new Date() ? `เกินกำหนด ${days(due)} วัน` : null,
      ),
    }));
  }
  return steps;
}

/** The BR this repair came out of, when the damage was found on the way back in. */
async function relatedForReturn(returnId: string | null): Promise<RelatedCase[]> {
  if (!returnId) return [];
  const ret = await prisma.returnRecord.findUnique({
    where: { id: returnId },
    select: { dispenseRecord: { select: { id: true, loanGroupId: true, dispensedAt: true, staff: { select: { name: true } } } } },
  });
  const d = ret?.dispenseRecord;
  if (!d) return [];
  const id = `BORROW:${d.loanGroupId ?? d.id}`;
  const codes = await attachCodes([{ id, type: "BORROW" as const, openedAt: d.dispensedAt }]);
  return [{ id, code: codes.get(id) ?? "", type: "BORROW", note: `ของพังตอนคืนจากการยืมนี้ · ${d.staff.name}` }];
}

/** Repairs opened by any of this loan's returns — the other direction of the same link. */
async function relatedForLoan(lines: LoanRow[]): Promise<RelatedCase[]> {
  const returnIds = lines.flatMap((l) => l.returns.map((r) => r.id));
  if (!returnIds.length) return [];
  const [adjs, logs] = await Promise.all([
    prisma.stockAdjustment.findMany({
      where: { fromReturnId: { in: returnIds }, reason: AdjustmentReason.DAMAGED_PENDING_REPAIR },
      select: { id: true, adjustedAt: true, item: { select: { name: true } } },
    }),
    prisma.itemStatusLog.findMany({
      where: { fromReturnId: { in: returnIds }, newStatus: ItemStatus.DAMAGED },
      select: { id: true, changedAt: true, item: { select: { name: true } } },
    }),
  ]);
  const raw = [
    ...adjs.map((a) => ({ id: `REPAIR:${a.id}`, openedAt: a.adjustedAt, name: a.item.name })),
    ...logs.map((l) => ({ id: `REPAIR:${l.id}`, openedAt: l.changedAt, name: l.item.name })),
  ];
  // The status-log half are piece repairs; the adjustment half are qty bookings.
  const pieceIds = new Set(logs.map((l) => `REPAIR:${l.id}`));
  const codes = await attachCodes(raw.map((r) => ({ id: r.id, type: "REPAIR" as const, openedAt: r.openedAt })), pieceIds);
  return raw.map((r) => ({ id: r.id, code: codes.get(r.id) ?? "", type: "REPAIR" as const, note: `เปิดจากการคืนครั้งนี้ · ${r.name}` }));
}

export async function getCase(caseId: string): Promise<CaseDetail | null> {
  const type = caseTypeOf(caseId);
  const src = sourceId(caseId);

  const finish = async (
    summary: CaseSummary,
    steps: CaseStep[],
    fields: { label: string; value: string }[],
    document: CaseDocument | null,
    related: RelatedCase[],
    fromPieceLog = false,
    action: CaseAction | null = null,
  ): Promise<CaseDetail> => {
    const codes = await attachCodes([summary], fromPieceLog ? new Set([summary.id]) : undefined);
    return {
      ...summary,
      code: codes.get(summary.id) ?? "",
      steps,
      fields,
      document,
      related,
      action,
      attachments: steps.flatMap((s) => s.attachments).filter((a) => a.urls.length > 0),
    };
  };

  if (type === "MAINTENANCE") {
    const m = await prisma.maintenanceRecord.findUnique({ ...maintArgs, where: { id: src } });
    if (!m || m.type !== MaintenanceType.PREVENTIVE) return null;
    const s = maintSummary(m);
    return finish(
      s,
      [step({
        key: "done",
        label: "บำรุงรักษา",
        at: m.performedAt,
        by: m.performer.name,
        detail: join(m.issue, m.description),
        cost: m.cost,
        attachments: [{ recordType: "MaintenanceRecord", recordId: m.id, urls: m.attachmentUrls }],
      })],
      [
        { label: "รายการพัสดุ", value: m.item.name },
        { label: "รหัสพัสดุ", value: m.item.code },
        ...(m.subItem ? [{ label: "รหัสย่อย", value: m.subItem.subCode }] : []),
        { label: "วันที่บำรุง", value: m.performedAt.toLocaleDateString("th-TH") },
        { label: "ผู้ดำเนินการ", value: m.performer.name },
        ...(m.nextMaintenanceAt ? [{ label: "รอบถัดไป", value: m.nextMaintenanceAt.toLocaleDateString("th-TH") }] : []),
        ...(m.cost != null ? [{ label: "ค่าใช้จ่าย", value: `฿${m.cost.toLocaleString("th-TH")}` }] : []),
      ],
      null,
      [],
    );
  }

  if (type === "BORROW" || type === "INUSE") {
    const l = await prisma.dispenseRecord.findFirst({ ...loanArgs, where: { ...loanArgs.where, id: src } });
    if (!l) return null;
    const s = loanSummary(l);
    const place = l.location ? [l.location.building, l.location.room].filter(Boolean).join(" ") : null;
    const [document, related] = await Promise.all([documentFor(l), relatedForLoan([l])]);
    return finish(
      s,
      loanSteps(l),
      [
        { label: "รายการพัสดุ", value: l.item.name },
        { label: "รหัสพัสดุ", value: l.item.code + (l.subItem ? `-${l.subItem.subCode}` : "") },
        { label: "จำนวน", value: `${l.quantity} ${l.item.issueUnit.name}` },
        { label: "ประเภทการยืม", value: l.loanType === LoanType.INUSE ? "ตั้งใช้ในห้อง" : "ยืม" },
        { label: "ผู้ยืม / ผู้เบิก", value: l.staff.name },
        { label: "วันที่ยืม", value: l.dispensedAt.toLocaleDateString("th-TH") },
        ...(l.dueAt ? [{ label: "กำหนดคืน", value: l.dueAt.toLocaleDateString("th-TH") }] : []),
        ...(l.usageNote ? [{ label: "วัตถุประสงค์", value: l.usageNote }] : []),
        ...(place ? [{ label: "สถานที่", value: place }] : []),
      ],
      document,
      related,
    );
  }

  if (type === "LOST") {
    const kind = src.startsWith("adj:") ? "ADJUSTMENT" : "PIECE";
    const rowId = src.slice(src.indexOf(":") + 1);
    const source = kind === "PIECE"
      ? await prisma.itemStatusLog.findUnique({ where: { id: rowId }, select: { itemId: true, subItemId: true } })
      : await prisma.stockAdjustment.findUnique({ where: { id: rowId }, select: { itemId: true } });
    if (!source) return null;
    const all = await loadLostCases(source.itemId);
    const l = all.find((x) => x.id === rowId && x.kind === kind);
    if (!l) return null;
    const s = lostSummary(l);
    const recovered = !!l.recoveredAt;
    return finish(
      s,
      lostSteps(l),
      [
        { label: "รายการพัสดุ", value: l.itemName },
        { label: "รหัสพัสดุ", value: l.itemCode + (l.subCode ? `-${l.subCode}` : "") },
        { label: "จำนวนที่หาย", value: `${l.qty} ${l.unit}` },
        { label: "แจ้งเมื่อ", value: l.at.toLocaleDateString("th-TH") },
        { label: "ผู้แจ้ง", value: l.by },
        ...(recovered
          ? [{ label: "เรียกคืนเมื่อ", value: l.recoveredAt!.toLocaleDateString("th-TH") }]
          : l.backInService
            ? [{ label: "การเรียกคืน", value: "ไม่พบประวัติ — ของกลับมาใช้งานแล้วแต่ไม่มีบันทึกว่าใครเรียกคืน เมื่อไหร่" }]
            : [{ label: "สถานะ", value: `ยังหาไม่พบ ${days(l.at)} วัน` }]),
      ],
      null,
      await relatedForReturn(l.fromReturnId),
      false,
      recovered || l.backInService
        ? null
        : { kind: "RECOVER", targetId: `${l.kind}:${l.id}:${l.itemId}`, label: "เรียกคืน" },
    );
  }

  if (type === "KIT_CHECK") {
    const opener = await prisma.returnRecord.findUnique({ where: { id: src }, select: { subItemId: true, itemId: true } });
    if (!opener?.subItemId) return null;
    const all = await loadKitChecks(opener.itemId, opener.subItemId);
    const k = all.find((x) => x.opener.id === src);
    if (!k) return null;
    const s = kitCheckSummary(k);
    return finish(
      s,
      kitCheckSteps(k),
      [
        { label: "ชุดอุปกรณ์", value: k.opener.item.name },
        { label: "รหัสชุด", value: `${k.opener.item.code}-${k.opener.subItem?.subCode ?? "?"}` },
        { label: "คืนเมื่อ", value: k.opener.returnedAt.toLocaleDateString("th-TH") },
        { label: "ผู้รับคืน", value: k.opener.returner.name },
        ...(k.closer
          ? [
              { label: k.cancelled ? "ยกเลิกเมื่อ" : "ตรวจเมื่อ", value: k.closer.changedAt.toLocaleDateString("th-TH") },
              { label: "ผู้ดำเนินการ", value: k.closer.changer.name },
              ...(k.closer.reason ? [{ label: "บันทึก", value: k.closer.reason }] : []),
            ]
          : [{ label: "สถานะ", value: `รอตรวจมาแล้ว ${days(k.opener.returnedAt)} วัน — ยืมไม่ได้จนกว่าจะตรวจ` }]),
      ],
      null,
      [],
      false,
      k.closer ? null : { kind: "KIT_CHECK", targetId: k.opener.subItemId!, label: "ยืนยันตรวจชุด" },
    );
  }

  // REPAIR — the source row is either a qty booking or a piece's →ชำรุด log.
  const booking = await prisma.stockAdjustment.findUnique({ ...qtyBookingArgs, where: { id: src } });
  if (booking && booking.reason === AdjustmentReason.DAMAGED_PENDING_REPAIR) {
    const [sent, cancelIndex] = await Promise.all([qtySentLogs(booking), loadCancelIndex(booking.itemId)]);
    const s = qtySummary(booking, cancelIndex);
    const closer = booking.closedBy[0];
    return finish(
      s,
      qtySteps(booking, sent, cancelIndex),
      [
        { label: "รายการพัสดุ", value: booking.item.name },
        { label: "รหัสพัสดุ", value: booking.item.code },
        { label: "จำนวน", value: `${booking.previousQty - booking.newQty} ${booking.item.issueUnit.name}` },
        { label: "ผู้แจ้ง", value: booking.adjuster.name },
        ...(booking.notes ? [{ label: "อาการที่แจ้ง", value: booking.notes }] : []),
        ...(booking.repairVenue ? [{ label: "ที่ซ่อม", value: venueLabel(booking.repairVenue) ?? "—" }] : []),
        ...(booking.repairNote ? [{ label: "หมายเหตุร้าน/ช่าง", value: booking.repairNote }] : []),
        ...(closer?.cost != null ? [{ label: "ค่าซ่อม", value: `฿${closer.cost.toLocaleString("th-TH")}` }] : []),
      ],
      null,
      await relatedForReturn(booking.fromReturnId),
    );
  }

  const opener = (await prisma.itemStatusLog.findUnique({ where: { id: src }, select: pieceLogSelect })) as PieceLog | null;
  if (!opener || opener.newStatus !== ItemStatus.DAMAGED || !opener.subItemId) return null;
  const all = await loadPieceCases(opener.item.id);
  const c = all.find((x) => x.opener.id === src);
  if (!c) return null;
  const s = pieceSummary(c);
  const firstSent = c.sent[0];
  return finish(
    s,
    pieceSteps(c),
    [
      { label: "รายการพัสดุ", value: c.opener.item.name },
      { label: "รหัสพัสดุ", value: c.opener.item.code },
      ...(c.opener.subItem ? [{ label: "รหัสย่อย", value: c.opener.subItem.subCode }] : []),
      { label: "ผู้แจ้ง", value: c.opener.changer.name },
      ...(c.opener.damageNote ? [{ label: "อาการที่แจ้ง", value: c.opener.damageNote }] : []),
      ...(firstSent?.repairVenue ? [{ label: "ที่ซ่อม", value: venueLabel(firstSent.repairVenue) ?? "—" }] : []),
      ...(firstSent?.repairNote ? [{ label: "หมายเหตุร้าน/ช่าง", value: firstSent.repairNote }] : []),
      ...(c.closedByJob?.cost != null ? [{ label: "ค่าซ่อม", value: `฿${c.closedByJob.cost.toLocaleString("th-TH")}` }] : []),
    ],
    null,
    await relatedForReturn(c.opener.fromReturnId),
    true,
  );
}

// ── KC: ตรวจชุด ───────────────────────────────────────────────────────────────
// ชุดอุปกรณ์กลับมาแล้วยืมต่อไม่ได้จนกว่าจะมีคนเปิดกล่องนับของ — `SubItem.needsCheck` เป็นประตูจริง
// ที่ api/dispense ปิดไว้ และ lib/stock ไม่นับชุดที่รอตรวจเป็นของพร้อมใช้ด้วยซ้ำ. นั่นคือ "มีคน
// ต้องลงมือ" ครบตามนิยามเคส แต่เดิมมันมองเห็นได้ทางเดียว: ไล่ดูทีละชุดในแท็บชุดประกอบ.
//
// เปิดตอน "คืน" ไม่ใช่ตอน "ยืมออก" ทั้งที่ธง needsCheck ถูกยกตอนออก เพราะเคสที่เปิดค้างต้องแปลว่า
// "มีกล่องวางอยู่ตรงหน้าเจ้าหน้าที่ รอเปิดตรวจ" — ชุดที่ยังอยู่กับผู้ยืมไม่ใช่งานของใครทั้งนั้น.
//
// ชุดหนึ่งชุดมีสถานะเดียว รอบการยืม-คืน-ตรวจ จึงเรียงต่อกันเป็นลำดับแน่นอน ไม่ต้องเดาว่าการตรวจครั้ง
// ไหนปิดการคืนครั้งไหน — เหมือนเคสซ่อมของชิ้นที่ติดตามรายชิ้น.
type KitReturnRow = {
  id: string;
  subItemId: string | null;
  returnedAt: Date;
  returner: { name: string };
  item: { id: string; code: string; name: string; issueUnit: { name: string } };
  subItem: { subCode: string } | null;
};

type KitCloseRow = {
  id: string;
  subItemId: string | null;
  changedAt: Date;
  reason: string | null;
  changer: { name: string };
  newStatus: ItemStatus;
};

export type KitCheckCase = {
  opener: KitReturnRow;
  closer: KitCloseRow | null;
  /** ยกเลิกชุด ปิดเคสด้วย แต่ไม่ใช่ "ตรวจแล้ว" — กล่องไม่ได้ถูกเปิดนับ มันถูกเลิกใช้. */
  cancelled: boolean;
};

/** Walk one set's คืน/ตรวจ rows oldest-first and cut them into cases. */
export function walkKitChecks(returns: KitReturnRow[], closers: KitCloseRow[]): KitCheckCase[] {
  const bySet = new Map<string, { rets: KitReturnRow[]; closes: KitCloseRow[] }>();
  const bucket = (sid: string) =>
    bySet.get(sid) ?? bySet.set(sid, { rets: [], closes: [] }).get(sid)!;
  for (const r of returns) if (r.subItemId) bucket(r.subItemId).rets.push(r);
  for (const c of closers) if (c.subItemId && bySet.has(c.subItemId)) bucket(c.subItemId).closes.push(c);

  const out: KitCheckCase[] = [];
  for (const { rets, closes } of bySet.values()) {
    rets.sort((a, b) => a.returnedAt.getTime() - b.returnedAt.getTime());
    closes.sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
    const mine: KitCheckCase[] = rets.map((opener) => ({ opener, closer: null, cancelled: false }));
    for (const c of closes) {
      // ปิดเคสที่เปิดค้างอยู่และเปิดก่อนหน้าการตรวจครั้งนี้ — เก่าสุดก่อน เพราะคิวเดินตามลำดับ
      const target = mine.find((k) => !k.closer && k.opener.returnedAt <= c.changedAt);
      if (!target) continue;
      target.closer = c;
      target.cancelled = c.newStatus === ItemStatus.DISPOSED;
    }
    out.push(...mine);
  }
  return out;
}

function kitCheckSummary(k: KitCheckCase): CaseSummary {
  const o = k.opener;
  const waiting = days(o.returnedAt);
  return {
    id: `KIT_CHECK:${o.id}`,
    type: "KIT_CHECK",
    code: "",
    state: k.cancelled ? "CANCELLED" : k.closer ? "DONE" : "OPEN",
    statusLabel: k.cancelled ? "ยกเลิกชุด" : k.closer ? "ตรวจแล้ว" : `รอตรวจ ${waiting} วัน`,
    subject: k.cancelled ? "ชุดถูกยกเลิกก่อนตรวจ" : "ตรวจความครบของชุดหลังคืน",
    title: o.item.name,
    itemId: o.item.id,
    itemCode: o.item.code,
    subCode: o.subItem?.subCode ?? null,
    qty: 1,
    unit: o.item.issueUnit.name,
    cost: null,
    openedAt: o.returnedAt,
    updatedAt: k.closer?.changedAt ?? o.returnedAt,
    openedBy: o.returner.name,
  };
}

function kitCheckSteps(k: KitCheckCase): CaseStep[] {
  const o = k.opener;
  const steps: CaseStep[] = [
    step({
      key: "returned",
      label: "คืนชุด",
      at: o.returnedAt,
      by: o.returner.name,
      detail: o.subItem ? `${o.item.code}-${o.subItem.subCode}` : null,
      waiting: k.closer
        ? `รอตรวจ · ${days(o.returnedAt, k.closer.changedAt)} วัน`
        : `รอตรวจ · ${days(o.returnedAt)} วัน แล้ว`,
    }),
  ];
  if (k.closer) {
    steps.push(step({
      key: "checked",
      label: k.cancelled ? "ยกเลิกชุด" : "ตรวจชุด",
      at: k.closer.changedAt,
      by: k.closer.changer.name,
      detail: k.closer.reason,
    }));
  } else {
    steps.push(step({ key: "checked", label: "ตรวจชุด" }));
  }
  return steps;
}

// ── LC: สูญหาย ────────────────────────────────────────────────────────────────
// ของหายมีจุดจบมาแต่ต้น — คอลัมน์ `recoveredAt` อยู่ทั้งบน item_status_logs และ stock_adjustments
// ตั้งแต่ก่อนจะมีคำว่าเคสในระบบนี้ และ /api/items/[id]/recover คือทางปิดมัน. สิ่งที่ขาดคือที่ทางให้
// มันปรากฏตัวในฐานะงานที่ค้างอยู่ — เดิมมันมีแท็บของตัวเองต่อพัสดุหนึ่งชิ้น ซึ่งแปลว่าไม่มีใครเห็นภาพรวม.
//
// ReturnRecord ที่ condition = LOST ไม่นับเป็นต้นทางของเคส ทั้งที่มีจำนวนเท่ากันเป๊ะ (114 = 114):
// สองแถวนั้นถูกเขียนใน transaction เดียวกันเพื่อเล่าเหตุการณ์เดียว — การคืนที่ลงเอยด้วยของหาย.
// นับทั้งคู่ก็จะได้เคสซ้ำ 114 ใบ. แถวคืนยังโยงกลับมาได้ผ่าน fromReturnId เหมือนเคสซ่อม.
type LostRow = {
  kind: "PIECE" | "ADJUSTMENT";
  id: string;
  at: Date;
  qty: number;
  by: string;
  note: string | null;
  recoveredAt: Date | null;
  /** สถานะของชิ้น/ยอดตอนนี้ — ใช้จับกรณีของกลับมาแล้วแต่ไม่มีใครบันทึกการเรียกคืน. */
  backInService: boolean;
  fromReturnId: string | null;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  subCode: string | null;
};

function lostSummary(l: LostRow): CaseSummary {
  // recoveredAt = มีคนกดเรียกคืนจริง. ของที่กลับมาอยู่ในสถานะพร้อมใช้โดยไม่มีแถวเรียกคืน แปลว่ามัน
  // ถูกแก้สถานะด้วยทางอื่นที่ไม่ได้บันทึกอะไรไว้ — เคสปิดไปแล้วตามความจริง แต่ตอบไม่ได้ว่าใครปิด
  // เมื่อไหร่ และเราจะไม่กรอกให้มันเอง.
  const recovered = !!l.recoveredAt;
  const closedSilently = !recovered && l.backInService;
  return {
    id: `LOST:${l.kind === "PIECE" ? "log" : "adj"}:${l.id}`,
    type: "LOST",
    code: "",
    state: recovered || closedSilently ? "DONE" : "OPEN",
    statusLabel: recovered ? "เรียกคืนแล้ว" : closedSilently ? "กลับมาใช้งานแล้ว" : `ยังหาไม่พบ ${days(l.at)} วัน`,
    subject: l.note?.trim() || "สูญหาย",
    title: l.itemName,
    itemId: l.itemId,
    itemCode: l.itemCode,
    subCode: l.subCode,
    qty: l.qty,
    unit: l.unit,
    cost: null,
    openedAt: l.at,
    updatedAt: l.recoveredAt ?? l.at,
    openedBy: l.by,
  };
}

function lostSteps(l: LostRow): CaseStep[] {
  const steps: CaseStep[] = [
    step({
      key: "lost",
      label: "แจ้งสูญหาย",
      at: l.at,
      by: l.by,
      detail: join(`${l.qty} ${l.unit}`, l.note),
      waiting: l.recoveredAt ? `ตามหา · ${days(l.at, l.recoveredAt)} วัน` : `ตามหามาแล้ว · ${days(l.at)} วัน`,
    }),
  ];
  if (l.recoveredAt) {
    steps.push(step({ key: "recovered", label: "เรียกคืน", at: l.recoveredAt }));
  } else if (l.backInService) {
    // ไม่ประดิษฐ์วันเวลาหรือชื่อคนขึ้นมา — จุดนี้จึงเป็นจุดโปร่ง พร้อมคำอธิบายว่ารอยขาดอยู่ตรงไหน
    steps.push(step({
      key: "recovered",
      label: "กลับมาใช้งานแล้ว",
      detail: "ไม่พบประวัติการเรียกคืน — ของถูกปรับสถานะกลับด้วยทางที่ไม่ได้บันทึกไว้",
    }));
  } else {
    steps.push(step({ key: "recovered", label: "เรียกคืน" }));
  }
  return steps;
}

async function loadLostCases(itemId?: string, subItemId?: string): Promise<LostRow[]> {
  const scope = { ...(itemId ? { itemId } : {}), ...(subItemId ? { subItemId } : {}) };
  const [pieces, adjustments] = await Promise.all([
    prisma.itemStatusLog.findMany({
      where: { ...scope, newStatus: ItemStatus.LOST },
      select: {
        id: true, itemId: true, changedAt: true, reason: true, recoveredAt: true, fromReturnId: true,
        changer: { select: { name: true } },
        item: { select: itemSelect },
        subItem: { select: { subCode: true, status: true } },
      },
    }),
    // ของนับจำนวน: ยอดที่หายไม่มี "ชิ้น" ให้ดูสถานะ — recoveredAt คือคำตอบเดียวที่มี
    subItemId ? [] : prisma.stockAdjustment.findMany({
      where: { ...(itemId ? { itemId } : {}), reason: AdjustmentReason.LOST },
      select: {
        id: true, itemId: true, adjustedAt: true, notes: true, recoveredAt: true, fromReturnId: true,
        previousQty: true, newQty: true,
        adjuster: { select: { name: true } },
        item: { select: itemSelect },
      },
    }),
  ]);

  return [
    ...pieces.map((p): LostRow => ({
      kind: "PIECE",
      id: p.id,
      at: p.changedAt,
      qty: 1,
      by: p.changer.name,
      note: p.reason,
      recoveredAt: p.recoveredAt,
      backInService: !!p.subItem && p.subItem.status !== ItemStatus.LOST,
      fromReturnId: p.fromReturnId,
      itemId: p.item.id,
      itemCode: p.item.code,
      itemName: p.item.name,
      unit: p.item.issueUnit.name,
      subCode: p.subItem?.subCode ?? null,
    })),
    ...adjustments.map((a): LostRow => ({
      kind: "ADJUSTMENT",
      id: a.id,
      at: a.adjustedAt,
      qty: a.previousQty - a.newQty,
      by: a.adjuster.name,
      note: a.notes,
      recoveredAt: a.recoveredAt,
      backInService: false,
      fromReturnId: a.fromReturnId,
      itemId: a.item.id,
      itemCode: a.item.code,
      itemName: a.item.name,
      unit: a.item.issueUnit.name,
      subCode: null,
    })),
  ];
}
