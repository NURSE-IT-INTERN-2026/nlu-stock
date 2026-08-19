/**
 * Verify ราคาต่อชิ้นตอนตัดจำหน่าย against the real database, then roll everything back.
 *
 * Proves the whole chain the report reads: a receipt carries a price → the pieces it delivers
 * point at it → ตัดจำหน่ายชิ้นนั้น values at ยอดที่จ่ายจริงของใบนั้น, not the item's average.
 *
 *   npx tsx scripts/check-write-off-price.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { writeOffValue } from "../src/lib/cost";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

class Rollback extends Error {}

async function main() {
  const item = await prisma.item.findFirst({ where: { trackIndividually: true, isActive: true } });
  const user = await prisma.user.findFirst();
  if (!item || !user) throw new Error("ต้องมีพัสดุที่ track รายชิ้นและผู้ใช้อย่างน้อยหนึ่งคนใน DB");

  try {
    await prisma.$transaction(async (tx) => {
      // ซื้อสองรอบ ราคาต่างกันคนละเท่าตัว — จุดที่ราคาเฉลี่ยของรายการเดิมตอบผิด
      const cheap = await tx.receiveRecord.create({
        data: { itemId: item.id, quantity: 1, unitCost: 10_000, receivedBy: user.id },
      });
      const dear = await tx.receiveRecord.create({
        data: { itemId: item.id, quantity: 1, unitCost: 90_000, receivedBy: user.id },
      });
      const pieceA = await tx.subItem.create({
        data: { itemId: item.id, subCode: "ZZ-CHK-A", status: "DISPOSED", receiveRecordId: cheap.id },
      });
      const pieceB = await tx.subItem.create({
        data: { itemId: item.id, subCode: "ZZ-CHK-B", status: "DISPOSED", receiveRecordId: dear.id },
      });
      // ชิ้นเก่าที่ไม่ผูกใบ — ต้องตกไปใช้ราคาเฉลี่ยและถูกติดธงว่าประมาณการ
      const pieceOld = await tx.subItem.create({
        data: { itemId: item.id, subCode: "ZZ-CHK-OLD", status: "DISPOSED" },
      });

      const rows = await tx.subItem.findMany({
        where: { id: { in: [pieceA.id, pieceB.id, pieceOld.id] } },
        select: {
          subCode: true,
          receiveRecord: { select: { unitCost: true } },
          item: { select: { purchasePrice: true } },
        },
        orderBy: { subCode: "asc" },
      });

      const priced = rows.map((r) => ({
        subCode: r.subCode,
        ...writeOffValue(r.receiveRecord?.unitCost, r.item.purchasePrice),
      }));
      console.table(priced);

      const a = priced.find((p) => p.subCode === "ZZ-CHK-A")!;
      const b = priced.find((p) => p.subCode === "ZZ-CHK-B")!;
      const old = priced.find((p) => p.subCode === "ZZ-CHK-OLD")!;
      if (a.value !== 10_000 || !a.exact) throw new Error("ชิ้นที่ผูกใบถูกๆ ต้องได้ 10,000 แบบ exact");
      if (b.value !== 90_000 || !b.exact) throw new Error("ชิ้นที่ผูกใบแพงๆ ต้องได้ 90,000 แบบ exact");
      if (old.exact) throw new Error("ชิ้นที่ไม่ผูกใบต้องถูกติดธงว่าประมาณการ");
      if (old.value !== (item.purchasePrice ?? null)) throw new Error("ชิ้นที่ไม่ผูกใบต้องตกไปใช้ราคาเฉลี่ยของรายการ");

      const sum = priced.reduce((s, p) => s + (p.value ?? 0), 0);
      const flatAverage = priced.length * (item.purchasePrice ?? 0);
      console.log(`ยอดตัดจำหน่ายรายชิ้น ฿${sum.toLocaleString()} · ถ้าใช้ราคาเฉลี่ยล้วนจะได้ ฿${flatAverage.toLocaleString()}`);

      throw new Rollback();
    });
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
    console.log("ผ่านทุกข้อ · rollback แล้ว ไม่มีอะไรค้างใน DB");
  }
}

main().finally(() => prisma.$disconnect());
