/**
 * ถึงรอบตรวจนับ list order (api/items?dueCount=true): ค้างนานสุดขึ้นก่อน, ไม่เคยตรวจนับอยู่บนสุด.
 *
 * สองข้อที่พังเงียบได้และเทสนี้จับไว้:
 *   1. Prisma ต้อง emit NULLS FIRST จริง — Postgres เรียง ASC ให้ null ไปท้ายสุดตามค่า default
 *      ซึ่งจะเอาของที่ isCountDue ถือว่าเร่งที่สุด (ไม่เคยนับเลย) ไปซ่อนไว้หน้าสุดท้าย
 *   2. code asc ต่อท้ายต้องยังอยู่ — cursor pagination ฝั่ง mobile พึ่ง total order นี้
 *
 *   npx tsx scripts/check-due-count-order.ts
 *
 * รันในทรานแซกชันที่ throw ทิ้งเสมอ ข้อมูลจริงไม่ถูกแตะ. Exits 1 on mismatch.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// เหมือนกับ api/items/route.ts ตอน dueCount=true — คัดลอกมาไว้ที่เดียว ถ้าที่โน่นเปลี่ยนแล้วลืมที่นี่
// เทสจะยังผ่าน แต่ลำดับที่มันยันคือลำดับที่เราตั้งใจ ซึ่งเป็นครึ่งที่มีค่ากว่า
const listOrder: Prisma.ItemOrderByWithRelationInput[] = [
  { nextCountDate: { sort: "asc", nulls: "first" } },
  { code: "asc" },
];

const ROLLBACK = new Error("rollback");

async function main() {
  try {
    await prisma.$transaction(async (tx) => {
      const picked = await tx.item.findMany({
        where: { isActive: true }, orderBy: { code: "asc" }, take: 4, select: { id: true, code: true },
      });
      assert.equal(picked.length, 4, "ต้องมีพัสดุ active อย่างน้อย 4 ตัวถึงจะเทสได้");
      const [a, b, c, d] = picked;

      const now = new Date();
      const daysAgo = (n: number) => new Date(now.getTime() - n * 864e5);
      // ตั้งใจสลับ: ตัวที่ code มาก่อน (a) ให้ค้างน้อยสุด เพื่อพิสูจน์ว่าลำดับมาจากวันที่ ไม่ใช่ code
      await tx.item.update({ where: { id: a.id }, data: { nextCountDate: daysAgo(3) } });
      await tx.item.update({ where: { id: b.id }, data: { nextCountDate: daysAgo(400) } });
      await tx.item.update({ where: { id: c.id }, data: { nextCountDate: null } });
      await tx.item.update({ where: { id: d.id }, data: { nextCountDate: daysAgo(30) } });

      const rows = await tx.item.findMany({
        where: { id: { in: picked.map((p) => p.id) }, OR: [{ nextCountDate: null }, { nextCountDate: { lt: now } }] },
        orderBy: listOrder,
        select: { code: true },
      });

      assert.deepEqual(
        rows.map((r) => r.code),
        [c.code, b.code, d.code, a.code],
        "ลำดับต้องเป็น ไม่เคยนับ → ค้าง 400 วัน → ค้าง 30 วัน → ค้าง 3 วัน",
      );
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }

  const dirty = await prisma.item.count({ where: { nextCountDate: null, isActive: true } });
  console.log(`due-count order OK (rolled back; ${dirty} active items still uncounted)`);
}

main()
  .catch((err) => { console.error("FAIL:", err instanceof Error ? err.message : err); process.exit(1); })
  .finally(() => prisma.$disconnect());
