import { test } from "node:test";
import assert from "node:assert/strict";
import { AdjustmentReason, ItemStatus } from "@/generated/prisma/enums";
import { damagedQtyOf, holdsTotalQty } from "@/lib/stock";
import { isManualHold } from "@/lib/status-utils";

// The two rules that keep แจ้งชำรุด honest. Both the write path (api/items/[id]/adjust) and
// the read paths (lib/distribution, the item detail response) go through these, so if the
// pair ever disagrees the ชำรุด figure stops reconciling with totalQty on the hero card.

test("holdsTotalQty: only damage stays on the books", () => {
  // Damaged units are still owned and still in the storeroom — they come back via รับคืนจากซ่อม.
  assert.equal(holdsTotalQty(AdjustmentReason.DAMAGED_PENDING_REPAIR), true);

  // Everything else means the units are gone, so totalQty follows availableQty down.
  for (const reason of [
    AdjustmentReason.LOST,
    AdjustmentReason.DISPOSAL,
    AdjustmentReason.COUNT_MISMATCH_SHORT,
    AdjustmentReason.COUNT_MISMATCH_OVER,
    AdjustmentReason.ASSEMBLY,
    AdjustmentReason.OTHER,
  ]) {
    assert.equal(holdsTotalQty(reason), false, `${reason} must not hold totalQty`);
  }
});

test("damagedQtyOf: sums the open bookings only", () => {
  const rows = [
    { previousQty: 56, newQty: 51, recoveredAt: null }, // 5 still broken
    { previousQty: 59, newQty: 56, recoveredAt: null }, // 3 still broken
  ];
  assert.equal(damagedQtyOf(rows), 8);

  // Recovering one takes it out of the figure — that stamp is why no counter is needed.
  const afterRepair = [rows[0], { ...rows[1], recoveredAt: new Date("2026-08-07") }];
  assert.equal(damagedQtyOf(afterRepair), 5);

  assert.equal(damagedQtyOf([]), 0);
});

test("damagedQtyOf: ignores rows that did not deduct", () => {
  // A zero or positive row is not a deduction; counting it would inflate ชำรุด, and a
  // negative contribution would silently cancel out a real one.
  assert.equal(
    damagedQtyOf([
      { previousQty: 10, newQty: 10, recoveredAt: null },
      { previousQty: 10, newQty: 12, recoveredAt: null },
      { previousQty: 10, newQty: 6, recoveredAt: null },
    ]),
    4,
  );
});

// The dispense route and recomputeItemCounts both branch on this. If it ever counted ON_LOAN
// as a hold, ordinary COUNT items (available < total whenever anything is out) would stop
// being dispensable — the reason this is one shared predicate and not two inline checks.
test("isManualHold: only staff-set statuses block a dispense", () => {
  assert.equal(isManualHold(ItemStatus.AVAILABLE), false);
  assert.equal(isManualHold(ItemStatus.ON_LOAN), false, "normal state of an item with stock out");

  for (const status of [
    ItemStatus.DAMAGED,
    ItemStatus.UNDER_REPAIR,
    ItemStatus.PENDING_MAINTENANCE,
    ItemStatus.LOST,
    ItemStatus.DISPOSED,
  ]) {
    assert.equal(isManualHold(status), true, `${status} must block`);
  }
});
