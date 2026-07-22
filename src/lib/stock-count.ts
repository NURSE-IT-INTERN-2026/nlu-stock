import type { DispenseType } from "@/generated/prisma/enums";

/**
 * Stock count (ตรวจนับ) cadence.
 *
 * Consumables burn down fast, so they get counted every quarter; everything
 * durable is a yearly count. Item.countCycleMonths overrides this per item
 * (null = follow the default below), so admins can retune one item without a
 * migration.
 */
export const DEFAULT_COUNT_CYCLE_MONTHS: Record<DispenseType, number> = {
  CONSUMABLE: 3,
  COUNT: 12,
  ITEM: 12,
};

export function countCycleFor(
  dispenseType: DispenseType,
  override?: number | null,
): number {
  if (override != null && Number.isFinite(override) && override > 0) return override;
  return DEFAULT_COUNT_CYCLE_MONTHS[dispenseType];
}

/**
 * Next count due date = counted date + cycle months (local-calendar addition,
 * same as nextMaintenanceFromCycle). Returns null when there's no baseline or
 * the cycle is invalid — callers treat null as "leave nextCountDate alone".
 */
export function nextCountFrom(
  countedAt: Date | null,
  cycleMonths: number,
): Date | null {
  if (!countedAt) return null;
  if (!Number.isFinite(cycleMonths) || cycleMonths <= 0) return null;
  const next = new Date(countedAt);
  next.setMonth(next.getMonth() + cycleMonths);
  return next;
}

/** Never counted (null) counts as due — a fresh item still needs its first count. */
export function isCountDue(nextCountDate: Date | null, now: Date = new Date()): boolean {
  return nextCountDate === null || nextCountDate <= now;
}

// ── self-check: npx tsx src/lib/stock-count.ts ──
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

function selfCheck(): void {
  // Defaults: consumable quarterly, durables yearly.
  assert(countCycleFor("CONSUMABLE") === 3, "consumable default must be 3 months");
  assert(countCycleFor("COUNT") === 12, "COUNT default must be 12 months");
  assert(countCycleFor("ITEM") === 12, "ITEM default must be 12 months");

  // Per-item override wins; junk overrides fall back to the default.
  assert(countCycleFor("CONSUMABLE", 6) === 6, "override must win");
  assert(countCycleFor("CONSUMABLE", null) === 3, "null override falls back");
  assert(countCycleFor("ITEM", 0) === 12, "zero override falls back");

  const counted = new Date("2026-07-21T10:00:00");

  const q = nextCountFrom(counted, countCycleFor("CONSUMABLE"));
  assert(!!q && q.getFullYear() === 2026 && q.getMonth() === 9, `expected 2026-10, got ${q?.toISOString()}`);

  const y = nextCountFrom(counted, countCycleFor("ITEM"));
  assert(!!y && y.getFullYear() === 2027 && y.getMonth() === 6, `expected 2027-07, got ${y?.toISOString()}`);

  assert(nextCountFrom(null, 3) === null, "no baseline must return null");
  assert(nextCountFrom(counted, 0) === null, "invalid cycle must return null");

  // Due-ness: never counted = due; past due = due; future = not due.
  const now = new Date("2026-07-21T10:00:00");
  assert(isCountDue(null, now), "never counted must be due");
  assert(isCountDue(new Date("2026-07-20T10:00:00"), now), "past date must be due");
  assert(!isCountDue(new Date("2026-08-01T10:00:00"), now), "future date must not be due");

  console.log("stock-count self-check OK");
}

if (process.argv[1]?.endsWith("stock-count.ts")) selfCheck();
