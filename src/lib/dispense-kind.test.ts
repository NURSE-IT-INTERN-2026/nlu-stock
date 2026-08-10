import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { DISPENSE_KINDS } from "@/lib/dispense-kind";
import { kindWhere, kindSql } from "@/lib/dispense-kind-where";

/**
 * The two things that make the ออกจากคลัง report lie, both silent:
 *   1. kindWhere and kindSql disagree — /api/reports/dispense-history pages over one and
 *      fetches from the other, so rows vanish between the pager and the table.
 *   2. the three kinds don't partition the table — a row in none never appears in any
 *      segment, a row in two is counted twice.
 * Neither is reachable without a database, so this runs against the dev one (read-only).
 * Skipped when DATABASE_URL is unset so the suite still runs without a database.
 */
test("dispense kinds partition the table, and SQL agrees with Prisma", { skip: !process.env.DATABASE_URL }, async () => {
  const total = await prisma.dispenseRecord.count();

  let summed = 0;
  for (const kind of DISPENSE_KINDS) {
    const viaPrisma = await prisma.dispenseRecord.count({ where: kindWhere(kind) });
    const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM dispense_records WHERE ${kindSql(kind)}
    `;
    assert.equal(Number(count), viaPrisma, `${kind}: kindSql กับ kindWhere นับได้ไม่เท่ากัน`);
    summed += viaPrisma;
  }

  // Sum equal to the total is exactly "no gaps and no overlaps" — a row missed by all three
  // makes it short, a row caught by two makes it long.
  assert.equal(summed, total, "สามชนิดรวมกันต้องเท่ากับ dispense_records ทั้งตาราง");

  // The partition must survive the legacy rows too: loanType null predates the column and is
  // treated as BORROW everywhere. Prove at least one arm actually matched something.
  if (total > 0) assert.ok(summed > 0, "ไม่มีแถวไหนเข้าชนิดใดเลย — predicate พัง");

  // Guard the NULL-unsafe trap this file's comment warns about: `not: "INUSE"` would drop
  // every legacy row, so the legacy count must land inside consume+borrow, never nowhere.
  const legacy = await prisma.dispenseRecord.count({ where: { loanType: null } });
  const legacyInKinds = await prisma.dispenseRecord.count({
    where: { AND: [{ loanType: null }, { OR: [kindWhere("consume"), kindWhere("borrow")] as Prisma.DispenseRecordWhereInput[] }] },
  });
  assert.equal(legacyInKinds, legacy, "แถวเก่า (loanType null) ต้องถูกนับเป็นเบิกใช้หรือยืม");
});
