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

/**
 * The scheduling rule: given the outcome of a maintenance job, when is the next
 * preventive round due? Single source of truth — the API applies it, the form only
 * previews it, and no caller (script, import, future client) may re-derive it.
 *
 * Returns null = no next round. That happens only when the piece leaves service
 * (DISPOSED); a written-off piece must not sit on the schedule.
 *
 * A CORRECTIVE job DOES reset the clock. Skipping it would leave nextMaintenanceDate
 * null, and the schedule query filters `nextMaintenanceDate: { not: null }` — a
 * repaired piece would silently drop off the maintenance list forever. Coming back
 * from repair puts the piece back on cadence.
 */
export function scheduleNextMaintenance(
  result: "AVAILABLE" | "DISPOSED",
  performedAt: Date,
  cycleMonths: number,
): Date | null {
  if (result === "DISPOSED") return null;
  return nextMaintenanceFromCycle(performedAt, cycleMonths);
}

/**
 * What a finished job does to the maintenance schedule. Returns the value to write to
 * nextMaintenanceDate, or `undefined` meaning "leave whatever is there alone".
 *
 * ซ่อม ≠ บำรุงรักษา. A CORRECTIVE job (รับคืนจากส่งซ่อม) is not a maintenance round, so it
 * must not push the cadence: a piece due 20 Sep that goes out for repair and comes back is
 * still due 20 Sep. The repair screen doesn't even show the field.
 *
 * The one exception is a piece that has NO due date at all. The schedule query filters
 * `nextMaintenanceDate: { not: null }`, so leaving it null would drop a repaired piece off
 * the maintenance table for good. Filling that blank is not the same as moving a real
 * appointment — it puts the piece on the cadence for the first time.
 */
export function nextDateAfterJob(input: {
  type: "PREVENTIVE" | "CORRECTIVE";
  result: "AVAILABLE" | "DISPOSED";
  performedAt: Date;
  cycleMonths: number;
  currentNext: Date | null;
}): Date | null | undefined {
  const { type, result, performedAt, cycleMonths, currentNext } = input;
  // null is returned for exactly one case — a written-off piece must leave the schedule.
  // Everywhere else a missing date means "no opinion", i.e. undefined, so an unusable cycle
  // never wipes a due date that is already set.
  if (result === "DISPOSED") return null;
  if (type === "CORRECTIVE" && currentNext) return undefined; // repair doesn't move the cadence
  // CORRECTIVE with no date = filling the blank; PREVENTIVE = a real round resets the clock.
  return nextMaintenanceFromCycle(performedAt, cycleMonths) ?? undefined;
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

  // ── scheduleNextMaintenance ──
  // Written off → never scheduled again, whatever the cycle says.
  assert(scheduleNextMaintenance("DISPOSED", last, 12) === null, "DISPOSED must not schedule");
  // Back in service → next round one cycle out. This is the CORRECTIVE case too: a repaired
  // piece with no next date would vanish from the schedule (query filters not-null).
  const e = scheduleNextMaintenance("AVAILABLE", last, 6);
  assert(!!e, "AVAILABLE must schedule the next round");
  assert(e!.getFullYear() === 2026 && e!.getMonth() === 6, `expected 2026-07, got ${e!.toISOString()}`);
  // No usable cycle → nothing to compute; caller leaves the existing date alone.
  assert(scheduleNextMaintenance("AVAILABLE", last, 0) === null, "zero cycle schedules nothing");

  // ── nextDateAfterJob: ซ่อม must not move a cadence it didn't set ──
  const due = new Date("2026-09-20T00:00:00");
  const repairDone = new Date("2026-03-01T12:00:00");
  // Repaired piece already on the schedule → untouched (undefined = don't write).
  assert(
    nextDateAfterJob({ type: "CORRECTIVE", result: "AVAILABLE", performedAt: repairDone, cycleMonths: 12, currentNext: due }) === undefined,
    "CORRECTIVE must leave an existing due date alone",
  );
  // Repaired piece with no due date → gets its first one, or it vanishes from the schedule.
  const filled = nextDateAfterJob({ type: "CORRECTIVE", result: "AVAILABLE", performedAt: repairDone, cycleMonths: 12, currentNext: null });
  assert(filled instanceof Date && filled.getFullYear() === 2027 && filled.getMonth() === 2, `blank must be filled with +12m, got ${String(filled)}`);
  // A real maintenance round always resets the cadence.
  const preventive = nextDateAfterJob({ type: "PREVENTIVE", result: "AVAILABLE", performedAt: repairDone, cycleMonths: 6, currentNext: due });
  assert(preventive instanceof Date && preventive.getMonth() === 8 && preventive.getFullYear() === 2026, `PREVENTIVE must reschedule, got ${String(preventive)}`);
  // Written off from either path → cleared.
  assert(nextDateAfterJob({ type: "CORRECTIVE", result: "DISPOSED", performedAt: repairDone, cycleMonths: 12, currentNext: due }) === null, "DISPOSED clears the schedule");
  // No usable cycle must never wipe a date that is already set — null is reserved for DISPOSED.
  assert(
    nextDateAfterJob({ type: "PREVENTIVE", result: "AVAILABLE", performedAt: repairDone, cycleMonths: 0, currentNext: due }) === undefined,
    "unusable cycle must leave the existing date alone",
  );

  console.log("maintenance self-check OK");
}

if (process.argv[1]?.endsWith("maintenance.ts")) selfCheck();
