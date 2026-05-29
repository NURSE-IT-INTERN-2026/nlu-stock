import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams, paginate } from "@/lib/api-utils";
import { NextRequest, NextResponse } from "next/server";
import { USAGE_TYPE_LABELS } from "@/lib/constants";

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

    const where: Record<string, unknown> = {};
    if (dateFrom || dateTo) {
      where.dispensedAt = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
      };
    }
    if (itemId) where.itemId = itemId;
    if (staffId) where.staffId = staffId;
    if (usageType) where.usageType = usageType;

    const [records, total] = await Promise.all([
      prisma.dispenseRecord.findMany({
        where,
        include: {
          item: { select: { code: true, name: true } },
          staff: { select: { name: true } },
          lot: { select: { lotNumber: true } },
        },
        orderBy: { dispensedAt: "desc" },
        skip,
        take,
      }),
      prisma.dispenseRecord.count({ where }),
    ]);

    const data = records.map((r) => ({
      id: r.id,
      itemCode: r.item.code,
      itemName: r.item.name,
      quantity: r.quantity,
      quantitySub: r.quantitySub,
      staffName: r.staff.name,
      usageTypeLabel: r.usageType ? (USAGE_TYPE_LABELS[r.usageType] ?? r.usageType) : "—",
      lotNumber: r.lot?.lotNumber ?? "—",
      dispensedAt: r.dispensedAt.toISOString(),
      notes: r.notes ?? "",
      returnedAt: r.returnedAt?.toISOString() ?? null,
    }));

    return json({ records: data, page, perPage, total });
  } catch (err) {
    console.error("dispense-history error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
