import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { ItemStatus, LoanType } from "@/generated/prisma/enums";
import { assembleKitSets, cancelKitSet, maxAssemblableSets, unitMismatches } from "@/lib/kits";

/**
 * ประกอบ → ยกเลิก, end to end, against the dev database inside a transaction that always rolls
 * back. The rules under test are the ones no unit test can reach, because they live in what the
 * writes did to other rows:
 *   1. a tracked component goes IN_USE, points at its set, and gets a นำไปใช้งาน record
 *   2. a consumable is NOT cut — the recipe and the stock count in different units
 *   3. ยกเลิกชุด hands the durables back and closes the records that put them in the box
 * Skipped when DATABASE_URL is unset so the suite still runs without a database.
 */

const ROLLBACK = "rollback: kit smoke test";

test("maxAssemblableSets ignores consumables", () => {
  const base = { code: "X", name: "x", unitName: "ชิ้น", bomUnitName: "ชิ้น", availableQty: 0 };
  // The tray caps it at 2; the gauze would say 0, and must not get a vote — the system does
  // not cut consumables, so its stock number cannot mean "not enough to build a set".
  const sets = maxAssemblableSets([
    { ...base, itemId: "tray", kind: "COUNT", perSet: 2, availableQty: 5 },
    { ...base, itemId: "gauze", kind: "CONSUMABLE", perSet: 5, availableQty: 0 },
  ]);
  assert.equal(sets, 2);
  assert.equal(maxAssemblableSets([{ ...base, itemId: "gauze", kind: "CONSUMABLE", perSet: 5 }]), 0);
});

test("unitMismatches flags a durable whose recipe unit is not its issue unit", () => {
  const base = { code: "X", name: "ถาด", availableQty: 9, perSet: 1 };
  assert.equal(
    unitMismatches([{ ...base, itemId: "a", kind: "COUNT", unitName: "กล่อง", bomUnitName: "ชิ้น" }]).length,
    1,
    "5 ชิ้น off an item stocked in กล่อง would cut 5 boxes",
  );
  // Consumables are exempt by construction: nothing subtracts their perSet from anything.
  assert.equal(
    unitMismatches([{ ...base, itemId: "b", kind: "CONSUMABLE", unitName: "กล่อง", bomUnitName: "ชิ้น" }]).length,
    0,
  );
});

test("kit set: assemble parks the durables and leaves the consumable alone", { skip: !process.env.DATABASE_URL }, async () => {
  const kitCategory = await prisma.categoryType.findFirst({ where: { profile: { code: "KIT" } }, select: { id: true } });
  const conCategory = await prisma.categoryType.findFirst({ where: { profile: { code: "CON" } }, select: { id: true } });
  const trackedCategory = await prisma.categoryType.findFirst({ where: { profile: { dispenseType: "ITEM" } }, select: { id: true } });
  const durableCategory = await prisma.categoryType.findFirst({ where: { profile: { dispenseType: "COUNT" } }, select: { id: true } });
  const unit = await prisma.unit.findFirst({ select: { id: true } });
  const user = await prisma.user.findFirst({ select: { id: true } });
  assert.ok(kitCategory && conCategory && trackedCategory && durableCategory && unit && user, "seed the database first");

  const stamp = Date.now();
  let checked = false;

  await prisma
    .$transaction(async (tx) => {
      const kit = await tx.item.create({
        data: { code: `TEST-KIT-${stamp}`, name: "ชุดทดสอบ", categoryId: kitCategory.id, issueUnitId: unit.id, trackIndividually: true },
      });
      const tracked = await tx.item.create({
        data: { code: `TEST-TRK-${stamp}`, name: "ของรายชิ้น", categoryId: trackedCategory.id, issueUnitId: unit.id, trackIndividually: true, totalQty: 1, availableQty: 1 },
      });
      const piece = await tx.subItem.create({ data: { itemId: tracked.id, subCode: "C01", status: ItemStatus.AVAILABLE } });
      const gauze = await tx.item.create({
        data: { code: `TEST-CON-${stamp}`, name: "ผ้าก๊อซ", categoryId: conCategory.id, issueUnitId: unit.id, totalQty: 10, availableQty: 10 },
      });
      const tray = await tx.item.create({
        data: { code: `TEST-DUR-${stamp}`, name: "ถาด", categoryId: durableCategory.id, issueUnitId: unit.id, totalQty: 5, availableQty: 5 },
      });
      await tx.kitBom.createMany({
        data: [
          { kitItemId: kit.id, componentItemId: tracked.id, name: tracked.name, quantity: 1, unitId: unit.id, sortOrder: 0 },
          { kitItemId: kit.id, componentItemId: gauze.id, name: gauze.name, quantity: 3, unitId: unit.id, sortOrder: 1 },
          { kitItemId: kit.id, componentItemId: tray.id, name: tray.name, quantity: 2, unitId: unit.id, sortOrder: 2 },
        ],
      });

      const { setSubItemIds } = await assembleKitSets(tx, { kitItemId: kit.id, sets: 1, userId: user.id });
      assert.equal(setSubItemIds.length, 1);

      const inKit = await tx.subItem.findUniqueOrThrow({ where: { id: piece.id } });
      assert.equal(inKit.status, ItemStatus.IN_USE, "a piece inside a set is out of the loan pool");
      assert.equal(inKit.inKitSubItemId, setSubItemIds[0], "and it knows which set it is in");
      assert.equal(
        (await tx.item.findUniqueOrThrow({ where: { id: gauze.id } })).availableQty,
        10,
        "the consumable is NOT cut — staff เบิก it themselves, in the unit it is stocked in",
      );
      assert.equal((await tx.item.findUniqueOrThrow({ where: { id: tray.id } })).availableQty, 3, "durable cut 2");
      assert.equal((await tx.item.findUniqueOrThrow({ where: { id: kit.id } })).availableQty, 1, "one set on the shelf");

      // นำไปใช้งาน, not a stock adjustment: the components are in a box being used, and the
      // record carries the set code so the item's ประวัติ can say which box.
      const inUse = await tx.dispenseRecord.findMany({
        where: { loanType: LoanType.INUSE, itemId: { in: [tracked.id, tray.id] } },
      });
      assert.equal(inUse.length, 2, "one record for the tracked piece, one for the tray");
      assert.ok(inUse.every((r) => r.notes?.includes(`${kit.code}-C01`)), "each names the set it went into");
      assert.equal(
        await tx.dispenseRecord.count({ where: { itemId: gauze.id } }),
        0,
        "and nothing at all is written for the consumable",
      );

      // A fresh set is on the shelf and lendable — nothing gates it.
      const fresh = await tx.subItem.findUniqueOrThrow({ where: { id: setSubItemIds[0] } });
      assert.equal(fresh.status, ItemStatus.AVAILABLE);
      assert.equal((await tx.item.findUniqueOrThrow({ where: { id: kit.id } })).availableQty, 1);

      const result = await cancelKitSet(tx, { setSubItemId: setSubItemIds[0], userId: user.id });
      assert.deepEqual(result.consumables.map((c) => c.name), [gauze.name], "staff are told what is still in the box");

      const back = await tx.subItem.findUniqueOrThrow({ where: { id: piece.id } });
      assert.equal(back.status, ItemStatus.AVAILABLE, "the tracked piece comes home");
      assert.equal(back.inKitSubItemId, null);
      assert.equal((await tx.item.findUniqueOrThrow({ where: { id: tray.id } })).availableQty, 5, "the durable comes back in full");
      assert.equal(
        (await tx.item.findUniqueOrThrow({ where: { id: gauze.id } })).availableQty,
        10,
        "the consumable is untouched in both directions",
      );
      assert.equal(
        await tx.dispenseRecord.count({ where: { loanType: LoanType.INUSE, returnedAt: null, itemId: { in: [tracked.id, tray.id] } } }),
        0,
        "and the records that put them in the box are closed, not left outstanding",
      );

      const deadSet = await tx.subItem.findUniqueOrThrow({ where: { id: setSubItemIds[0] } });
      assert.equal(deadSet.status, ItemStatus.DISPOSED, "the set dies but the row stays for history");
      assert.equal((await tx.item.findUniqueOrThrow({ where: { id: kit.id } })).availableQty, 0);

      checked = true;
      throw new Error(ROLLBACK);
    })
    .catch((e) => {
      if (!(e instanceof Error) || e.message !== ROLLBACK) throw e;
    });

  assert.ok(checked, "the transaction body must have run");
});

test("kit set: a recipe edited after assembly does not change what the box hands back", { skip: !process.env.DATABASE_URL }, async () => {
  const kitCategory = await prisma.categoryType.findFirst({ where: { profile: { code: "KIT" } }, select: { id: true } });
  const durableCategory = await prisma.categoryType.findFirst({ where: { profile: { dispenseType: "COUNT" } }, select: { id: true } });
  const unit = await prisma.unit.findFirst({ select: { id: true } });
  const user = await prisma.user.findFirst({ select: { id: true } });
  assert.ok(kitCategory && durableCategory && unit && user, "seed the database first");

  const stamp = Date.now();
  let checked = false;

  await prisma
    .$transaction(async (tx) => {
      const mk = (suffix: string, qty: number) =>
        tx.item.create({
          data: { code: `TEST-${suffix}-${stamp}`, name: suffix, categoryId: durableCategory.id, issueUnitId: unit.id, totalQty: qty, availableQty: qty },
        });
      const kit = await tx.item.create({
        data: { code: `TEST-KIT2-${stamp}`, name: "ชุดทดสอบสูตรเปลี่ยน", categoryId: kitCategory.id, issueUnitId: unit.id, trackIndividually: true },
      });
      const tray = await mk("TRAY", 10);
      const bowl = await mk("BOWL", 10);
      const cloth = await mk("CLOTH", 10);
      await tx.kitBom.createMany({
        data: [
          { kitItemId: kit.id, componentItemId: tray.id, name: tray.name, quantity: 1, unitId: unit.id, sortOrder: 0 },
          { kitItemId: kit.id, componentItemId: bowl.id, name: bowl.name, quantity: 1, unitId: unit.id, sortOrder: 1 },
        ],
      });

      const { setSubItemIds } = await assembleKitSets(tx, { kitItemId: kit.id, sets: 2, userId: user.id });
      assert.equal((await tx.item.findUniqueOrThrow({ where: { id: tray.id } })).availableQty, 8, "2 sets × 1 tray");

      // แก้ส่วนประกอบ after the boxes exist: more trays, the bowl dropped, a cloth added. The
      // recipe is deliberately never locked (sets are permanent, so a lock would be forever).
      await tx.kitBom.deleteMany({ where: { kitItemId: kit.id } });
      await tx.kitBom.createMany({
        data: [
          { kitItemId: kit.id, componentItemId: tray.id, name: tray.name, quantity: 2, unitId: unit.id, sortOrder: 0 },
          { kitItemId: kit.id, componentItemId: cloth.id, name: cloth.name, quantity: 1, unitId: unit.id, sortOrder: 1 },
        ],
      });

      await cancelKitSet(tx, { setSubItemId: setSubItemIds[0], userId: user.id });
      assert.equal((await tx.item.findUniqueOrThrow({ where: { id: tray.id } })).availableQty, 9, "one tray back — what went in, not the 2 the new recipe asks for");
      assert.equal((await tx.item.findUniqueOrThrow({ where: { id: bowl.id } })).availableQty, 9, "the bowl comes back even though the recipe forgot it");
      assert.equal((await tx.item.findUniqueOrThrow({ where: { id: cloth.id } })).availableQty, 10, "and the cloth is not conjured out of a box that never held it");

      // The second box is untouched by the first cancel — its own records, not the item's newest.
      assert.equal(
        await tx.dispenseRecord.count({ where: { kitSubItemId: setSubItemIds[1], loanType: LoanType.INUSE, returnedAt: null } }),
        2,
        "cancelling one set must not close the other set's records",
      );
      await cancelKitSet(tx, { setSubItemId: setSubItemIds[1], userId: user.id });
      assert.equal((await tx.item.findUniqueOrThrow({ where: { id: tray.id } })).availableQty, 10, "both boxes emptied, stock whole again");
      assert.equal((await tx.item.findUniqueOrThrow({ where: { id: bowl.id } })).availableQty, 10);

      checked = true;
      throw new Error(ROLLBACK);
    })
    .catch((e) => {
      if (!(e instanceof Error) || e.message !== ROLLBACK) throw e;
    });

  assert.ok(checked, "the transaction body must have run");
});
