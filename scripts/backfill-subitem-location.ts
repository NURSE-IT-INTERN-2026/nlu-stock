/**
 * One-time backfill: set SubItem.locationId from parent Item for every sub-item
 * that currently has locationId = NULL — BUT only when the parent's location is
 * a real one. The seed created a default fallback location (อาคาร 2 / ชั้น 4 / 402)
 * used for any item whose source row had no room; copying that onto sub-items
 * would bake a wrong default into every piece, so it is deliberately skipped.
 *
 * Three buckets:
 *   - fillable            parent.locationId set AND not the seed default → copy
 *   - skipped-null-parent parent.locationId NULL                          → leave NULL
 *   - skipped-default     parent.locationId === DEFAULT_LOCATION_ID        → leave NULL
 *
 * Dry-run by default (prints what would change, updates nothing):
 *   npx tsx scripts/backfill-subitem-location.ts
 * Apply for real (fillable bucket only):
 *   npx tsx scripts/backfill-subitem-location.ts --apply
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEFAULT_LOCATION_ID } from "../src/lib/default-location";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes("--apply");

async function main() {
  const subs = await prisma.subItem.findMany({
    where: { locationId: null },
    select: {
      id: true,
      subCode: true,
      itemId: true,
      item: { select: { code: true, locationId: true } },
    },
    orderBy: { itemId: "asc" },
  });

  const fillable = subs.filter(
    (s) => s.item.locationId !== null && s.item.locationId !== DEFAULT_LOCATION_ID,
  );
  const skippedNull = subs.filter((s) => s.item.locationId === null);
  const skippedDefault = subs.filter((s) => s.item.locationId === DEFAULT_LOCATION_ID);

  console.log(`Mode: ${APPLY ? "APPLY (real writes)" : "DRY-RUN (no writes)"}`);
  console.log(`Sub-items with locationId = NULL: ${subs.length}`);
  console.log(`  → fillable             (parent has real location): ${fillable.length}`);
  console.log(`  → skipped-null-parent  (parent locationId NULL):    ${skippedNull.length}`);
  console.log(`  → skipped-default      (parent = seed default):     ${skippedDefault.length}`);
  console.log("");

  if (fillable.length) {
    console.log(`FILLABLE — would set (sub → parent.locationId):`);
    for (const s of fillable) {
      console.log(`  ${s.item.code} / ${s.subCode}  (subId=${s.id})  →  ${s.item.locationId}`);
    }
  }
  if (skippedDefault.length) {
    console.log("");
    console.log(`SKIPPED-DEFAULT — parent is seed default ${DEFAULT_LOCATION_ID}, left NULL:`);
    for (const s of skippedDefault) {
      console.log(`  ${s.item.code} / ${s.subCode}  (subId=${s.id})`);
    }
  }
  if (skippedNull.length) {
    console.log("");
    console.log(`SKIPPED-NULL-PARENT — parent locationId NULL, left NULL:`);
    for (const s of skippedNull) {
      console.log(`  ${s.item.code} / ${s.subCode}  (subId=${s.id})`);
    }
  }

  if (!APPLY) {
    console.log("");
    console.log("Dry-run only. Re-run with --apply to write the fillable bucket.");
    return;
  }

  let done = 0;
  for (const s of fillable) {
    await prisma.subItem.update({
      where: { id: s.id },
      data: { locationId: s.item.locationId },
    });
    done++;
  }

  console.log("");
  console.log(`Done. ${done}/${fillable.length} sub-items updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
