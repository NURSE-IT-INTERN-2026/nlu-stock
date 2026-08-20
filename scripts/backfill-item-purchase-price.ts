/**
 * One-time backfill: re-derive Item.purchasePrice from priced receipts for every item.
 *
 * /receive used to call syncItemPurchasePrice only for non-consumables, so consumables ended
 * up with purchasePrice = null across the board — 178 of 194 of them had a priced receipt
 * sitting right there. Stock with no lot (most consumables, see AGENTS.md) and เบิกใช้ lines
 * with no lotId had nothing left to price them by. The route now derives it for every kind;
 * this walks the history that was written before it did.
 *
 * Idempotent: it recomputes the same weighted average the route would, so re-running changes
 * nothing. Items whose receipts carry no price are skipped, not zeroed.
 *
 * Dry-run by default:
 *   npx tsx scripts/backfill-item-purchase-price.ts
 * Apply:
 *   npx tsx scripts/backfill-item-purchase-price.ts --apply
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { weightedUnitCost, syncItemPurchasePrice } from "../src/lib/cost";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes("--apply");
const baht = (n: number) => `฿${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

async function main() {
  const items = await prisma.item.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      purchasePrice: true,
      category: { select: { profile: { select: { dispenseType: true } } } },
      receiveRecords: {
        where: { unitCost: { not: null } },
        select: { quantity: true, unitCost: true, receivedAt: true },
        orderBy: { receivedAt: "asc" },
      },
    },
    orderBy: { code: "asc" },
  });

  const changes = items
    .map((it) => ({
      it,
      next: weightedUnitCost(it.receiveRecords),
    }))
    .filter(({ it, next }) => next != null && next !== it.purchasePrice);

  const byType = new Map<string, number>();
  for (const { it } of changes) {
    const t = it.category.profile?.dispenseType ?? "—";
    byType.set(t, (byType.get(t) ?? 0) + 1);
  }

  console.log(`Mode: ${APPLY ? "APPLY (real writes)" : "DRY-RUN (no writes)"}`);
  console.log(`Items: ${items.length}`);
  console.log(`Items whose purchasePrice would change: ${changes.length}`);
  for (const [t, n] of byType) console.log(`  ${t}: ${n}`);
  console.log("");

  for (const { it, next } of changes) {
    const from = it.purchasePrice == null ? "null" : baht(it.purchasePrice);
    console.log(`  ${it.code}  ${from} → ${baht(next!)}   (${it.receiveRecords.length} priced receipts)  ${it.name}`);
  }
  console.log("");

  if (!APPLY) {
    console.log("Dry-run only. Re-run with --apply to write.");
    return;
  }

  for (const { it } of changes) {
    await prisma.$transaction((tx) =>
      syncItemPurchasePrice(tx, it.id, it.receiveRecords[0]?.receivedAt),
    );
  }
  console.log(`Updated ${changes.length} items.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
