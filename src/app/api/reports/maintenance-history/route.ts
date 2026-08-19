import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams, paginate } from "@/lib/api-utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const { page, perPage, skip, take } = paginate(params);

  const dateFrom = params.get("dateFrom") || undefined;
  const dateTo = params.get("dateTo") || undefined;
  const type = params.get("maintenanceType") || undefined;
  const itemId = params.get("itemId") || undefined;

  const where: Record<string, unknown> = {};
  if (dateFrom || dateTo) {
    where.performedAt = {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
    };
  }
  if (type) where.type = type;
  if (itemId) where.itemId = itemId;

  const [records, total, byType, costAgg] = await Promise.all([
    prisma.maintenanceRecord.findMany({
      where,
      include: {
        item: { select: { code: true, name: true, category: { select: { name: true } }, _count: { select: { subItems: true } } } },
        subItem: { select: { subCode: true } },
        performer: { select: { name: true } },
      },
      orderBy: { performedAt: "desc" },
      skip,
      take,
    }),
    prisma.maintenanceRecord.count({ where }),
    // ตรวจบำรุงตามรอบ กับ ซ่อมเมื่อพัง เป็นคนละเรื่องกันในสายตาคนอ่านรายงาน — สัดส่วนของสองอย่างนี้
    // คือสิ่งที่บอกว่าคลังกำลังดูแลเชิงป้องกันหรือกำลังตามแก้ปัญหา.
    prisma.maintenanceRecord.groupBy({ by: ["type"], where, _count: true }),
    prisma.maintenanceRecord.aggregate({ _sum: { cost: true }, _count: { cost: true }, where }),
  ]);

  const data = records.map((r) => ({
    id: r.id,
    itemCode: r.item.code,
    itemName: r.item.name,
    // Which copy this record is for (null for flat items). subCount feeds effectiveCode
    // so a single-copy item shows the base code and multi-copy shows the -C0n suffix.
    subCode: r.subItem?.subCode ?? null,
    subCount: r.item._count.subItems,
    categoryName: r.item.category.name,
    type: r.type,
    result: r.result,
    issue: r.issue ?? "",
    description: r.description ?? "",
    cost: r.cost ?? 0,
    attachmentUrls: r.attachmentUrls,
    repairVenue: r.repairVenue,
    performer: r.performer.name,
    performedAt: r.performedAt.toISOString(),
  }));

  return json({
    records: data,
    page,
    perPage,
    total,
    summary: {
      preventive: byType.find((g) => g.type === "PREVENTIVE")?._count ?? 0,
      corrective: byType.find((g) => g.type === "CORRECTIVE")?._count ?? 0,
      totalCost: costAgg._sum.cost ?? 0,
      // How many of the records actually carry a cost — without it the total reads as the
      // spend on all repairs when it is the spend on the ones somebody priced.
      costedRecords: costAgg._count.cost,
    },
  });
}
