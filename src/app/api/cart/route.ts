import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireAuth, json, error, getSearchParams, parseBody } from "@/lib/api-utils";
import { cartLineKey } from "@/lib/cart";
import { isSelfBorrower } from "@/lib/roles";
import { selfBorrowMax } from "@/lib/self-borrow";
import type { CartItem } from "@/lib/validators/dispense";

// ตะกร้าของคนที่ล็อกอินอยู่ — draft ล้วน ไม่จองสต็อก
//
// userId มาจาก JWT ทุกครั้ง ไม่เคยรับจาก client: ตะกร้าที่ระบุเจ้าของเองได้ก็คือตะกร้าที่อ่าน
// ของคนอื่นได้ ทุก query ที่นี่จึงมี userId ของ session คาอยู่เสมอ
//
// อ่านทีไรก็ join items สดทุกครั้ง — availableQty/ล็อต/ชิ้นที่ส่งกลับคือค่าใน DB ณ วินาทีนั้น
// ไม่ใช่ค่าที่ snapshot ไว้ตอนกดเพิ่ม ปัญหา "ตะกร้าบอกเหลือ 20 แต่ของหมดไปแล้ว" จึงหมดไป
// พร้อมกับการย้ายที่เก็บ ไม่ต้องมีขั้นตอน refresh แยก

const LINE_INCLUDE = {
  item: {
    include: {
      category: { select: { name: true, profile: { select: { dispenseType: true, selfBorrowable: true, selfBorrowLimit: true } } } },
      issueUnit: { select: { name: true } },
      location: { select: { building: true, floor: true, room: true, detail: true } },
      lots: {
        where: { remainingQty: { gt: 0 } },
        orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { receivedDate: "asc" }],
        select: { id: true, lotNumber: true, expiryDate: true, remainingQty: true },
      },
      subItems: {
        where: { status: "AVAILABLE" },
        orderBy: { subCode: "asc" },
        select: { id: true, subCode: true, condition: true },
      },
    },
  },
  subItem: { select: { id: true, subCode: true, status: true } },
  lot: { select: { id: true, lotNumber: true } },
} satisfies Prisma.CartLineInclude;

function loadLines(userId: string) {
  return prisma.cartLine.findMany({
    where: { userId },
    include: LINE_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
}

type LineRow = Awaited<ReturnType<typeof loadLines>>[number];

/**
 * เพดานของบรรทัดนี้ = ตัวเลขที่ปุ่ม +/- ใช้เป็น max
 *
 * BORROWER: เพดานต่อครั้งของประเภท/รายชิ้นตัดก่อนยอดคงเหลือ (selfBorrowMax) — คนยืมถามว่า
 * "ฉันเอาได้เท่าไหร่" ไม่ได้ถามว่าชั้นวางมีเท่าไหร่. เจ้าหน้าที่เบิกได้เท่าที่มี
 *
 * คิดฝั่ง server เพื่อให้เครื่องไหนเปิดตะกร้าก็ได้เลขเดียวกัน และเพื่อให้ /api/borrow กับหน้าจอ
 * ไม่มีทางตอบคนละเลข
 */
function capFor(row: LineRow, borrower: boolean): number {
  const item = row.item;
  const stock = item.trackIndividually ? item.subItems.length : item.availableQty;
  if (!borrower) return stock;
  return Math.min(
    stock,
    selfBorrowMax({
      selfBorrowable: item.selfBorrowable,
      selfBorrowLimit: item.selfBorrowLimit,
      availableQty: item.availableQty,
      trackIndividually: item.trackIndividually,
      dispenseType: item.category.profile.dispenseType,
      profileSelfBorrowable: item.category.profile.selfBorrowable,
      profileSelfBorrowLimit: item.category.profile.selfBorrowLimit,
    }),
  );
}

/** แถวใน DB → CartItem ที่หน้าจอใช้อยู่แล้ว รูปร่างเดิมเป๊ะ UI จึงไม่ต้องแก้สักบรรทัด */
function toCartItem(row: LineRow, borrower: boolean): CartItem {
  const item = row.item;
  return {
    itemId: item.id,
    itemCode: item.code,
    itemName: item.name,
    categoryName: item.category.name,
    dispenseType: item.category.profile.dispenseType,
    trackIndividually: item.trackIndividually,
    issueUnit: item.issueUnit.name,
    quantity: row.quantity,
    lotId: row.lotId,
    lotNumber: row.lot?.lotNumber ?? null,
    subItemId: row.subItemId,
    subCode: row.subItem?.subCode ?? null,
    availableQty: capFor(row, borrower),
    imageUrl: item.imageUrl,
    location: item.location,
    lots: item.lots.map((l) => ({
      id: l.id,
      lotNumber: l.lotNumber,
      expiryDate: l.expiryDate ? l.expiryDate.toISOString() : null,
      quantity: l.remainingQty,
    })),
    subItems: item.subItems.map((s) => ({ id: s.id, subCode: s.subCode, condition: s.condition })),
  };
}

async function respond(userId: string, borrower: boolean) {
  const rows = await loadLines(userId);
  return json({ items: rows.map((r) => toCartItem(r, borrower)) });
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;
  return respond(auth.user.userId, isSelfBorrower(auth.user.role));
}

const addSchema = z.object({
  itemId: z.string().min(1),
  subItemId: z.string().nullish(),
  lotId: z.string().nullish(),
  quantity: z.number().int().positive().default(1),
});

/** เพิ่มลงตะกร้า — บรรทัดเดิมบวกเพิ่ม (upsert) ไม่ใช่แถวซ้ำ */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;
  const { data, error: parseError } = await parseBody(addSchema)(req);
  if (parseError) return parseError;
  if (!data) return error("No data");

  const lineKey = cartLineKey(data.itemId, data.subItemId, data.lotId);
  await prisma.cartLine.upsert({
    where: { userId_lineKey: { userId: auth.user.userId, lineKey } },
    // ไม่ clamp ตรงนี้: ตะกร้าเป็นความอยาก ไม่ใช่การจอง เลขที่เกินเพดานถูกตัดตอนแสดงผล
    // (ปุ่ม +/- ใช้ availableQty ที่ capFor คำนวณ) และถูกปฏิเสธจริงตอนกดยืนยันที่ /api/borrow
    // ซึ่งเป็นที่เดียวที่อ่านสต็อกใต้ row lock
    update: { quantity: { increment: data.quantity } },
    create: {
      userId: auth.user.userId,
      itemId: data.itemId,
      subItemId: data.subItemId ?? null,
      lotId: data.lotId ?? null,
      lineKey,
      quantity: data.quantity,
    },
  });
  return respond(auth.user.userId, isSelfBorrower(auth.user.role));
}

const patchSchema = z.object({
  lineKey: z.string().min(1),
  quantity: z.number().int().positive().optional(),
  // เปลี่ยนชิ้น/ล็อต = เปลี่ยนตัวตนของบรรทัด lineKey จึงต้องคำนวณใหม่ไปด้วย
  subItemId: z.string().nullish(),
  lotId: z.string().nullish(),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;
  const { data, error: parseError } = await parseBody(patchSchema)(req);
  if (parseError) return parseError;
  if (!data) return error("No data");

  const userId = auth.user.userId;
  const line = await prisma.cartLine.findUnique({ where: { userId_lineKey: { userId, lineKey: data.lineKey } } });
  if (!line) return error("ไม่พบรายการในตะกร้า", 404);

  const subItemId = data.subItemId === undefined ? line.subItemId : data.subItemId;
  const lotId = data.lotId === undefined ? line.lotId : data.lotId;
  await prisma.cartLine.update({
    where: { id: line.id },
    data: {
      ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
      subItemId,
      lotId,
      lineKey: cartLineKey(line.itemId, subItemId, lotId),
    },
  });
  return respond(userId, isSelfBorrower(auth.user.role));
}

/** ?line=<lineKey> ลบบรรทัดเดียว, ไม่ใส่ = ล้างทั้งตะกร้า */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;
  const userId = auth.user.userId;
  const lineKey = getSearchParams(req).get("line");
  // userId คาอยู่ใน where เสมอ แม้จะรู้ lineKey ของคนอื่นก็ลบของเขาไม่ได้
  await prisma.cartLine.deleteMany({ where: { userId, ...(lineKey ? { lineKey } : {}) } });
  return respond(userId, isSelfBorrower(auth.user.role));
}
