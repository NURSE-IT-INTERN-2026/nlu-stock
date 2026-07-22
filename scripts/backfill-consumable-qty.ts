/**
 * One-time backfill: resync Item.availableQty for non-tracked CONSUMABLE items
 * from SUM(lots.remainingQty). The stored counter can drift from the live lot
 * totals; lots are the physical source of truth (see ADR-0002 / src/lib/stock.ts).
 *
 * Dry-run by default (logs every diff). Apply with:
 *   npx tsx scripts/backfill-consumable-qty.ts --apply
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes("--apply");

async function main() {
  const items = await prisma.item.findMany({
    where: { trackIndividually: false },
    select: {
      id: true,
      code: true,
      name: true,
      availableQty: true,
      category: { select: { profile: { select: { dispenseType: true } } } },
      lots: { select: { remainingQty: true } },
    },
  });

  const consumables = items.filter((i) => i.category.profile?.dispenseType === "CONSUMABLE");
  console.log(`${APPLY ? "Applying" : "Dry-run"}: ${consumables.length} consumable items`);

  let changed = 0;
  for (const item of consumables) {
    // Skip items with no lots — their availableQty is the only source of truth
    // and must not be overwritten with 0.
    if (item.lots.length === 0) continue;
    const lotSum = item.lots.reduce((s, l) => s + l.remainingQty, 0);
    if (lotSum === item.availableQty) continue;
    changed++;
    console.log(
      `  ${item.code} (${item.name}): availableQty ${item.availableQty} → ${lotSum} ` +
        `(lots=${item.lots.length})`,
    );
    if (APPLY) {
      await prisma.item.update({ where: { id: item.id }, data: { availableQty: lotSum } });
    }
  }

  console.log(`Done. ${changed}/${consumables.length} items ${APPLY ? "updated" : "would update"}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
