import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth, json, getSearchParams, paginate } from "@/lib/api-utils";
import { NextRequest, NextResponse } from "next/server";
import { USAGE_TYPE_LABELS } from "@/lib/constants";
import type { UsageType } from "@/generated/prisma/enums";

/**
 * ประวัติการเบิก — paginated by LOAN EVENT, not by row.
 *
 * One borrow is several DispenseRecord rows sharing a loanGroupId, and the tab renders them
 * as a single card with "คืนบางส่วน 6/13" summed across the rows. Paging raw rows split those
 * cards down the middle: a loan of 11 lines straddling the boundary rendered as two cards
 * reading "คืนบางส่วน 5/8" and "คืนบางส่วน 1/5", neither of them the truth, with the item and
 * unit counts halved to match. Both halves looked like complete, self-consistent loans.
 *
 * So the page is a page of groups. Step 1 asks which groups fall on it; step 2 fetches every
 * row belonging to them. `total` is therefore a count of loan events, which is what the tab's
 * pager and footer count. Rows with no loanGroupId (consumable draws, legacy borrows) are
 * their own group of one, so they page alongside without special-casing.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  try {
    const params = getSearchParams(request);
    const { page, perPage, skip, take } = paginate(params);

    const dateFrom = params.get("dateFrom") || undefined;
    const dateTo = params.get("dateTo") || undefined;
    const itemId = params.get("itemId") || undefined;
    const staffId = params.get("staffId") || undefined;
    const usageType = params.get("usageType") || undefined;

    const where: Prisma.DispenseRecordWhereInput = {};
    if (dateFrom || dateTo) {
      where.dispensedAt = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
      };
    }
    if (itemId) where.itemId = itemId;
    if (staffId) where.staffId = staffId;
    if (usageType) where.usageType = usageType as UsageType;

    // Same filters as the Prisma `where` above, for the raw grouping query. Kept adjacent so
    // the two cannot drift: a filter added to one and not the other pages over a different
    // set than it fetches, which reads as rows silently vanishing.
    const conds: Prisma.Sql[] = [];
    if (dateFrom) conds.push(Prisma.sql`"dispensedAt" >= ${new Date(dateFrom)}`);
    if (dateTo) conds.push(Prisma.sql`"dispensedAt" <= ${new Date(dateTo + "T23:59:59")}`);
    if (itemId) conds.push(Prisma.sql`"itemId" = ${itemId}`);
    if (staffId) conds.push(Prisma.sql`"staffId" = ${staffId}`);
    if (usageType) conds.push(Prisma.sql`"usageType"::text = ${usageType}`);
    const whereSql = conds.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}` : Prisma.empty;

    // Step 1 — the page of loan events. Ordered by when the event happened, with the key as
    // a tiebreaker: rows of one dispense share a timestamp to the millisecond, so without it
    // Postgres is free to order ties differently per query and a row could appear on two
    // pages or none.
    const [keyRows, totalRows] = await Promise.all([
      prisma.$queryRaw<{ key: string }[]>`
        SELECT COALESCE("loanGroupId", id) AS key, MAX("dispensedAt") AS at
        FROM dispense_records
        ${whereSql}
        GROUP BY COALESCE("loanGroupId", id)
        ORDER BY at DESC, key DESC
        LIMIT ${take} OFFSET ${skip}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM (
          SELECT COALESCE("loanGroupId", id)
          FROM dispense_records
          ${whereSql}
          GROUP BY COALESCE("loanGroupId", id)
        ) g
      `,
    ]);

    const keys = keyRows.map((r) => r.key);
    const total = Number(totalRows[0]?.count ?? 0);

    // Step 2 — every row of those events. The key is loanGroupId when set and the row's own
    // id when not, so matching it takes both arms.
    const records = keys.length === 0 ? [] : await prisma.dispenseRecord.findMany({
      where: {
        ...where,
        OR: [{ loanGroupId: { in: keys } }, { loanGroupId: null, id: { in: keys } }],
      },
      include: {
        item: { select: { code: true, name: true, category: { select: { profile: { select: { dispenseType: true } } } } } },
        staff: { select: { name: true } },
        lot: { select: { lotNumber: true } },
      },
      orderBy: [{ dispensedAt: "desc" }, { id: "desc" }],
    });

    const data = records.map((r) => ({
      id: r.id,
      itemCode: r.item.code,
      itemName: r.item.name,
      quantity: r.quantity,
      resolvedQty: r.resolvedQty,
      staffName: r.staff.name,
      usageTypeLabel: r.usageType ? (USAGE_TYPE_LABELS[r.usageType] ?? r.usageType) : "—",
      lotNumber: r.lot?.lotNumber ?? "—",
      dispensedAt: r.dispensedAt.toISOString(),
      notes: r.notes ?? "",
      returnedAt: r.returnedAt?.toISOString() ?? null,
      returnCondition: r.returnCondition,
      loanGroupId: r.loanGroupId,
      recipient: r.recipient ?? null,
      // เบิกใช้แล้วทิ้ง (CONSUMABLE) never comes back — returnedAt stays null forever, so it
      // must not render as an unresolved "loan group" alongside real borrows/INUSE.
      isLoanable: r.item.category.profile?.dispenseType !== "CONSUMABLE",
    }));

    // total counts loan events, so the tab must not label it "records" — see the footer.
    return json({ records: data, page, perPage, total });
  } catch (err) {
    console.error("dispense-history error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
