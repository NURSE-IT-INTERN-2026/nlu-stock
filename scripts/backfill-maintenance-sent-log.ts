/**
 * One-time backfill: point finished บำรุงรักษาภายนอก rounds at the ส่งบำรุงรักษาภายนอก log they
 * closed (maintenance_records.sentLogId), for rows written before that column existed.
 *
 * This one IS safe to write down, unlike the repairBookingId backfill next door: the pairing rule
 * used here — newest log that ENTERED กำลังบำรุงรักษา for this piece before the record was written
 * — is the exact rule lib/cases getCase has always used to draw the "ส่งบำรุงรักษาภายนอก" step on
 * the case card. The link is therefore not a new guess; it is the screen's existing answer, stored.
 *
 * It also moves the case number. An open trip and the record that closes it are one case, so both
 * halves key their MC number off the log row (see lib/case-codes). A legacy record whose number was
 * issued against `maint:<recordId>` would otherwise be renumbered the moment the code starts reading
 * the log — which is the one thing case_codes exists to prevent. Rewriting the key keeps the number.
 *
 * Dry-run by default. Apply with:
 *   npx tsx scripts/backfill-maintenance-sent-log.ts --apply
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const APPLY = process.argv.includes("--apply");

async function main() {
  const records = await prisma.maintenanceRecord.findMany({
    where: { type: "PREVENTIVE", repairVenue: "EXTERNAL", sentLogId: null },
    select: {
      id: true, itemId: true, subItemId: true, createdAt: true,
      item: { select: { code: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`ใบบำรุงรักษาภายนอกที่ยังไม่ผูกใบส่ง: ${records.length}`);
  let linked = 0, renumbered = 0, skipped = 0;

  for (const r of records) {
    const sent = await prisma.itemStatusLog.findFirst({
      where: {
        itemId: r.itemId,
        subItemId: r.subItemId,
        newStatus: "PENDING_MAINTENANCE",
        previousStatus: { not: "PENDING_MAINTENANCE" },
        changedAt: { lte: r.createdAt },
      },
      orderBy: { changedAt: "desc" },
      select: { id: true, changedAt: true },
    });
    const label = `${r.item.code} ${r.item.name}`;
    if (!sent) {
      console.log(`  ข้าม ${label} — ไม่พบใบส่งก่อนวันบันทึกผล`);
      skipped++;
      continue;
    }
    // Two records cannot close the same departure. If one already has it, this record belongs to a
    // trip whose departure row is missing (deleted, or predates logging) — leave it unlinked.
    const taken = await prisma.maintenanceRecord.findFirst({
      where: { sentLogId: sent.id, id: { not: r.id } },
      select: { id: true },
    });
    if (taken) {
      console.log(`  ข้าม ${label} — ใบส่งนี้ถูกใบอื่นผูกไปแล้ว`);
      skipped++;
      continue;
    }

    const from = `maint:${r.id}`;
    const to = `log:${sent.id}`;
    const [code, clash] = await Promise.all([
      prisma.caseCode.findUnique({ where: { sourceKey: from } }),
      prisma.caseCode.findUnique({ where: { sourceKey: to } }),
    ]);

    console.log(
      `  ${label} → ใบส่ง ${sent.changedAt.toISOString()}` +
        (code && !clash ? ` · ย้ายเลข ${code.be}-${code.seq}` : code ? " · เลขชนกัน ไม่ย้าย" : " · ยังไม่เคยมีเลข"),
    );
    if (!APPLY) { linked++; continue; }

    await prisma.$transaction(async (tx) => {
      await tx.maintenanceRecord.update({ where: { id: r.id }, data: { sentLogId: sent.id } });
      if (code && !clash) {
        await tx.caseCode.update({ where: { sourceKey: from }, data: { sourceKey: to } });
        renumbered++;
      }
    });
    linked++;
  }

  console.log(
    `\n${APPLY ? "เขียนแล้ว" : "ทดลอง (ยังไม่เขียน)"}: ผูก ${linked} · ย้ายเลขเคส ${renumbered} · ข้าม ${skipped}`,
  );
  if (!APPLY) console.log("ใส่ --apply เพื่อเขียนจริง");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
