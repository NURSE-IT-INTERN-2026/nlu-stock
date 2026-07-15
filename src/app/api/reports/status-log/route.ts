import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams, paginate } from "@/lib/api-utils";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  try {
    const params = getSearchParams(request);
    const { page, perPage, skip, take } = paginate(params);

    const from = params.get("from") || undefined; // previousStatus
    const to = params.get("to") || undefined; // newStatus
    const dateFrom = params.get("dateFrom") || undefined;
    const dateTo = params.get("dateTo") || undefined;
    const categoryId = params.get("categoryId") || undefined;
    const staffId = params.get("staffId") || undefined;

    const where: Record<string, unknown> = {};
    if (from) where.previousStatus = from;
    if (to) where.newStatus = to;
    if (dateFrom || dateTo) {
      where.changedAt = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
      };
    }
    if (categoryId) where.item = { categoryId };
    if (staffId) where.changedBy = staffId;

    const [records, total] = await Promise.all([
      prisma.itemStatusLog.findMany({
        where,
        include: {
          item: { select: { code: true, name: true, category: { select: { name: true } } } },
          subItem: { select: { subCode: true } },
          changer: { select: { name: true } },
        },
        orderBy: { changedAt: "desc" },
        skip,
        take,
      }),
      prisma.itemStatusLog.count({ where }),
    ]);

    const data = records.map((r) => ({
      id: r.id,
      itemCode: r.item.code,
      itemName: r.item.name,
      category: r.item.category?.name ?? "—",
      subCode: r.subItem?.subCode ?? null,
      previousStatus: r.previousStatus,
      newStatus: r.newStatus,
      reason: r.reason ?? "",
      changerName: r.changer.name,
      changedAt: r.changedAt.toISOString(),
    }));

    return json({ records: data, page, perPage, total });
  } catch (err) {
    console.error("status-log error:", err);
    return NextResponse.json({ error: "โหลดสถานะไม่สำเร็จ" }, { status: 500 });
  }
}
