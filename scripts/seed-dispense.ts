/**
 * Seed dispense records spread across the last 6 months so dashboard
 * "การเบิก-จ่ายรายเดือน" and stock-summary charts show multiple bars.
 *
 * Run: npx tsx scripts/seed-dispense.ts
 * Idempotent-ish: adds N rows per month; re-run to add more.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UsageType } from "@/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(arr: T[]): T => arr[rand(arr.length)];

async function main() {
  const items = await prisma.item.findMany({ where: { isActive: true }, take: 8, select: { id: true } });
  const staff = await prisma.user.findMany({ take: 3, select: { id: true } });
  if (!items.length || !staff.length) {
    console.error("Need at least one active item and one user to seed dispense records.");
    process.exit(1);
  }

  const usageTypes = [UsageType.COURSE, UsageType.ACTIVITY, UsageType.OTHER] as const;
  const now = new Date();
  let inserted = 0;

  for (let back = 5; back >= 0; back--) {        // 5 months back → current = 6 months
    const count = 6 + rand(8);                    // 6-13 records/month
    for (let n = 0; n < count; n++) {
      const day = 1 + rand(27);
      const dispensedAt = new Date(now.getFullYear(), now.getMonth() - back, day, 8 + rand(9), rand(60));
      await prisma.dispenseRecord.create({
        data: {
          item: { connect: { id: pick(items).id } },
          staff: { connect: { id: pick(staff).id } },
          quantity: 1 + rand(25),
          usageType: pick(usageTypes as unknown as UsageType[]),
          dispensedAt,
        },
      });
      inserted++;
    }
  }

  console.log(`Inserted ${inserted} dispense records across the last 6 months.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
