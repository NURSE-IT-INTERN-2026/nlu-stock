/**
 * One-time backfill: point legacy CORRECTIVE maintenance_records at the แจ้งชำรุด booking they
 * closed (maintenance_records.repairBookingId), for rows written before that column existed.
 *
 * Why this is safe to guess here, when the schema comment says the pair must not be guessed:
 * that warning is about ATTRIBUTING EVIDENCE — showing photos under a repair they may not belong
 * to. This backfill only links rows that were written in ONE transaction (see
 * api/items/[id]/maintenance: restoreDamagedQty stamps booking.recoveredAt and creates the
 * REPAIR_RETURN adjustment the record already points at, microseconds apart), and it refuses any
 * record where the match is not unique. Anything ambiguous is left null, exactly as it is now.
 *
 * Without the link a finished repair reads as an open/unknown case and its รับคืนจากซ่อม row
 * floats outside the case card.
 *
 * Dry-run by default. Apply with:
 *   npx tsx scripts/backfill-repair-booking-link.ts --apply
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes("--apply");
/** Both timestamps are `new Date()` in the same transaction. Two seconds is generous. */
const WINDOW_MS = 2000;

async function main() {
  const records = await prisma.maintenanceRecord.findMany({
    where: { type: "CORRECTIVE", repairBookingId: null, adjustmentId: { not: null } },
    select: {
      id: true, itemId: true, createdAt: true, cost: true,
      adjustment: { select: { id: true, adjustedAt: true, previousQty: true, newQty: true, reason: true } },
      item: { select: { code: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!records.length) {
    console.log("ไม่มีแถวที่ต้องแก้ — CORRECTIVE ทุกแถวผูก booking ไว้แล้ว");
    return;
  }

  let linked = 0;
  let skipped = 0;

  for (const r of records) {
    const audit = r.adjustment;
    if (!audit) { skipped++; continue; }
    // The audit row moved the units; the booking it closed holds the same count, on the same
    // item, and was stamped recovered in that same transaction.
    const qty = Math.abs(audit.newQty - audit.previousQty) || null;
    const candidates = await prisma.stockAdjustment.findMany({
      where: {
        itemId: r.itemId,
        reason: "DAMAGED_PENDING_REPAIR",
        recoveredAt: {
          gte: new Date(audit.adjustedAt.getTime() - WINDOW_MS),
          lte: new Date(audit.adjustedAt.getTime() + WINDOW_MS),
        },
        closedBy: { none: {} }, // not already claimed by another record
      },
      select: { id: true, previousQty: true, newQty: true, recoveredAt: true, notes: true },
    });

    const exact = qty == null
      ? candidates
      : candidates.filter((c) => c.previousQty - c.newQty === qty);
    const pick = exact.length === 1 ? exact[0] : candidates.length === 1 ? candidates[0] : null;

    const label = `${r.item.code} ${r.item.name}`;
    if (!pick) {
      skipped++;
      console.log(`SKIP  ${label} — เจอ ${candidates.length} ใบแจ้งที่เข้าเงื่อนไข (ต้องได้ 1)`);
      continue;
    }

    linked++;
    console.log(`LINK  ${label} · งานซ่อม ${r.id} → ใบแจ้ง ${pick.id} (${pick.previousQty - pick.newQty} หน่วย, ${pick.notes ?? "ไม่มีหมายเหตุ"})`);
    if (APPLY) {
      await prisma.maintenanceRecord.update({ where: { id: r.id }, data: { repairBookingId: pick.id } });
    }
  }

  console.log(`\n${APPLY ? "แก้แล้ว" : "จะแก้"} ${linked} แถว · ข้าม ${skipped} แถว`);
  if (!APPLY && linked > 0) console.log("รันจริงด้วย: npx tsx scripts/backfill-repair-booking-link.ts --apply");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
