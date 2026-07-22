/**
 * Self-check for the status display rules (no test framework in this repo):
 *   npx tsx scripts/check-status-rules.ts
 *
 * Covers the two pure functions the /items dropdown, the row pill and the
 * damaged/lost report all depend on.
 */
import assert from "node:assert/strict";
import { deriveStatusFromSubItems, deriveNonTrackedStatus } from "../src/lib/stock";
import { statusOptionsFor, WRITTEN_OFF } from "../src/lib/status-utils";

// ── statusOptionsFor ──
assert.deepEqual(statusOptionsFor("CONSUMABLE"), ["AVAILABLE"], "consumable = AVAILABLE only");
for (const dt of ["COUNT", "ITEM", null] as const) {
  const opts = statusOptionsFor(dt);
  assert.ok(opts.includes("AVAILABLE") && opts.includes("DAMAGED"), `${dt} keeps normal statuses`);
  assert.ok(!opts.some((s) => WRITTEN_OFF.has(s)), `${dt} hides LOST/DISPOSED`);
}

// ── deriveStatusFromSubItems ──
assert.equal(deriveStatusFromSubItems([]), "AVAILABLE", "no pieces = AVAILABLE");
assert.equal(
  deriveStatusFromSubItems(["AVAILABLE", "AVAILABLE", "LOST"]),
  "AVAILABLE",
  "one lost piece must not make the whole item สูญหาย",
);
assert.equal(
  deriveStatusFromSubItems(["AVAILABLE", "DAMAGED", "DISPOSED"]),
  "DAMAGED",
  "highest live priority still wins",
);
assert.equal(deriveStatusFromSubItems(["LOST", "DISPOSED"]), "DISPOSED", "all written off = written off");

// ── deriveNonTrackedStatus ──
assert.equal(deriveNonTrackedStatus("CONSUMABLE", 0, 10), "AVAILABLE", "consumables never borrow");
assert.equal(deriveNonTrackedStatus("COUNT", 3, 10), "ON_LOAN", "COUNT with units out");
assert.equal(deriveNonTrackedStatus("COUNT", 10, 10), "AVAILABLE", "COUNT fully in stock");

console.log("status rules OK");
