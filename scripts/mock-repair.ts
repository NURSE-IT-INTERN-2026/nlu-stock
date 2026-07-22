import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { recomputeItemCounts } from "@/lib/stock";

const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const REASONS = ["จอแตก", "สายชาร์จขาด", "เครื่องไม่ติด", "ปุ่มกดไม่ตอบสนอง", "น้ำเข้าเครื่อง", "แบตเสื่อมสภาพ"];
const N = 6; // จำนวนชิ้นที่จะจำลองส่งซ่อม

async function main() {
  const staff = await p.user.findFirst({ where: { role: "STAFF" } });
  if (!staff) throw new Error("no staff user — reseed first");

  // เลือก sub ที่ AVAILABLE จาก tracked item (KRU) แบบสุ่ม กระจายหลาย item
  const subs = await p.$queryRaw<{ id: string; itemId: string; subCode: string; code: string; name: string }[]>`
    SELECT s.id, s."itemId", s."subCode", i.code, i.name
    FROM sub_items s JOIN items i ON s."itemId" = i.id
    JOIN categories c ON i."categoryId" = c.id
    JOIN category_profiles pr ON c."profileId" = pr.id
    WHERE pr.code = 'KRU' AND s.status = 'AVAILABLE'
    ORDER BY random() LIMIT ${N}`;

  if (subs.length === 0) throw new Error("no AVAILABLE KRU sub-items — reseed first");

  const affected = new Set<string>();
  let i = 0;
  for (const s of subs) {
    const reason = REASONS[i % REASONS.length];
    await p.subItem.update({ where: { id: s.id }, data: { status: "UNDER_REPAIR" } });
    await p.maintenanceRecord.create({
      data: {
        itemId: s.itemId,
        subItemId: s.id,
        type: "CORRECTIVE",
        result: "NEEDS_MORE_REPAIR",
        performedAt: new Date(Date.now() - (i + 1) * 86400_000), // กระจาย 1..N วันที่แล้ว
        performedBy: staff.id,
        issue: `ส่งซ่อม — ${reason}`,
        description: "จำลองของส่งซ่อม (mock)",
      },
    });
    affected.add(s.itemId);
    console.log(`  ${s.code} ${s.subCode} (${s.name}) → UNDER_REPAIR  [${reason}]`);
    i++;
  }

  // recompute parent item counts (availableQty/totalQty/status ลดลงตามที่หายไป)
  for (const itemId of affected) await recomputeItemCounts(p as any, itemId);

  console.log(`\n✅ mocked ${subs.length} sub-items → UNDER_REPAIR across ${affected.size} items`);
  console.log("ดูได้ที่ /receive?tab=repair (tab รับซ่อม)");
  await p.$disconnect();
}

main().catch(async (e) => { console.log("ERR:", e.message); await p.$disconnect(); });
