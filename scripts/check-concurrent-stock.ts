/**
 * พิสูจน์ว่า lockItems กัน write-skew ได้จริง — ไม่ใช่ unit test เพราะอาการนี้เกิดได้เฉพาะกับ
 * DB จริงสองคอนเนกชันที่วิ่งชนกัน (in-memory mock ไม่มี MVCC ก็ไม่มีอาการให้จับ)
 *
 *   npx tsx scripts/check-concurrent-stock.ts
 *
 * สร้างของทดสอบเอง ยืม 2 ชิ้นพร้อมกัน แล้วลบทิ้ง — ไม่แตะข้อมูลจริง
 * คาดหวัง: availableQty เหลือ 0. ถ้าได้ 1 แปลว่า transaction หนึ่งนับจาก snapshot ก่อนอีกตัว
 * commit — คือบั๊กที่ lockItems มีไว้กัน
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ItemStatus } from "../src/generated/prisma/client";
import { lockItems, recomputeItemCounts } from "../src/lib/stock";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// ยืมหนึ่งชิ้นแบบเดียวกับ /api/borrow: ล็อก → อ้างสิทธิ์ชิ้น → นับใหม่
//
// `barrier` คือสิ่งที่ทำให้การทดสอบไม่ขึ้นกับดวง: บังคับให้ทั้งสอง transaction อ่าน sub_items
// (ขั้นตอนนับใหม่) คาบเกี่ยวกันจริงๆ ไม่ใช่บังเอิญวิ่งเรียงกันจนไม่เห็นอาการ. รอบที่ล็อก ตัวที่สอง
// จะติดอยู่ที่ FOR UPDATE ตั้งแต่ยังไม่ทันถึง barrier — barrier จึงหมดเวลาแล้วปล่อยผ่านเอง
// ซึ่งก็คือหลักฐานว่ามันถูก serialize จริง
async function borrowPiece(itemId: string, subItemId: string, withLock: boolean, barrier: () => Promise<void>) {
  return prisma.$transaction(async (tx) => {
    if (withLock) await lockItems(tx, [itemId]);
    const claimed = await tx.subItem.updateMany({
      where: { id: subItemId, status: ItemStatus.AVAILABLE },
      data: { status: ItemStatus.ON_LOAN },
    });
    if (claimed.count === 0) throw new Error("มีคนตัดหน้าไปแล้ว");
    await barrier();
    await recomputeItemCounts(tx, itemId);
  }, { timeout: 15_000 });
}

/** ปล่อยผ่านเมื่อครบ n คน หรือเมื่อหมดเวลา (แปลว่าอีกคนติดล็อกอยู่ ไม่มีทางมาถึง) */
function makeBarrier(n: number, timeoutMs: number) {
  let arrived = 0;
  let release: () => void;
  const open = new Promise<void>((r) => { release = r; });
  const timer = setTimeout(() => release(), timeoutMs);
  return async () => {
    if (++arrived >= n) { clearTimeout(timer); release(); }
    await open;
  };
}

async function run(withLock: boolean) {
  const unit = await prisma.unit.findFirstOrThrow();
  const category = await prisma.categoryType.findFirstOrThrow({ where: { profile: { dispenseType: "ITEM" } } });
  const item = await prisma.item.create({
    data: {
      code: `ZZZ-CONCURRENCY-${Date.now()}`,
      name: "ของทดสอบ concurrent (ลบทิ้งอัตโนมัติ)",
      categoryId: category.id,
      issueUnitId: unit.id,
      trackIndividually: true,
      totalQty: 2,
      availableQty: 2,
      subItems: { create: [{ subCode: "C01" }, { subCode: "C02" }] },
    },
    include: { subItems: { orderBy: { subCode: "asc" } } },
  });

  try {
    const barrier = makeBarrier(2, 1_000);
    const results = await Promise.allSettled([
      borrowPiece(item.id, item.subItems[0].id, withLock, barrier),
      borrowPiece(item.id, item.subItems[1].id, withLock, barrier),
    ]);
    const won = results.filter((r) => r.status === "fulfilled").length;
    const after = await prisma.item.findUniqueOrThrow({ where: { id: item.id }, select: { availableQty: true } });
    return { won, availableQty: after.availableQty };
  } finally {
    await prisma.subItem.deleteMany({ where: { itemId: item.id } });
    await prisma.item.delete({ where: { id: item.id } });
  }
}

async function main() {
  const withoutLock = await run(false);
  const withLock = await run(true);

  console.log("ยืม 2 ชิ้นของ item เดียวกันพร้อมกัน (คาดหวัง availableQty = 0)");
  console.log(`  ไม่ล็อก: สำเร็จ ${withoutLock.won}/2 → availableQty = ${withoutLock.availableQty}`);
  console.log(`  ล็อก:    สำเร็จ ${withLock.won}/2 → availableQty = ${withLock.availableQty}`);

  if (withLock.availableQty !== 0 || withLock.won !== 2) {
    console.error("FAIL: ล็อกแล้วยังนับผิด");
    process.exitCode = 1;
    return;
  }
  console.log(withoutLock.availableQty === 0 ? "PASS (แต่รอบไม่ล็อกไม่ชน — ลองรันซ้ำ)" : "PASS — ล็อกแก้อาการที่รอบไม่ล็อกทำพัง");
}

main().finally(() => prisma.$disconnect());
