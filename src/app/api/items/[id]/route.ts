import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin, json, notFound, error, parseBody } from "@/lib/api-utils";
import { locationLabel } from "@/lib/constants";
import { getItemDistribution, withoutCustodyNames } from "@/lib/distribution";
import { isSelfBorrower } from "@/lib/roles";
import { z } from "zod";
import { isSafeImageSrc } from "@/lib/attachments";
import { NextRequest } from "next/server";

// ponytail: only the fields this endpoint mutates — no blanket item update (settings PUT owns the rest).
const imageSrc = z.string().refine(isSafeImageSrc, "ลิงก์รูปไม่ถูกต้อง");

const patchSchema = z.object({
  imageUrl: imageSrc.nullable().optional(),
  images: z.array(imageSrc).optional(),
  locationId: z.string().nullable().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  // นศ./บุคลากรที่สแกน QR เข้ามาเห็นได้ว่าชิ้นไหน "ถูกยืม" แต่ไม่เห็นว่าใครยืม. ทุก relation
  // ข้างล่างพ่วงชื่อคนมาด้วย (staff/receiver/performer/changer/adjuster) และแถวเบิกยังพก
  // recipient/courseCode/usageNote มาอีก — ซึ่งเป็นข้อมูลชุดเดียวกับที่ proxy ปิด
  // /api/reports ไว้เพื่อกัน. สถานะของชิ้นพอบอกว่าถูกยืมอยู่แล้ว จึงตัดเฉพาะตัวคน ไม่ใช่ตัดทั้งหน้า.
  const borrower = isSelfBorrower(auth.user.role);

  const item = await prisma.item.findFirst({
    where: { OR: [{ id }, { code: id }] },
    include: {
      category: { include: { profile: true } },
      location: true,
      issueUnit: true,
      // location + the one open loan per piece so the detail page can render the sub-code
      // table off this response. Those two used to come from a second call to
      // /api/settings/items/:id/sub-items, which is requireAdmin — so the table sat empty
      // and the count read "0 ชิ้น" for every EXECUTIVE and BORROWER who opened a copy.
      subItems: {
        orderBy: { subCode: "asc" },
        include: {
          location: true,
          // วันรับเข้าของชิ้นนี้ — อายุของบนหน้ารายละเอียดนับจากตรงนี้ (lib/format ageFromReceipt).
          // A date, not a person, so borrowers see it too.
          receiveRecord: { select: { receivedAt: true } },
          ...(borrower
            ? {}
            : {
                dispenseRecords: {
                  where: { returnedAt: null },
                  orderBy: { dispensedAt: "desc" as const },
                  take: 1,
                  include: { staff: { select: { name: true } } },
                },
              }),
        },
      },
      // receivedDate breaks the tie between date-coded lots, which carry no expiry.
      lots: { orderBy: [{ expiryDate: "asc" }, { receivedDate: "asc" }] },
      // The five "who did what" lists. Every one of them names a person, so a borrower gets
      // none of them — see `borrower` above. The empty arrays are put back below because the
      // page indexes into these keys.
      ...(borrower
        ? {}
        : {
            dispenseRecords: {
              take: 5,
              orderBy: { dispensedAt: "desc" as const },
              include: { staff: { select: { name: true } } },
            },
            receiveRecords: {
              take: 5,
              orderBy: { receivedAt: "desc" as const },
              include: { receiver: { select: { name: true } } },
            },
            maintenanceRecords: {
              take: 5,
              orderBy: { performedAt: "desc" as const },
              include: { performer: { select: { name: true } } },
            },
            statusLogs: {
              take: 5,
              orderBy: { changedAt: "desc" as const },
              include: { changer: { select: { name: true } } },
            },
            adjustments: {
              take: 5,
              orderBy: { adjustedAt: "desc" as const },
              include: { adjuster: { select: { name: true } } },
            },
          }),
      // ponytail: include ทุก row (ไม่ take) — kit BOM มักไม่กี่แถว, ต้องการ count + full list ใน detail
      kitComponents: {
        orderBy: { sortOrder: "asc" },
        include: {
          componentItem: { select: { code: true, name: true, availableQty: true } },
          unit: { select: { name: true } },
        },
      },
    },
  });

  if (!item) return notFound("Item not found");

  // Derived, not stored — see lib/distribution.ts. Folded into this response rather than
  // given its own endpoint so the detail page can't render a location breakdown that
  // disagrees with the counts printed beside it.
  // ถูกยืม rows are named after whoever holds the units, so a borrower gets them folded into
  // one anonymous row — see withoutCustodyNames.
  const rows = await getItemDistribution(item.id);
  const distribution = borrower ? withoutCustodyNames(rows) : rows;

  // The individual แจ้งชำรุด bookings behind the ชำรุด row above, still awaiting repair.
  // รับคืนจากซ่อม resolves one booking at a time (it stamps recoveredAt on the row), so the
  // dialog needs the rows, not just the total — same reason the return screen lists loans.
  // A borrower has no รับคืนจากซ่อม dialog, and the rows name who filed them, so they get none.
  const openDamage = borrower
    ? []
    : (
        await prisma.stockAdjustment.findMany({
          where: { itemId: item.id, reason: "DAMAGED_PENDING_REPAIR", recoveredAt: null },
          select: { id: true, previousQty: true, newQty: true, notes: true, adjustedAt: true, repairSentAt: true, adjuster: { select: { name: true } } },
          orderBy: { adjustedAt: "desc" },
        })
      ).map((r) => ({ id: r.id, qty: r.previousQty - r.newQty, notes: r.notes, adjustedAt: r.adjustedAt, repairSentAt: r.repairSentAt, by: r.adjuster.name }));

  // Same keys either way: the page reads item.subItems[].dispenseRecords[0] and
  // item.maintenanceRecords.length without guarding, so a borrower gets empty lists rather
  // than missing ones. "ถูกยืม" on a piece comes from its own status, which is still here.
  const shape = borrower
    ? {
        // ราคาทุน ผู้ขาย เบอร์ตัวแทน และต้นทุนต่อล็อต ไม่ใช่เรื่องของคนที่สแกน QR มายืมของ —
        // เป็นข้อมูลชุดเดียวกับที่ proxy ปิด /api/reports ไว้ไม่ให้ BORROWER อ่าน. ต้องตัดที่
        // payload ไม่ใช่ที่หน้าจอ: แท็บ ตรวจบำรุงตามรอบ เปิดให้ทุก role และ devtools อ่าน
        // response ได้อยู่ดี. ใส่ null แทนการตัดคีย์ทิ้ง เพราะทุกฟิลด์นี้ nullable อยู่แล้ว
        // ItemDetailMaintenance จึงข้ามแถวให้เองโดยไม่ต้องแก้ฝั่ง UI.
        purchasePrice: null,
        vendorCompany: null,
        vendorContact: null,
        vendorPhone: null,
        lots: item.lots.map((l) => ({ ...l, unitCost: null })),
        dispenseRecords: [],
        receiveRecords: [],
        maintenanceRecords: [],
        statusLogs: [],
        adjustments: [],
        subItems: item.subItems.map((s) => ({ ...s, dispenseRecords: [] })),
      }
    : {};

  return json({ ...item, ...shape, distribution, openDamage });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Every field here (media + location move) is admin-only in the UI — gate at the door
  // like the sibling routes instead of relying on proxy's EXECUTIVE write-deny.
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const { data, error: parseError } = await parseBody(patchSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");
  const { imageUrl, images, locationId } = data;

  // Capture old location + validate target BEFORE update (#2 audit-after, #3 validate existence).
  let prev: { locationId: string | null; location: { building: string; floor: string; room: string; detail: string | null } | null } | null = null;
  let toLabel: string | null = null;
  if (locationId !== undefined) {
    const next = locationId || null;
    prev = await prisma.item.findUnique({ where: { id }, select: { locationId: true, location: true } });
    if (next) {
      const toLoc = await prisma.location.findUnique({ where: { id: next }, select: { building: true, floor: true, room: true, detail: true } });
      if (!toLoc) return error("สถานที่ไม่มีอยู่", 400);
      toLabel = locationLabel(toLoc);
    }
  }

  // Update first — invalid input can't reach here (validated above), so no orphan log on failure.
  const item = await prisma.item.update({
    where: { id },
    data: {
      ...(imageUrl === null ? { imageUrl: null } : imageUrl ? { imageUrl } : {}),
      ...(images !== undefined ? { images } : {}),
      ...(locationId !== undefined ? { locationId: locationId || null } : {}),
    },
  });

  // Audit AFTER successful update.
  if (locationId !== undefined && prev && prev.locationId !== (locationId || null)) {
    await prisma.locationChangeLog.create({
      data: {
        itemId: id,
        fromLabel: prev.location ? locationLabel(prev.location) : null,
        toLabel,
        changedBy: auth.user.userId,
      },
    });
  }

  return json(item);
}
