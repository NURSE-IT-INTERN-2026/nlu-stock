import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams, paginate } from "@/lib/api-utils";
import { isSelfBorrower } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;

  const searchParams = getSearchParams(req);
  const { page, perPage, skip, take } = paginate(searchParams);

  const q = searchParams.get("q")?.trim() ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const profileId = searchParams.get("profileId") ?? "";
  // Explicit id list — used by ชุดประกอบ to load the kit's consumables with their real lots
  // and location, so the cart it prefills is built from the same shape the picker uses.
  const ids = (searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  // Location cascade filter (building → floor → room → detail)
  const building = searchParams.get("building") ?? "";
  const floor = searchParams.get("floor") ?? "";
  const room = searchParams.get("room") ?? "";
  const detail = searchParams.get("detail") ?? "";
  const hasLoc = building || floor || room || detail;

  // BORROWER สแกน/เลือกของเอง — this grid is their catalogue, so it must not list a single
  // row they are not allowed to take. Both switches are ANDed the same way lib/self-borrow
  // reads them: the ประเภท closes a whole class of stock, the item closes one exception.
  // Availability is deliberately NOT filtered here — ของหมดยังต้องเห็น (the card says หมด);
  // hiding it makes a shelf that exists look like a shelf that does not.
  const borrowerOnly = isSelfBorrower(auth.user.role);
  // One `category` key: profileId and the borrower gate both write to it, and two spreads
  // would silently drop whichever landed first.
  const categoryFilter = {
    ...(profileId && { profileId }),
    ...(borrowerOnly && { profile: { selfBorrowable: true } }),
  };

  const where = {
    isActive: true,
    ...(borrowerOnly && { selfBorrowable: true }),
    ...(ids.length > 0 && { id: { in: ids } }),
    ...(q && {
      OR: [
        { code: { contains: q, mode: "insensitive" as const } },
        { name: { contains: q, mode: "insensitive" as const } },
        { nameEn: { contains: q, mode: "insensitive" as const } },
      ],
    }),
    ...(categoryId && { categoryId }),
    ...(Object.keys(categoryFilter).length > 0 && { category: categoryFilter }),
    ...(hasLoc && {
      location: {
        ...(building && { building }),
        ...(floor && { floor }),
        ...(room && { room }),
        ...(detail && { detail }),
      },
    }),
  };

  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      include: {
        category: { select: { name: true, profile: { select: { name: true, dispenseType: true, assetTracking: true, color: true, selfBorrowable: true, selfBorrowLimit: true } } } },
        issueUnit: { select: { id: true, name: true } },
        lots: {
          where: { remainingQty: { gt: 0 } },
          // FEFO first; date-coded lots (no expiry) all tie, so fall back to FIFO on
          // receivedDate — otherwise their order is whatever the DB feels like.
          orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { receivedDate: "asc" }],
          select: { id: true, lotNumber: true, expiryDate: true, remainingQty: true },
        },
        subItems: {
          where: { status: "AVAILABLE" },
          select: { id: true, subCode: true, status: true, condition: true },
        },
        location: { select: { building: true, floor: true, room: true, detail: true } },
      },
      orderBy: { name: "asc" },
      skip,
      take,
    }),
    prisma.item.count({ where }),
  ]);

  // include คืน scalar ของ Item มาทั้งแถว — ราคาทุนกับผู้ขายจึงติดมาด้วยทั้งที่กริดไม่วาดมัน
  // และตะแกรงนี้คือแคตตาล็อกของ BORROWER. ตัดที่ payload เหมือน /api/items/:id: null ไม่ใช่
  // ลบคีย์ทิ้ง ทุกฟิลด์ nullable อยู่แล้ว ฝั่ง UI จึงไม่ต้องแก้อะไร
  const scrubbed = borrowerOnly
    ? items.map((i) => ({ ...i, purchasePrice: null, vendorCompany: null, vendorContact: null, vendorPhone: null }))
    : items;

  return json({ items: scrubbed, total, page, perPage });
}
