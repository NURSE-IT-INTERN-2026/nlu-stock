/**
 * One-time backfill: put damaged stock back on the books.
 *
 * แจ้งชำรุด used to deduct BOTH availableQty and totalQty, so damaged units left the item
 * entirely — even though the reason on the record is DAMAGED_PENDING_REPAIR and the units
 * were sitting in the storeroom waiting for a repair. The adjust route now holds totalQty
 * for that reason (see api/items/[id]/adjust/route.ts), and lib/distribution.ts derives a
 * ชำรุด bucket from the still-open adjustments.
 *
 * Rows booked before that change already had their qty taken out of totalQty. Counting them
 * in the new bucket without this backfill double-subtracts: NLU-DUR-003 showed 51/140 in the
 * hero while the breakdown under it summed to 148.
 *
 * Fix: for every item, add back the outstanding damaged qty (open DAMAGED_PENDING_REPAIR
 * adjustments, i.e. recoveredAt IS NULL) to totalQty. availableQty is untouched — it was
 * correct all along, the units really are not available.
 *
 * Idempotency: this is NOT safe to run twice against the same rows. Run it once, right after
 * deploying the adjust-route change. Recovered rows (recoveredAt set) are skipped, and
 * anything booked after the change is already correct — so if you must re-run, restrict it
 * with --before=<ISO date> to the rows that predate the deploy.
 *
 * Dry-run by default (prints what would change, updates nothing):
 *   npx tsx scripts/backfill-damaged-total-qty.ts
 * Apply for real:
 *   npx tsx scripts/backfill-damaged-total-qty.ts --apply
 * Restrict to rows booked before a cutoff:
 *   npx tsx scripts/backfill-damaged-total-qty.ts --before=2026-08-07 --apply
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const apply = process.argv.includes("--apply");
const beforeArg = process.argv.find((a) => a.startsWith("--before="))?.split("=")[1];
const before = beforeArg ? new Date(beforeArg) : null;

async function main() {
  if (beforeArg && Number.isNaN(before!.getTime())) {
    throw new Error(`--before is not a date: ${beforeArg}`);
  }

  const open = await prisma.stockAdjustment.findMany({
    where: {
      reason: "DAMAGED_PENDING_REPAIR",
      recoveredAt: null,
      ...(before ? { adjustedAt: { lt: before } } : {}),
    },
    select: { itemId: true, previousQty: true, newQty: true },
  });

  // previousQty - newQty is the deduction, mirroring recover/route.ts.
  const byItem = new Map<string, number>();
  for (const a of open) {
    const qty = a.previousQty - a.newQty;
    if (qty > 0) byItem.set(a.itemId, (byItem.get(a.itemId) ?? 0) + qty);
  }

  if (byItem.size === 0) {
    console.log("nothing to backfill — no open DAMAGED_PENDING_REPAIR adjustments");
    return;
  }

  const items = await prisma.item.findMany({
    where: { id: { in: [...byItem.keys()] } },
    select: { id: true, code: true, name: true, totalQty: true, availableQty: true },
  });

  console.log(`${apply ? "APPLYING" : "DRY RUN"} — ${items.length} item(s), ${open.length} open booking(s)\n`);
  for (const it of items) {
    const add = byItem.get(it.id)!;
    console.log(`  ${it.code.padEnd(16)} totalQty ${it.totalQty} → ${it.totalQty + add}  (+${add} ชำรุด, available ${it.availableQty} unchanged)  ${it.name}`);
    if (apply) {
      await prisma.item.update({ where: { id: it.id }, data: { totalQty: { increment: add } } });
    }
  }

  console.log(`\n${apply ? "done" : "dry run — re-run with --apply to write"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
