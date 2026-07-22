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
