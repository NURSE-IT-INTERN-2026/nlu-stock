/**
 * ตะกร้าอยู่ใน DB จริงไหม — เขียนจาก "เครื่องหนึ่ง" แล้วอ่านจากอีก client หนึ่ง
 *
 *   npx tsx scripts/check-cart-cross-device.ts
 *
 * ไม่ผ่าน HTTP เพราะไม่อยากผูกกับ dev server ที่รันอยู่หรือไม่ — จุดที่ทดสอบคือ "ตะกร้าไม่ได้
 * ผูกกับเบราว์เซอร์แล้ว" ซึ่งพิสูจน์ได้ด้วยคอนเนกชันคนละตัวอ่านเจอของเดียวกัน
 * สร้าง user ทดสอบเอง แล้วลบทิ้งตอนจบ ไม่แตะข้อมูลจริง
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { cartLineKey } from "../src/lib/cart";

const conn = { connectionString: process.env.DATABASE_URL };
const deviceA = new PrismaClient({ adapter: new PrismaPg(conn) });
const deviceB = new PrismaClient({ adapter: new PrismaPg(conn) });

async function main() {
  const item = await deviceA.item.findFirstOrThrow({ where: { isActive: true } });
  const user = await deviceA.user.create({
    data: { email: `cart-check-${Date.now()}@example.test`, name: "ผู้ใช้ทดสอบตะกร้า" },
  });

  try {
    // เครื่อง A: หยิบใส่ตะกร้า
    await deviceA.cartLine.create({
      data: { userId: user.id, itemId: item.id, lineKey: cartLineKey(item.id), quantity: 3 },
    });

    // เครื่อง B: คนละคอนเนกชัน เปิดตะกร้าของ user เดียวกัน
    const seenByB = await deviceB.cartLine.findMany({ where: { userId: user.id } });
    console.log(`เครื่อง B เห็น ${seenByB.length} บรรทัด · จำนวน ${seenByB[0]?.quantity}`);
    if (seenByB.length !== 1 || seenByB[0].quantity !== 3) throw new Error("FAIL: ข้ามเครื่องไม่เห็นตะกร้า");

    // ของหลุดจากคลัง = หลุดจากทุกตะกร้าเอง (FK cascade) ไม่ต้องมีงานเก็บกวาด
    const ghost = await deviceA.item.create({
      data: {
        code: `ZZZ-CART-CHECK-${Date.now()}`, name: "ของทดสอบ cascade",
        categoryId: item.categoryId, issueUnitId: item.issueUnitId,
      },
    });
    await deviceA.cartLine.create({
      data: { userId: user.id, itemId: ghost.id, lineKey: cartLineKey(ghost.id), quantity: 1 },
    });
    await deviceA.item.delete({ where: { id: ghost.id } });
    const left = await deviceB.cartLine.count({ where: { userId: user.id } });
    console.log(`ลบของออกจากคลังแล้ว เหลือในตะกร้า ${left} บรรทัด (คาดหวัง 1)`);
    if (left !== 1) throw new Error("FAIL: cascade ไม่ทำงาน");

    console.log("PASS — ตะกร้าอยู่ที่ user ไม่ใช่ที่เบราว์เซอร์ และของที่ถูกลบไม่ค้างเป็นบรรทัดผี");
  } finally {
    await deviceA.cartLine.deleteMany({ where: { userId: user.id } });
    await deviceA.user.delete({ where: { id: user.id } });
  }
}

main()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(async () => { await deviceA.$disconnect(); await deviceB.$disconnect(); });
