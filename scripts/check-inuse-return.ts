/**
 * Verify คืนเข้าคลัง ของ นำไปใช้งาน against the real database, then roll everything back.
 *
 * The rule this guards: a return always comes home ว่าง. Before, a destination other than
 * the item's registered location closed the record and opened a fresh INUSE one, so the
 * stock stayed out and availableQty never moved.
 *
 *   npx tsx scripts/check-inuse-return.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { ItemStatus } from "../src/generated/prisma/enums";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

class Rollback extends Error {}

/** The transaction body of api/dispense/in-use/[id]/return, minus auth and HTTP. */
async function returnInUse(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], recordId: string, qty: number, userId: string) {
  const rec = (await tx.dispenseRecord.findUnique({ where: { id: recordId } }))!;
  const resolved = rec.resolvedQty + qty;
  await tx.dispenseRecord.update({
    where: { id: rec.id },
    data: { resolvedQty: resolved, ...(resolved >= rec.quantity ? { returnedAt: new Date(), returnCondition: "AVAILABLE" as const } : {}) },
  });
  if (rec.subItemId) {
    await tx.subItem.update({ where: { id: rec.subItemId }, data: { status: ItemStatus.AVAILABLE, locationId: null } });
  } else {
    await tx.item.update({ where: { id: rec.itemId }, data: { availableQty: { increment: qty } } });
  }
  return { itemId: rec.itemId, subItemId: rec.subItemId };
}

async function main() {
  const user = (await prisma.user.findFirst())!;
  const elsewhere = await prisma.location.findFirst();
  if (!user || !elsewhere) throw new Error("ต้องมีผู้ใช้และสถานที่อย่างน้อยอย่างละหนึ่งใน DB");

  const countItem = await prisma.item.findFirst({
    where: { trackIndividually: false, isActive: true, availableQty: { gte: 4 } },
  });
  const trackedPiece = await prisma.subItem.findFirst({
    where: { status: ItemStatus.AVAILABLE, item: { isActive: true, trackIndividually: true } },
    include: { item: { select: { id: true } } },
  });
  if (!countItem || !trackedPiece) throw new Error("ต้องมีพัสดุนับจำนวน (ว่าง ≥ 4) และครุภัณฑ์รายชิ้นที่ว่างอยู่");

  try {
    await prisma.$transaction(async (tx) => {
      // --- COUNT: เอาไป 4 ตั้งใช้ที่ห้องหนึ่ง แล้วคืน ---
      const before = countItem.availableQty;
      await tx.item.update({ where: { id: countItem.id }, data: { availableQty: { decrement: 4 } } });
      const countRec = await tx.dispenseRecord.create({
        data: { itemId: countItem.id, quantity: 4, locationId: elsewhere.id, loanType: "INUSE", staffId: user.id },
      });
      await returnInUse(tx, countRec.id, 4, user.id);

      const after = (await tx.item.findUnique({ where: { id: countItem.id }, select: { availableQty: true } }))!.availableQty;
      const closed = (await tx.dispenseRecord.findUnique({ where: { id: countRec.id } }))!;
      const spawned = await tx.dispenseRecord.count({
        where: { itemId: countItem.id, loanType: "INUSE", returnedAt: null, id: { not: countRec.id }, locationId: elsewhere.id },
      });
      if (after !== before) throw new Error(`COUNT: ของต้องกลับมาว่างเท่าเดิม ${before} แต่ได้ ${after}`);
      if (!closed.returnedAt) throw new Error("COUNT: record เดิมต้องถูกปิด");
      if (spawned !== 0) throw new Error("COUNT: ห้ามเปิด INUSE record ใหม่ตอนคืน — นั่นคือพฤติกรรมเก่าที่ทำให้ของไม่ว่าง");
      console.log(`COUNT · ว่าง ${before} → เอาไป 4 → คืน → ว่าง ${after} · ไม่มี record ใหม่ค้าง`);

      // --- ITEM: ชิ้นเดียว ตั้งใช้ที่ห้องหนึ่ง แล้วคืน ---
      await tx.subItem.update({ where: { id: trackedPiece.id }, data: { status: ItemStatus.IN_USE, locationId: elsewhere.id } });
      const pieceRec = await tx.dispenseRecord.create({
        data: { itemId: trackedPiece.item.id, subItemId: trackedPiece.id, quantity: 1, locationId: elsewhere.id, loanType: "INUSE", staffId: user.id },
      });
      await returnInUse(tx, pieceRec.id, 1, user.id);

      const piece = (await tx.subItem.findUnique({ where: { id: trackedPiece.id } }))!;
      if (piece.status !== ItemStatus.AVAILABLE) throw new Error(`ITEM: ชิ้นต้องกลับมา AVAILABLE แต่ได้ ${piece.status}`);
      // null = "อยู่ที่ทะเบียนของรายการ" ตามคอนเวนชันใน lib/returns.ts — ไม่ใช่ค้างห้องที่เอาไปตั้ง
      if (piece.locationId !== null) throw new Error("ITEM: ที่ตั้งของชิ้นต้องกลับไปตามทะเบียน (null) ไม่ค้างห้องที่เอาไปใช้");
      console.log(`ITEM · ชิ้น ${piece.subCode} → ตั้งที่ ${elsewhere.id} → คืน → ${piece.status}, locationId = null`);

      throw new Rollback();
    });
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
    console.log("ผ่านทุกข้อ · rollback แล้ว ไม่มีอะไรค้างใน DB");
  }
}

main().finally(() => prisma.$disconnect());
