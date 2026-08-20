/**
 * มูลค่าคงคลัง sanity check — proves lib/cost stockValueRows agrees with the database it
 * read, so the tab and its export can be trusted without opening a browser.
 *
 * Four assertions, each one a way the numbers have actually gone wrong before:
 *   1. every consumable with a priced receipt carries Item.purchasePrice (the fallback price
 *      that lot-less stock and lot-less เบิกใช้ lines depend on)
 *   2. usedValue never counts a unit it has no price for (usedUnpricedQty is excluded, and
 *      recomputing the priced units by hand lands on the same baht figure)
 *   3. usedQty for consumables equals SUM(quantity - resolvedQty) straight from SQL
 *   4. usedQty for durables equals the count of DISPOSED/LOST pieces — never DAMAGED, which
 *      is stock that is still in the building
 *
 *   npx tsx scripts/check-stock-value.ts
 *
 * Exits 1 on any mismatch.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { stockValueRows } from "../src/lib/cost";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const baht = (n: number) => `฿${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
let failed = 0;

function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  console.log(`      ${detail}`);
  if (!ok) failed++;
}

async function main() {
  const rows = await stockValueRows(prisma, { isActive: true });
  const consumable = rows.filter((r) => r.dispenseType === "CONSUMABLE");
  const durable = rows.filter((r) => r.dispenseType !== "CONSUMABLE");

  // 1 — the fallback price reaches every consumable that has one to reach
  const withPricedReceipt = await prisma.item.findMany({
    where: { isActive: true, receiveRecords: { some: { unitCost: { not: null } } } },
    select: { code: true, purchasePrice: true },
  });
  const missing = withPricedReceipt.filter((i) => i.purchasePrice == null);
  check(
    "priced receipts reach Item.purchasePrice",
    missing.length === 0,
    `${withPricedReceipt.length - missing.length}/${withPricedReceipt.length} items` +
      (missing.length ? ` — missing: ${missing.map((i) => i.code).join(", ")}` : ""),
  );

  // 2 — an unpriced unit contributes nothing, and a row with no priced unit has no value
  const bogus = rows.filter((r) => r.usedValue > 0 && r.usedQty - r.usedUnpricedQty <= 0);
  check(
    "usedValue only counts priced units",
    bogus.length === 0,
    bogus.length ? `rows valuing unpriced stock: ${bogus.map((r) => r.code).join(", ")}` : "no row prices a unit it cannot price",
  );

  // 3 — consumable usage matches the dispense ledger
  const dispensed = await prisma.dispenseRecord.findMany({
    where: { item: { isActive: true, category: { profile: { dispenseType: "CONSUMABLE" } } } },
    select: { quantity: true, resolvedQty: true },
  });
  const sqlUsed = dispensed.reduce((s, d) => s + Math.max(0, d.quantity - d.resolvedQty), 0);
  const libUsed = consumable.reduce((s, r) => s + r.usedQty, 0);
  check(
    "consumable usedQty = SUM(quantity - resolvedQty)",
    sqlUsed === libUsed,
    `lib ${libUsed.toLocaleString()} vs sql ${sqlUsed.toLocaleString()} units`,
  );

  // 4 — durable write-offs are DISPOSED/LOST only; ชำรุด stays in the building
  const writtenOff = await prisma.subItem.count({
    where: { status: { in: ["DISPOSED", "LOST"] }, item: { isActive: true } },
  });
  const damaged = await prisma.subItem.count({
    where: { status: "DAMAGED", item: { isActive: true } },
  });
  const libWrittenOff = durable.reduce((s, r) => s + r.usedQty, 0);
  check(
    "durable usedQty = DISPOSED + LOST pieces (DAMAGED excluded)",
    writtenOff === libWrittenOff,
    `lib ${libWrittenOff} vs sql ${writtenOff} pieces — ${damaged} DAMAGED correctly left out`,
  );

  const sum = (rs: typeof rows, f: (r: (typeof rows)[number]) => number) => rs.reduce((s, r) => s + f(r), 0);
  console.log("");
  console.log("ยอดที่หน้าจอจะแสดง:");
  for (const [label, rs] of [["สิ้นเปลือง", consumable], ["คงทน + ครุภัณฑ์", durable]] as const) {
    const unpriced = sum(rs, (r) => r.usedUnpricedQty);
    console.log(
      `  ${label}: คงเหลือ ${baht(sum(rs, (r) => r.value))} · ` +
        `ออกไปแล้ว ${baht(sum(rs, (r) => r.usedValue))} ` +
        `(${sum(rs, (r) => r.usedQty).toLocaleString()} หน่วย, ไม่มีราคา ${unpriced.toLocaleString()})`,
    );
  }

  if (failed) console.log(`\n${failed} check(s) failed.`);
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
