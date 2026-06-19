/**
 * One-time restructure: 7 → 5 ประเภท.
 *
 * 1. ELE  → move หมวด "อุปกรณ์อิเล็กทรอนิกส์" into KRU. Delete ELE profile.
 * 2. BOOK + TOY → merge into new profile "หนังสือและของเล่น" (BAT, ITEM+setTracking).
 *    Reparent all 16 หมวด flat under it. Delete BOOK + TOY profiles.
 *
 * Behavior check: ELE=KRU (ITEM+asset) ✓ identical. BOOK=TOY (ITEM+set) ✓ identical.
 * Item codes are historical (BOOK/TOY/ELE) — not changed. New items get new prefix.
 *
 * Idempotent: safe to re-run (no-op if ELE/BOOK/TOY already gone).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  // ── 1. ELE → KRU ──
  const ele = await prisma.categoryProfile.findUnique({ where: { code: "ELE" } });
  const kru = await prisma.categoryProfile.findUnique({ where: { code: "KRU" } });
  if (ele && kru) {
    const moved = await prisma.categoryType.updateMany({
      where: { profileId: ele.id },
      data: { profileId: kru.id },
    });
    console.log(`ELE→KRU: moved ${moved.count} หมวด`);
    await prisma.categoryProfile.delete({ where: { id: ele.id } });
    console.log("ELE profile deleted");
  } else {
    console.log("ELE→KRU: already done");
  }

  // ── 2. BOOK + TOY → BAT (หนังสือและของเล่น) ──
  const bat =
    (await prisma.categoryProfile.findUnique({ where: { code: "BAT" } })) ??
    (await prisma.categoryProfile.create({
      data: {
        name: "หนังสือและของเล่น",
        code: "BAT",
        dispenseType: "ITEM",
        assetTracking: false,
        setTracking: true,
        isComposite: false,
        icon: "BookOpen",
        color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
        sortOrder: 3,
        isActive: true,
      },
    }));

  for (const code of ["BOOK", "TOY"]) {
    const prof = await prisma.categoryProfile.findUnique({ where: { code } });
    if (!prof) {
      console.log(`${code}: already gone`);
      continue;
    }
    const moved = await prisma.categoryType.updateMany({
      where: { profileId: prof.id },
      data: { profileId: bat.id },
    });
    await prisma.categoryProfile.delete({ where: { id: prof.id } });
    console.log(`${code}→BAT: moved ${moved.count} หมวด, deleted profile`);
  }

  // ── Verify ──
  const profiles = await prisma.categoryProfile.findMany({
    orderBy: { sortOrder: "asc" },
    select: { code: true, name: true, _count: { select: { subCategories: true } } },
  });
  console.log("\nFinal profiles:");
  profiles.forEach((p) => console.log(`  ${p.code} ${p.name} (${p._count.subCategories} หมวด)`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
