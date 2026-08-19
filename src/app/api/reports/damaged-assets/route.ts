import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams, paginate } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { ItemStatus } from "@/generated/prisma/enums";
import { effectiveCode } from "@/lib/constants";

const DAMAGE_STATUSES: ItemStatus[] = ["DAMAGED", "UNDER_REPAIR", "DISPOSED", "LOST"];

/** ตัดออกจากคลังถาวร — สองสถานะนี้เท่านั้นที่มี "มูลค่าที่เสียไป" ให้คิด */
const WRITE_OFF_STATUSES: ItemStatus[] = ["DISPOSED", "LOST"];

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const { page, perPage, skip, take } = paginate(params);

  const status = params.get("status") || undefined;
  const dateFrom = params.get("dateFrom") || undefined;
  const dateTo = params.get("dateTo") || undefined;

  // รับได้ทั้ง "DAMAGED" และ "DISPOSED,LOST" — หน้าจอแยกเป็นส่วนๆ และส่วนตัดจำหน่ายถือสองสถานะ
  const asked = (status ?? "").split(",").filter((s) => DAMAGE_STATUSES.includes(s as ItemStatus)) as ItemStatus[];
  // ค่าที่ส่งมาไม่รู้จักสักตัว → คืนทั้งหมด ไม่ใช่ `in: []` ที่แปลว่าไม่มีอะไรเลยแบบเงียบๆ
  const statuses: ItemStatus[] = asked.length > 0 ? asked : DAMAGE_STATUSES;

  // A tracked item's damaged/lost pieces don't show in its aggregate status any more
  // (see deriveStatusFromSubItems), so match the pieces directly too — this report is
  // where written-off stock is meant to be found.
  const where: Record<string, unknown> = {
    isActive: true,
    OR: [{ status: { in: statuses } }, { subItems: { some: { status: { in: statuses } } } }],
  };

  if (dateFrom || dateTo) {
    where.statusLogs = {
      some: {
        newStatus: { in: statuses },
        ...(dateFrom || dateTo
          ? {
              changedAt: {
                ...(dateFrom && { gte: new Date(dateFrom) }),
                ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
              },
            }
          : {}),
      },
    };
  }

  // มูลค่าที่ตัดออกไป — ต้องนับจากทุกแถวที่เข้าเงื่อนไข ไม่ใช่แค่หน้าที่กำลังเปิด ไม่งั้นยอดรวม
  // เปลี่ยนไปเรื่อยๆ ตามหน้าที่กด. คิดเฉพาะตอนที่ส่วนนั้นถูกเปิดจริง (ชำรุด/ส่งซ่อมไม่มีมูลค่าให้คิด)
  const wantsWriteOff = statuses.some((s) => WRITE_OFF_STATUSES.includes(s));

  const [items, total, flatByStatus, subsByStatus] = await Promise.all([
    prisma.item.findMany({
      where,
      include: {
        category: { select: { name: true } },
        location: { select: { building: true, floor: true, room: true, detail: true } },
        _count: { select: { subItems: true } },
        subItems: {
          where: { status: { in: statuses } },
          select: { id: true, subCode: true, status: true },
          orderBy: { subCode: "asc" },
        },
        statusLogs: {
          where: { newStatus: { in: statuses } },
          orderBy: { changedAt: "desc" },
          take: 50,
          select: { changedAt: true, reason: true, subItemId: true, repairVenue: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    }),
    prisma.item.count({ where }),
    // Summary counts PIECES, which is what "ตอนนี้อะไรพังอยู่" means to whoever has to chase
    // them; the pager below counts items. A tracked item with 27 damaged copies is one row in
    // the pager and 27 here, so the two numbers are labelled differently on purpose.
    prisma.item.groupBy({
      by: ["status"],
      where: { ...where, subItems: { none: { status: { in: statuses } } } },
      _count: true,
    }),
    prisma.subItem.groupBy({
      by: ["status"],
      where: { status: { in: statuses }, item: where },
      _count: true,
    }),
  ]);

  const writeOffPrices = wantsWriteOff
    ? [
        ...(await prisma.subItem.findMany({
          where: { status: { in: statuses.filter((s) => WRITE_OFF_STATUSES.includes(s)) }, item: where },
          select: { item: { select: { purchasePrice: true } } },
        })).map((s) => s.item.purchasePrice),
        ...(await prisma.item.findMany({
          where: { ...where, status: { in: statuses.filter((s) => WRITE_OFF_STATUSES.includes(s)) }, subItems: { none: { status: { in: statuses } } } },
          select: { purchasePrice: true },
        })).map((i) => i.purchasePrice),
      ]
    : [];

  const byStatus: Record<string, number> = {};
  for (const g of [...flatByStatus, ...subsByStatus]) {
    byStatus[g.status] = (byStatus[g.status] ?? 0) + g._count;
  }

  // Tracked items report per piece (which copy is damaged/lost); non-tracked stay one row.
  // Pagination still counts items, so a page can carry a few more rows than perPage.
  const data = items.flatMap((i) => {
    const locationLabel = [i.location?.building, i.location?.floor, i.location?.room, i.location?.detail]
      .filter(Boolean)
      .join(" / ");
    // ราคาเก็บที่ระดับรายการ ไม่ใช่รายชิ้น — ของที่ซื้อหลายรอบคนละราคา ระบบรู้ราคาเดียว
    // ตัวเลขนี้จึงเป็น "ประมาณการ" เสมอ และหน้าจอต้องเขียนกำกับไว้ ไม่ใช่ยอดที่จ่ายจริงของชิ้นนั้น
    const base = { name: i.name, categoryName: i.category.name, location: locationLabel, value: i.purchasePrice ?? null };
    const logFor = (subItemId: string | null) => i.statusLogs.find((l) => l.subItemId === subItemId);

    if (i.subItems.length > 0) {
      return i.subItems.map((s) => {
        const log = logFor(s.id);
        return {
          ...base,
          id: s.id,
          code: effectiveCode(i.code, s.subCode, i._count.subItems),
          status: s.status,
          reason: log?.reason ?? "",
          repairVenue: log?.repairVenue ?? null,
          changedAt: log?.changedAt.toISOString() ?? "",
        };
      });
    }

    const log = logFor(null) ?? i.statusLogs[0];
    return [{
      ...base,
      id: i.id,
      code: i.code,
      status: i.status,
      reason: log?.reason ?? "",
      repairVenue: log?.repairVenue ?? null,
      changedAt: log?.changedAt.toISOString() ?? "",
    }];
  });

  return json({
    items: data,
    page,
    perPage,
    total,
    summary: {
      damaged: byStatus.DAMAGED ?? 0,
      underRepair: byStatus.UNDER_REPAIR ?? 0,
      writtenOff: (byStatus.DISPOSED ?? 0) + (byStatus.LOST ?? 0),
      disposed: byStatus.DISPOSED ?? 0,
      lost: byStatus.LOST ?? 0,
      /** ประมาณการ: ราคาต่อชิ้นของรายการ × ชิ้นที่ตัดออก — ดูหมายเหตุที่ base ด้านบน */
      writtenOffValue: writeOffPrices.reduce((sum: number, p) => sum + (p ?? 0), 0),
      pricedWriteOffs: writeOffPrices.filter((p) => p !== null).length,
      unpricedWriteOffs: writeOffPrices.filter((p) => p === null).length,
    },
  });
}
