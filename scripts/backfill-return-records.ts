/**
 * One-time backfill: synthesise a ReturnRecord for every DispenseRecord that was already
 * returned before the return log existed. Without it the ประวัติ table shows a ถูกยืม row
 * with no matching รับคืน row for anything that happened before the migration.
 *
 * The operator is a best-effort guess — only the borrower was ever stored — so every
 * backfilled row is stamped with a note saying so rather than quietly asserting a name.
 *
 * Dry-run by default. Apply with:
 *   npx tsx scripts/backfill-return-records.ts --apply
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes("--apply");
const LEGACY_NOTE = "ข้อมูลก่อนระบบบันทึกการคืน (ผู้ดำเนินการเป็นค่าประมาณจากผู้ยืม)";

async function main() {
  const returned = await prisma.dispenseRecord.findMany({
    where: { returnedAt: { not: null }, returns: { none: {} } },
    select: {
      id: true,
      itemId: true,
      subItemId: true,
      quantity: true,
      resolvedQty: true,
      returnedAt: true,
      returnCondition: true,
      staffId: true,
      item: { select: { code: true, name: true } },
    },
    orderBy: { returnedAt: "asc" },
  });

  console.log(`${APPLY ? "Applying" : "Dry-run"}: ${returned.length} returned dispense records with no return row`);

  let written = 0;
  for (const d of returned) {
    const quantity = d.resolvedQty > 0 ? d.resolvedQty : d.quantity;
    const condition = d.returnCondition ?? "AVAILABLE";
    console.log(`  ${d.item.code} ${d.item.name} — คืน ${quantity} (${condition}) @ ${d.returnedAt?.toISOString()}`);
    if (!APPLY) continue;

    await prisma.returnRecord.create({
      data: {
        itemId: d.itemId,
        subItemId: d.subItemId,
        dispenseRecordId: d.id,
        quantity,
        condition,
        notes: LEGACY_NOTE,
        returnedBy: d.staffId,
        returnedAt: d.returnedAt!,
      },
    });
    written++;
  }

  console.log(APPLY ? `Done. ${written} return records created.` : "Dry-run only. Re-run with --apply to write.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
