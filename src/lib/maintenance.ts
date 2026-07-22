/**
 * Recompute an item's next maintenance due date from its last performed
 * maintenance + cycle (months). Pure, side-effect free.
 *
 * Returns null when there's no baseline (item never maintained) or an invalid
 * cycle. Callers must treat null as "leave nextMaintenanceDate untouched", NOT
 * "set to null" — a never-maintained item has no due date to compute.
 *
 * Uses local-calendar month addition (Date.setMonth) to match how the maintenance
 * form derives the date client-side (maintenance-form-dialog.tsx).
 */
export function nextMaintenanceFromCycle(
  lastMaintenanceDate: Date | null,
  cycleMonths: number,
): Date | null {
  if (!lastMaintenanceDate) return null;
  if (!Number.isFinite(cycleMonths) || cycleMonths <= 0) return null;
  const next = new Date(lastMaintenanceDate);
  next.setMonth(next.getMonth() + cycleMonths);
  return next;
}

// ── self-check: npx tsx src/lib/maintenance.ts ──
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

function selfCheck(): void {
  const last = new Date("2026-01-15T12:00:00");

  // Case 1: cycle 12 → next due ~12 months on (Jan → next Jan).
  const a = nextMaintenanceFromCycle(last, 12);
  assert(!!a, "12-month cycle must return a date");
  assert(a!.getFullYear() === 2027 && a!.getMonth() === 0, `expected 2027-01, got ${a!.toISOString()}`);

  // Case 1b: cycle changed 12 → 6 → next due 6 months on (Jan → Jul).
  const b = nextMaintenanceFromCycle(last, 6);
  assert(!!b, "6-month cycle must return a date");
  assert(b!.getFullYear() === 2026 && b!.getMonth() === 6, `expected 2026-07, got ${b!.toISOString()}`);

  // Case 2: null baseline (never maintained) → null, no recalc.
  const c = nextMaintenanceFromCycle(null, 6);
  assert(c === null, "null lastMaintenanceDate must return null");

  // Case 3: invalid cycle → null.
  const d = nextMaintenanceFromCycle(last, 0);
  assert(d === null, "zero cycle must return null");

  console.log("maintenance self-check OK");
}

if (process.argv[1]?.endsWith("maintenance.ts")) selfCheck();
