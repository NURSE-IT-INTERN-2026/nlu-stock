import { Prisma } from "@/generated/prisma/client";
import type { DispenseKind } from "@/lib/dispense-kind";

// Server half of lib/dispense-kind — the two predicates that turn a DispenseKind into a
// query. Separate file because the kind labels are read by a client component and this one
// pulls in the Prisma runtime.

// Listed explicitly rather than `not: "INUSE"`: the column is NOT NULL now so the trap that
// used to make that unsafe is gone, but naming the two values keeps this honest when a third
// one is added — `not: "INUSE"` would quietly sweep it in here.
const NOT_INUSE: Prisma.DispenseRecordWhereInput = {
  loanType: { in: ["BORROW", "CONSUME"] },
};

/** Which DispenseTypes a kind can own. inuse spans the same two as borrow — what separates
 *  the two is loanType, which lives on the record, not on the item. */
export function kindDispenseTypes(kind: DispenseKind) {
  return kind === "consume"
    ? { in: ["CONSUMABLE" as const] }
    : { in: ["COUNT" as const, "ITEM" as const] };
}

/** The loanType half of the predicate, without the item filter — the dashboard AND-s its own
 *  ประเภท/หมวดย่อย narrowing onto the item side and would otherwise overwrite this one's. */
export function kindLoanWhere(kind: DispenseKind): Prisma.DispenseRecordWhereInput {
  return kind === "inuse" ? { loanType: "INUSE" } : NOT_INUSE;
}

/** Prisma where fragment. */
export function kindWhere(kind: DispenseKind): Prisma.DispenseRecordWhereInput {
  if (kind === "inuse") return { loanType: "INUSE" };
  return { ...NOT_INUSE, item: { category: { profile: { dispenseType: kindDispenseTypes(kind) } } } };
}

// The same predicate in SQL, for the raw group-paging query in api/reports/dispense-history.
// Kept beside kindWhere so the two cannot drift: a page query that selects a different set
// than the fetch query reads as rows vanishing.
function profileIs(types: string[]): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM items i
    JOIN categories c ON c.id = i."categoryId"
    JOIN category_profiles p ON p.id = c."profileId"
    WHERE i.id = dispense_records."itemId" AND p."dispenseType"::text = ANY(${types})
  )`;
}

/** SQL predicate on dispense_records, matching kindWhere row for row. */
export function kindSql(kind: DispenseKind): Prisma.Sql {
  if (kind === "inuse") return Prisma.sql`"loanType"::text = 'INUSE'`;
  const notInuse = Prisma.sql`"loanType"::text IN ('BORROW', 'CONSUME')`;
  const types = kind === "consume" ? ["CONSUMABLE"] : ["COUNT", "ITEM"];
  return Prisma.sql`${notInuse} AND ${profileIs(types)}`;
}
