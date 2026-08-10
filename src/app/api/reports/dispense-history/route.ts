import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth, json, getSearchParams, paginate } from "@/lib/api-utils";
import { NextRequest, NextResponse } from "next/server";
import { USAGE_TYPE_LABELS, locationLabel } from "@/lib/constants";
import { parseDispenseKind } from "@/lib/dispense-kind";
import { kindWhere, kindSql } from "@/lib/dispense-kind-where";
import type { UsageType } from "@/generated/prisma/enums";

/**
 * ประวัติการออกจากคลัง — paginated by LOAN EVENT, not by row.
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
 *
 * `loanStatus=open|overdue` narrows the same page to loans still owed back — this is what the
 * separate ยืมค้าง tab used to be, folded in here so the two cannot disagree about which loans
 * are outstanding. `summary` is computed over the whole kind, ignoring loanStatus, so the
 * counters keep reading the same whichever status is selected.
 *
 * `kind=consume|borrow|inuse` (default consume) picks WHICH of the three events this is a
 * report of — see lib/dispense-kind. Every query below is filtered by it, including the raw
 * one, because a page counted over one set and fetched over another reads as missing rows.
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
    const loanStatus = params.get("loanStatus") || undefined; // "open" | "overdue"
    // ผู้รับ is free text typed at the cart, so this is a contains-match, not an id. Trimmed
    // because a stray space makes an otherwise-matching search return nothing.
    const recipient = params.get("recipient")?.trim() || undefined;
    const kind = parseDispenseKind(params.get("kind"));

    const where: Prisma.DispenseRecordWhereInput = { ...kindWhere(kind) };
    if (dateFrom || dateTo) {
      where.dispensedAt = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
      };
    }
    if (itemId) where.itemId = itemId;
    if (staffId) where.staffId = staffId;
    if (usageType) where.usageType = usageType as UsageType;
    if (recipient) where.recipient = { contains: recipient, mode: "insensitive" };

    // Same filters as the Prisma `where` above, for the raw grouping query. Kept adjacent so
    // the two cannot drift: a filter added to one and not the other pages over a different
    // set than it fetches, which reads as rows silently vanishing.
    const conds: Prisma.Sql[] = [kindSql(kind)];
    if (dateFrom) conds.push(Prisma.sql`"dispensedAt" >= ${new Date(dateFrom)}`);
    if (dateTo) conds.push(Prisma.sql`"dispensedAt" <= ${new Date(dateTo + "T23:59:59")}`);
    if (itemId) conds.push(Prisma.sql`"itemId" = ${itemId}`);
    if (staffId) conds.push(Prisma.sql`"staffId" = ${staffId}`);
    if (usageType) conds.push(Prisma.sql`"usageType"::text = ${usageType}`);
    if (recipient) conds.push(Prisma.sql`"recipient" ILIKE ${`%${recipient}%`}`);
    // kindSql always contributes one, so conds is never empty.
    const whereSql = Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}`;

    // Step 0 — what is still out, inside the same filters: unreturned loans for borrow,
    // stock still sitting in a room for inuse. Bounded by how much stock is out at once, so
    // pulling the whole set is cheap; it feeds both the summary counters and, when
    // loanStatus is set, the list of keys the page is allowed to show.
    //
    // Skipped for เบิกใช้: a consumable's returnedAt stays null forever, so "still out" would
    // match every row ever written and mean nothing. Its summary counts units instead.
    const owed = kind === "consume" ? [] : await prisma.dispenseRecord.findMany({
      where: { ...where, returnedAt: null },
      select: { id: true, loanGroupId: true, quantity: true, resolvedQty: true, dueAt: true },
    });

    const now = new Date();
    const openKeys = new Set<string>();
    const overdueKeys = new Set<string>();
    let openUnits = 0;
    let overdueUnits = 0;
    for (const r of owed) {
      const key = r.loanGroupId ?? r.id;
      openKeys.add(key);
      openUnits += r.quantity - r.resolvedQty;
      // นำไปใช้งาน has no dueAt by construction, so overdue stays 0 there on its own.
      if (r.dueAt && r.dueAt < now) {
        overdueKeys.add(key);
        overdueUnits += r.quantity - r.resolvedQty;
      }
    }

    const restrictKeys =
      loanStatus === "overdue" ? [...overdueKeys] :
      loanStatus === "open" ? [...openKeys] :
      null;

    // ANY('{}') matches nothing, which is the right answer for "ยังไม่คืน" with none outstanding.
    const pageWhereSql = restrictKeys === null
      ? whereSql
      : Prisma.sql`${whereSql} AND COALESCE("loanGroupId", id) = ANY(${restrictKeys})`;

    // Step 1 — the page of loan events. Ordered by when the event happened, with the key as
    // a tiebreaker: rows of one dispense share a timestamp to the millisecond, so without it
    // Postgres is free to order ties differently per query and a row could appear on two
    // pages or none.
    const [keyRows, totalRows, unitsAgg] = await Promise.all([
      prisma.$queryRaw<{ key: string }[]>`
        SELECT COALESCE("loanGroupId", id) AS key, MAX("dispensedAt") AS at
        FROM dispense_records
        ${pageWhereSql}
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
      // หน่วยที่จ่ายออก — the number เบิกใช้ is actually about. Counted over rows, not events.
      prisma.dispenseRecord.aggregate({ _sum: { quantity: true }, where }),
    ]);

    const keys = keyRows.map((r) => r.key);
    // The count query stays unrestricted (it is the summary's "การเบิกในช่วงนี้"); when a
    // loanStatus narrows the list, the restricted key list already IS the exact total.
    const totalAll = Number(totalRows[0]?.count ?? 0);
    const total = restrictKeys === null ? totalAll : restrictKeys.length;

    // Step 2 — every row of those events. The key is loanGroupId when set and the row's own
    // id when not, so matching it takes both arms.
    //
    // AND, not a spread: `where` carries the kind's own OR (loanType null|BORROW) and a
    // second OR key would overwrite it, quietly widening the page back to every kind.
    const records = keys.length === 0 ? [] : await prisma.dispenseRecord.findMany({
      where: {
        AND: [where, { OR: [{ loanGroupId: { in: keys } }, { loanGroupId: null, id: { in: keys } }] }],
      },
      include: {
        item: { select: { code: true, name: true } },
        staff: { select: { name: true } },
        lot: { select: { lotNumber: true } },
        location: { select: { building: true, floor: true, room: true, detail: true } },
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
      // Collected on every เบิก (cart asks for รายวิชา / ระบุกิจกรรม) but never surfaced in a
      // report until the detail dialog. Event-level fields — the cart posts one per dispense.
      courseCode: r.courseCode,
      usageNote: r.usageNote,
      lotNumber: r.lot?.lotNumber ?? "—",
      dispensedAt: r.dispensedAt.toISOString(),
      dueAt: r.dueAt?.toISOString() ?? null,
      notes: r.notes ?? "",
      returnedAt: r.returnedAt?.toISOString() ?? null,
      returnCondition: r.returnCondition,
      loanGroupId: r.loanGroupId,
      recipient: r.recipient ?? null,
      // นำไปใช้งาน only — where the stock was placed. Rows written before the location was
      // mandatory have none; say so rather than render an empty cell.
      location: r.location ? locationLabel(r.location) : null,
    }));

    // total counts loan events, so the tab must not label it "records" — see the footer.
    return json({
      records: data,
      page,
      perPage,
      total,
      summary: {
        events: totalAll,
        units: unitsAgg._sum.quantity ?? 0,
        openEvents: openKeys.size,
        openUnits,
        overdueEvents: overdueKeys.size,
        overdueUnits,
      },
    });
  } catch (err) {
    console.error("dispense-history error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
