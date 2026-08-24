/**
 * จ่ายเลขให้เคสที่ยังไม่มีเลข เรียงตามเวลาที่เคสเปิด.
 *
 * เลขเคสถูกจ่ายตอนมีคนเปิดดูครั้งแรก (src/lib/case-codes.ts) ซึ่งแปลว่าถ้าไม่รันตัวนี้ก่อน เคสที่ถูก
 * เปิดดูก่อนจะได้เลข 0001 ไม่ว่ามันจะเกิดขึ้นเมื่อไหร่ — เลขจะไม่เรียงตามเวลา. รันครั้งเดียวหลังเปิดใช้
 * ระบบเลขนิ่ง แล้วหลังจากนั้นเคสใหม่ก็รับเลขถัดไปเองตามลำดับที่มันเกิด.
 *
 * ปลอดภัยต่อการรันซ้ำ: เคสที่มีเลขแล้วจะไม่ถูกแตะ.
 *   npx tsx scripts/assign-case-codes.ts
 */
import "dotenv/config";
import { listCases } from "../src/lib/cases";
import { prisma } from "../src/lib/prisma";

async function main() {
  const before = await prisma.caseCode.count();
  console.log(`เลขที่จ่ายไปแล้ว: ${before}`);

  // listCases assigns a number to anything it finds without one, oldest first.
  const cases = await listCases({});
  const after = await prisma.caseCode.count();

  console.log(`เคสทั้งหมด: ${cases.length}`);
  console.log(`จ่ายเลขใหม่: ${after - before}`);

  const byType = new Map<string, number>();
  for (const c of cases) byType.set(c.type, (byType.get(c.type) ?? 0) + 1);
  for (const [t, n] of byType) console.log(`  ${t}: ${n}`);

  const sample = [...cases].sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime()).slice(0, 5);
  console.log("\nเคสเก่าสุด 5 อัน:");
  for (const c of sample) console.log(`  ${c.code}  ${c.openedAt.toISOString().slice(0, 10)}  ${c.title}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
