import type { ItemStatus } from "@/generated/prisma/enums";
import { STATUS_LABELS } from "@/lib/constants";

// STATUS_LABELS is `satisfies Record<ItemStatus, string>`, so its keys are exactly the enum.
const VALID_STATUSES: ReadonlySet<string> = new Set(Object.keys(STATUS_LABELS));

/**
 * Parse a comma-separated `?status=` query value into validated ItemStatus values.
 * Invalid/unknown entries are dropped (not thrown) — preserves the "empty = no filter" default
 * so a malformed URL never breaks the page. Use this at the URL boundary instead of raw split().
 */
export function parseItemStatusList(value: string | null): ItemStatus[] {
  if (!value) return [];
  return value.split(",").filter((s): s is ItemStatus => VALID_STATUSES.has(s));
}

// Written off — no longer on the books. Never offered as a pickable status; browse them
// through the damaged/lost report or an item's ประวัติสูญหาย tab instead.
// A ?status=LOST URL still filters, so report deep-links keep working.
export const WRITTEN_OFF: ReadonlySet<ItemStatus> = new Set<ItemStatus>(["LOST", "DISPOSED"]);

/**
 * Is this a status a staff member set by hand and must clear by hand?
 *
 * AVAILABLE and ON_LOAN are the two derived states of a non-tracked item — ON_LOAN just
 * means availableQty < totalQty, the normal state of anything with stock out. Everything
 * else (ชำรุด/ส่งซ่อม/บำรุงรักษา/สูญหาย/ตัดจำหน่าย) was set by a person and means the item
 * is out of service until they say otherwise.
 *
 * Stated once here because two places must agree: recomputeItemCounts keeps such a status
 * instead of re-deriving it, and the dispense route refuses to hand the item out. If they
 * drifted, an item could be flagged ชำรุด and still be dispensable.
 */
export function isManualHold(status: ItemStatus): boolean {
  return status !== "AVAILABLE" && status !== "ON_LOAN";
}

/**
 * Statuses a user may pick for a given dispense type.
 * CONSUMABLE has no lifecycle (dispensed = gone) → AVAILABLE only.
 * null/undefined (no profile selected) = the union, i.e. everything but written-off.
 */
export function statusOptionsFor(dispenseType?: "CONSUMABLE" | "COUNT" | "ITEM" | null): ItemStatus[] {
  if (dispenseType === "CONSUMABLE") return ["AVAILABLE"];
  return (Object.keys(STATUS_LABELS) as ItemStatus[]).filter((s) => !WRITTEN_OFF.has(s));
}

/**
 * The ONE door into กำลังบำรุงรักษา is ส่งบำรุงรักษาภายนอก on /maintenance, because that is the
 * only screen that collects what the trip needs to be complete — the venue, the note, and the
 * round it belongs to. Same lesson as CORRECTIVE: a status anyone can pick by hand produces
 * half-records in the table reporting reads. It stays in ALLOWED_TRANSITIONS (the send must
 * pass canTransition) and out of allowedTargets (no button offers it).
 */
export const FLOW_ONLY: ReadonlySet<ItemStatus> = new Set<ItemStatus>(["PENDING_MAINTENANCE"]);

// ─── Lifecycle state machine (tracked pieces only) ───
// Which status a per-unit SubItem may move to. Skipping a step is refused because
// ItemStatusLog is the only record of what happened to a piece — a jump straight to
// UNDER_REPAIR or DISPOSED leaves a history nobody can audit.
//
// The repair leg is the reason this exists:
//   ชำรุด → ส่งซ่อม → (พร้อมใช้งาน | ตัดจำหน่าย)
// A piece that comes back still broken is NOT "received" — it stays UNDER_REPAIR and the
// staff edits the repair details instead (ภายใน → ภายนอก), which is the UNDER_REPAIR →
// UNDER_REPAIR self-edge: it appends a fresh log row so the trail shows both trips.
//
// Non-tracked items (COUNT/CONSUMABLE) never reach here — they have no per-piece identity,
// so damage is a qty adjustment (StockAdjustment), not a status.
export const ALLOWED_TRANSITIONS: Record<ItemStatus, readonly ItemStatus[]> = {
  AVAILABLE: ["ON_LOAN", "IN_USE", "PENDING_MAINTENANCE", "DAMAGED", "LOST", "DISPOSED"],
  ON_LOAN: ["AVAILABLE", "DAMAGED", "LOST"],
  IN_USE: ["AVAILABLE", "DAMAGED", "LOST"],
  // ส่งบำรุงรักษาภายนอก. Back in service is the normal exit and it comes through the
  // MaintenanceRecord that receives the piece, not through the status screen. DAMAGED/DISPOSED
  // are what an inspection at the vendor can turn up: it was actually broken, or it is scrap.
  // The self-edge is แก้ข้อมูลส่งบำรุงรักษา, exactly like UNDER_REPAIR's: the trip is still the
  // same trip, so it appends a log row instead of restarting the clock (a corrected shop name
  // must not make a piece that has been out for three weeks read as sent today).
  PENDING_MAINTENANCE: ["AVAILABLE", "DAMAGED", "DISPOSED", "PENDING_MAINTENANCE"],
  // AVAILABLE = ยกเลิกคำขอชำรุด: the piece turned out not to be broken. Open to anyone who can
  // manage stock — the person who inspects the piece is the person who filed the report, and
  // routing the correction through a superadmin only left wrong ชำรุด rows sitting in the queue.
  DAMAGED: ["UNDER_REPAIR", "DISPOSED", "AVAILABLE"],
  UNDER_REPAIR: ["AVAILABLE", "DISPOSED", "UNDER_REPAIR"],
  LOST: ["AVAILABLE"],
  // ยกเลิกตัดจำหน่าย — mirror of LOST → AVAILABLE (เรียกคืน): a disposed piece can be
  // brought back to พร้อมใช้งาน, so dispose is repeatable across the lifecycle like lost.
  DISPOSED: ["AVAILABLE"],
};

// No edge is role-gated any more: the state machine says what may happen, and requireAdmin at
// the route says who may drive it. Skipping a step is still refused for everyone.
export function canTransition(from: ItemStatus, to: ItemStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Targets reachable from `from` — use this to build/filter the status buttons a user sees. */
export function allowedTargets(from: ItemStatus): ItemStatus[] {
  return ALLOWED_TRANSITIONS[from].filter((s) => !FLOW_ONLY.has(s));
}
