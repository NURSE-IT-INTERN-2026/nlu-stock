import { Prisma } from "@/generated/prisma/client";
import type { DispenseKind } from "@/lib/dispense-kind";

// Server half of lib/dispense-kind — the two predicates that turn a DispenseKind into a
// query. Separate file because the kind labels are read by a client component and this one
// pulls in the Prisma runtime.

// Explicit OR, never `loanType: { not: "INUSE" }` — that compiles to a NULL-unsafe
// comparison and silently drops every legacy row. Same trap as api/returns/route.ts.
const NOT_INUSE: Prisma.DispenseRecordWhereInput = {
  OR: [{ loanType: null }, { loanType: "BORROW" }],
};

/** Prisma where fragment. */
export function kindWhere(kind: DispenseKind): Prisma.DispenseRecordWhereInput {
  if (kind === "inuse") return { loanType: "INUSE" };
  const dispenseType = kind === "consume"
    ? { in: ["CONSUMABLE" as const] }
    : { in: ["COUNT" as const, "ITEM" as const] };
  return { ...NOT_INUSE, item: { category: { profile: { dispenseType } } } };
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
  const notInuse = Prisma.sql`("loanType" IS NULL OR "loanType"::text = 'BORROW')`;
  const types = kind === "consume" ? ["CONSUMABLE"] : ["COUNT", "ITEM"];
  return Prisma.sql`${notInuse} AND ${profileIs(types)}`;
}
