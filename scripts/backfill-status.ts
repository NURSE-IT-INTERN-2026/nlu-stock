/**
 * One-time backfill: derive Item.status for every item from its current state.
 *   - tracked (trackIndividually): highest-priority sub-item status
 *   - COUNT: available < total → ON_LOAN, else AVAILABLE
 *   - CONSUMABLE: AVAILABLE
 *
 * Mirrors src/lib/stock.ts derive logic. Run once after deploying the derive hook:
 *   npx tsx scripts/backfill-status.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ItemStatus } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Keep in sync with STATUS_PRIORITY in src/lib/stock.ts (higher = wins).
const PRIORITY: Record<ItemStatus, number> = {
  AVAILABLE: 1,
  IN_USE: 2,
  ON_LOAN: 3,
  PENDING_MAINTENANCE: 4,
  UNDER_REPAIR: 5,
  DAMAGED: 6,
  LOST: 7,
  DISPOSED: 8,
};

async function main() {
  const items = await prisma.item.findMany({
    select: {
      id: true,
      status: true,
      trackIndividually: true,
      availableQty: true,
      totalQty: true,
      category: { select: { profile: { select: { dispenseType: true } } } },
    },
  });

  console.log(`Backfilling status for ${items.length} items`);
  let changed = 0;

  for (const item of items) {
    let status: ItemStatus;
    if (item.trackIndividually) {
      const subs = await prisma.subItem.findMany({
        where: { itemId: item.id },
        select: { status: true },
      });
      status = subs.length
        ? subs.reduce<ItemStatus>(
            (best, s) => (PRIORITY[s.status] > PRIORITY[best] ? s.status : best),
            ItemStatus.AVAILABLE,
          )
        : ItemStatus.AVAILABLE;
    } else if (item.category.profile.dispenseType === "COUNT" && item.availableQty < item.totalQty) {
      status = ItemStatus.ON_LOAN;
    } else {
      status = ItemStatus.AVAILABLE;
    }

    if (item.status !== status) {
      await prisma.item.update({ where: { id: item.id }, data: { status } });
      changed++;
    }
  }

  console.log(`Done. ${changed}/${items.length} items updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
