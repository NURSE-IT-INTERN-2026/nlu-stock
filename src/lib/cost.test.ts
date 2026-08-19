import { test } from "node:test";
import assert from "node:assert/strict";
import { weightedUnitCost } from "@/lib/cost";

test("weightedUnitCost weighs by quantity and ignores unpriced rows", () => {
  // The whole reason this is not a plain average: one cheap piece must not mark 10 down.
  assert.equal(weightedUnitCost([
    { quantity: 10, unitCost: 100 },
    { quantity: 1, unitCost: 10 },
  ]), 1010 / 11);

  // An unpriced receipt is unknown, not free — counting it as 0 would halve the value here.
  assert.equal(weightedUnitCost([
    { quantity: 1, unitCost: 60000 },
    { quantity: 1, unitCost: null },
  ]), 60000);

  // Nothing priced → null, so the caller stores "ไม่ทราบราคา" instead of "฿0".
  assert.equal(weightedUnitCost([{ quantity: 5, unitCost: null }]), null);
  assert.equal(weightedUnitCost([]), null);

  // A zero-quantity row cannot contribute weight and must not divide by zero.
  assert.equal(weightedUnitCost([{ quantity: 0, unitCost: 500 }]), null);
});
