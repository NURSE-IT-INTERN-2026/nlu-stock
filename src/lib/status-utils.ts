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
 * Statuses a user may pick for a given dispense type.
 * CONSUMABLE has no lifecycle (dispensed = gone) → AVAILABLE only.
 * null/undefined (no profile selected) = the union, i.e. everything but written-off.
 */
export function statusOptionsFor(dispenseType?: "CONSUMABLE" | "COUNT" | "ITEM" | null): ItemStatus[] {
  if (dispenseType === "CONSUMABLE") return ["AVAILABLE"];
  return (Object.keys(STATUS_LABELS) as ItemStatus[]).filter((s) => !WRITTEN_OFF.has(s));
}

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
// PENDING_MAINTENANCE has no edges: nothing in the app sets it (the service schedule lives
// on nextMaintenanceDate). Left as an isolated node rather than removed from the enum.
export const ALLOWED_TRANSITIONS: Record<ItemStatus, readonly ItemStatus[]> = {
  AVAILABLE: ["ON_LOAN", "IN_USE", "DAMAGED", "LOST", "DISPOSED"],
  ON_LOAN: ["AVAILABLE", "DAMAGED", "LOST"],
  IN_USE: ["AVAILABLE", "DAMAGED", "LOST"],
  DAMAGED: ["UNDER_REPAIR", "DISPOSED"],
  UNDER_REPAIR: ["AVAILABLE", "DISPOSED", "UNDER_REPAIR"],
  LOST: ["AVAILABLE"],
  PENDING_MAINTENANCE: [],
  DISPOSED: [],
};

// ยกเลิกคำขอชำรุด — the piece turned out not to be broken. ADMIN only, and it is the ONLY
// edge a role unlocks: an admin still cannot skip any other step.
const ADMIN_ONLY: readonly (readonly [ItemStatus, ItemStatus])[] = [["DAMAGED", "AVAILABLE"]];

export function canTransition(
  from: ItemStatus,
  to: ItemStatus,
  opts?: { isAdmin?: boolean },
): boolean {
  if (ALLOWED_TRANSITIONS[from].includes(to)) return true;
  return !!opts?.isAdmin && ADMIN_ONLY.some(([f, t]) => f === from && t === to);
}

/** Targets reachable from `from` — use this to build/filter the status buttons a user sees. */
export function allowedTargets(from: ItemStatus, opts?: { isAdmin?: boolean }): ItemStatus[] {
  const base = [...ALLOWED_TRANSITIONS[from]];
  if (opts?.isAdmin) {
    for (const [f, t] of ADMIN_ONLY) if (f === from && !base.includes(t)) base.push(t);
  }
  return base;
}
