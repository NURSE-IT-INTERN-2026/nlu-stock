import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function picsum(seed: string, size = 800): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${size}/${size}`;
}

async function main() {
  const items = await prisma.item.findMany({ select: { id: true, code: true, imageUrl: true } });
  console.log(`Total items: ${items.length}`);

  let filled = 0;
  let skipped = 0;
  for (const item of items) {
    if (item.imageUrl) {
      skipped++;
      continue;
    }
    await prisma.item.update({
      where: { id: item.id },
      data: { imageUrl: picsum(item.code) },
    });
    filled++;
  }

  console.log(`Filled (was empty): ${filled}`);
  console.log(`Skipped (already had image): ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
