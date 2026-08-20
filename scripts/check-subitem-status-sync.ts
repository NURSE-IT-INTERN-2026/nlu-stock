/**
 * SubItem.status vs ItemStatusLog — the two must agree, and every report that prices
 * ชำรุด/สูญหาย reads status, so a piece stuck on LOST after its history says it came back
 * is money on a report for stock sitting in the storeroom.
 *
 * A piece's status should equal the newStatus of its most recent log row. Pieces with no
 * log at all are untouched: they never left AVAILABLE, so there is nothing to compare.
 *
 * Drift splits in two, and only one half is safe to repair:
 *
 *   fixable  — no open dispense record. Nothing says the piece is out, so the status is the
 *              side that is wrong and the log is the record. Sync status ← latest log.
 *   held     — an open ยืม/นำไปใช้งาน record still names this piece. The piece really is out,
 *              whatever a stale AVAILABLE log line claims, and rewriting its status would
 *              hand borrowed stock back to the available pool. Reported, never touched.
 *
 * Dry-run by default — this is the consistency check, run it whenever the ชำรุด/สูญหาย
 * numbers look off:
 *   npx tsx scripts/check-subitem-status-sync.ts
 * Repair the fixable half (status ← latest log, then recompute the parent's counts):
 *   npx tsx scripts/check-subitem-status-sync.ts --apply
 *
 * Exits 1 when drift is found in dry-run, so CI can fail on it.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { recomputeItemCounts } from "../src/lib/stock";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes("--apply");

async function main() {
  const subs = await prisma.subItem.findMany({
    select: {
      id: true,
      subCode: true,
      status: true,
      itemId: true,
      item: { select: { code: true } },
      statusLogs: {
        select: { newStatus: true, reason: true, changedAt: true },
        orderBy: { changedAt: "desc" },
        take: 1,
      },
      dispenseRecords: {
        where: { returnedAt: null },
        select: { loanType: true },
        take: 1,
      },
    },
    orderBy: { itemId: "asc" },
  });

  const withLog = subs.filter((s) => s.statusLogs.length > 0);
  const drifted = withLog.filter((s) => s.statusLogs[0].newStatus !== s.status);
  const fixable = drifted.filter((s) => s.dispenseRecords.length === 0);
  const held = drifted.filter((s) => s.dispenseRecords.length > 0);

  const line = (s: (typeof drifted)[number]) => {
    const log = s.statusLogs[0];
    return (
      `  ${s.item.code} / ${s.subCode}  status=${s.status}  →  ${log.newStatus}` +
      `   [${log.changedAt.toISOString().slice(0, 10)} ${log.reason}]`
    );
  };

  console.log(`Mode: ${APPLY ? "APPLY (real writes)" : "DRY-RUN (no writes)"}`);
  console.log(`Sub-items: ${subs.length}  (with status history: ${withLog.length})`);
  console.log(`Out of sync with their latest log: ${drifted.length}`);
  console.log(`  → fixable (no open dispense record): ${fixable.length}`);
  console.log(`  → held    (still out on an open record, left alone): ${held.length}`);
  console.log("");

  if (drifted.length === 0) {
    console.log("All sub-item statuses agree with their history.");
    return;
  }

  if (fixable.length) {
    console.log("FIXABLE — status will follow the log:");
    fixable.forEach((s) => console.log(line(s)));
    console.log("");
  }
  if (held.length) {
    console.log("HELD — piece is out on an open record; the log line is the stale side:");
    held.forEach((s) => console.log(`${line(s)}  [open ${s.dispenseRecords[0].loanType}]`));
    console.log("");
  }

  if (!APPLY) {
    console.log("Dry-run only. Re-run with --apply to sync the fixable bucket.");
    process.exitCode = 1;
    return;
  }

  // Counts are derived from the pieces (lib/stock recomputeItemCounts), so a status that
  // moves has to be followed by a recompute or the parent keeps the old availableQty.
  const touchedItems = new Set<string>();
  for (const s of fixable) {
    await prisma.subItem.update({
      where: { id: s.id },
      data: { status: s.statusLogs[0].newStatus },
    });
    touchedItems.add(s.itemId);
  }
  for (const itemId of touchedItems) {
    await prisma.$transaction((tx) => recomputeItemCounts(tx, itemId));
  }

  console.log(`Synced ${fixable.length} sub-items across ${touchedItems.size} items.`);
  if (held.length) console.log(`Left ${held.length} held pieces untouched.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
