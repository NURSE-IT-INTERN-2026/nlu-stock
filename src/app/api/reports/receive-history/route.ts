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
    // ปุ่มหมวดหมู่เป็น cascade: หยุดที่ชั้นประเภทก็กรองได้
    const profileId = params.get("profileId") || undefined;

    const where: Record<string, unknown> = {};
    if (dateFrom || dateTo) {
      where.receivedAt = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
      };
    }
    if (categoryId) where.item = { categoryId };
    else if (profileId) where.item = { category: { profileId } };

    const [records, total, qty, byItem, unpriced] = await Promise.all([
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
      // Summary is over the whole filtered set, not the page — a counter that changes when you
      // turn the page is worse than no counter.
      prisma.receiveRecord.aggregate({ _sum: { quantity: true }, where }),
      prisma.receiveRecord.groupBy({ by: ["itemId"], where }),
      // ตัวเลขค่าใช้จ่ายรายปีมาจากช่องราคาของแถวพวกนี้ — ต้องเห็นว่ายังค้างกรอกอีกกี่ใบ
      prisma.receiveRecord.count({ where: { ...where, unitCost: null } }),
    ]);

    const data = records.map((r) => ({
      id: r.id,
      itemCode: r.item.code,
      itemName: r.item.name,
      category: r.item.category?.name ?? "—",
      quantity: r.quantity,
      // null = ยังไม่ได้กรอกราคา; ตารางแก้ค่านี้ได้ในบรรทัด (PATCH api/receive/[id]) เพราะ
      // ราคาส่วนใหญ่ในประวัติยังว่างอยู่ และนี่คือที่เดียวที่มองเห็นใบรับเข้าทีละใบ
      unitCost: r.unitCost,
      lotNumber: r.lot?.lotNumber ?? "—",
      expiryDate: r.lot?.expiryDate?.toISOString() ?? null,
      receiverName: r.receiver.name,
      receivedAt: r.receivedAt.toISOString(),
      notes: r.notes ?? "",
    }));

    return json({
      records: data,
      page,
      perPage,
      total,
      summary: { records: total, units: qty._sum.quantity ?? 0, items: byItem.length, unpriced },
    });
  } catch (err) {
    console.error("receive-history error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
