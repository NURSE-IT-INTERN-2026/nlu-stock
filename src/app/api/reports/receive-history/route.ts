import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams, paginate } from "@/lib/api-utils";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  try {
    const params = getSearchParams(request);
    const { page, perPage, skip, take } = paginate(params);

    const dateFrom = params.get("dateFrom") || undefined;
    const dateTo = params.get("dateTo") || undefined;
    const categoryId = params.get("categoryId") || undefined;
    const staffId = params.get("staffId") || undefined;

    const where: Record<string, unknown> = {};
    if (dateFrom || dateTo) {
      where.receivedAt = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
      };
    }
    if (categoryId) where.item = { categoryId };
    if (staffId) where.receivedBy = staffId;

    const [records, total] = await Promise.all([
      prisma.receiveRecord.findMany({
        where,
        include: {
          item: { select: { code: true, name: true, category: { select: { name: true } } } },
          receiver: { select: { name: true } },
          lot: { select: { lotNumber: true, expiryDate: true } },
        },
        orderBy: { receivedAt: "desc" },
        skip,
        take,
      }),
      prisma.receiveRecord.count({ where }),
    ]);

    const data = records.map((r) => ({
      id: r.id,
      itemCode: r.item.code,
      itemName: r.item.name,
      category: r.item.category?.name ?? "—",
      quantity: r.quantity,
      lotNumber: r.lot?.lotNumber ?? "—",
      expiryDate: r.lot?.expiryDate?.toISOString() ?? null,
      receiverName: r.receiver.name,
      receivedAt: r.receivedAt.toISOString(),
      notes: r.notes ?? "",
    }));

    return json({ records: data, page, perPage, total });
  } catch (err) {
    console.error("receive-history error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
