/**
 * One-time migration: create CategoryProfile rows for the 7 legacy Category enum
 * values and backfill CategoryType.profileId.
 *
 * PRODUCTION DATA ONLY. seed.ts handles dev-reset. Both must stay in sync with
 * the PROFILE_SPEC table below.
 *
 * Idempotent: safe to re-run. Upserts profiles by `code`, re-sets profileId by enum.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// ── Profile spec (must match prisma/seed.ts) ──
// code | name | dispenseType | assetTracking | setTracking | isComposite | icon | color
const PROFILE_SPEC = [
  { code: "CON", name: "วัสดุสิ้นเปลือง", dispenseType: "CONSUMABLE" as const, assetTracking: false, setTracking: false, isComposite: false, icon: "Package", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  { code: "KIT", name: "อุปกรณ์ประกอบวิชา", dispenseType: "CONSUMABLE" as const, assetTracking: false, setTracking: false, isComposite: true, icon: "Beaker", color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200" },
  { code: "DUR", name: "วัสดุคงทน", dispenseType: "COUNT" as const, assetTracking: false, setTracking: false, isComposite: false, icon: "Hammer", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  { code: "KRU", name: "ครุภัณฑ์", dispenseType: "ITEM" as const, assetTracking: true, setTracking: false, isComposite: false, icon: "Building2", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  { code: "ELE", name: "อุปกรณ์อิเล็กทรอนิกส์", dispenseType: "ITEM" as const, assetTracking: true, setTracking: false, isComposite: false, icon: "Monitor", color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200" },
  { code: "BOOK", name: "หนังสือ", dispenseType: "ITEM" as const, assetTracking: false, setTracking: true, isComposite: false, icon: "BookOpen", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  { code: "TOY", name: "ของเล่น", dispenseType: "ITEM" as const, assetTracking: false, setTracking: true, isComposite: false, icon: "Puzzle", color: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200" },
];

export { PROFILE_SPEC };

async function main() {
  // 1. Upsert profiles by code
  const profileByCode: Record<string, string> = {};
  for (const spec of PROFILE_SPEC) {
    const p = await prisma.categoryProfile.upsert({
      where: { code: spec.code },
      create: { ...spec, sortOrder: PROFILE_SPEC.indexOf(spec) },
      update: { ...spec }, // keep spec authoritative on re-run
    });
    profileByCode[spec.code] = p.id;
  }
  console.log(`Upserted ${PROFILE_SPEC.length} profiles`);

  // NOTE: this backfill step ran against the legacy `category` enum column, which
  // has since been dropped. Kept for history; re-running is a no-op (profileId already set).
  const rows = await prisma.categoryType.findMany({ select: { id: true, profileId: true } });
  let updated = 0;
  let missing = 0;
  for (const row of rows) {
    const profileId = profileByCode[row.category];
    if (!profileId) {
      console.warn(`  ! no profile for category ${row.category} (row ${row.id})`);
      missing++;
      continue;
    }
    await prisma.categoryType.update({ where: { id: row.id }, data: { profileId } });
    updated++;
  }
  console.log(`Backfilled ${updated} CategoryType rows (${missing} missing profile)`);

  // 3. Verify
  const nullCount = await prisma.categoryType.count({ where: { profileId: null } });
  const total = await prisma.categoryType.count();
  console.log(`Verify: ${total} CategoryType rows, ${nullCount} with null profileId`);
  if (nullCount > 0) {
    console.error("FAIL: some CategoryType rows still have null profileId");
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
