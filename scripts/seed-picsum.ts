import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// picsum.photos seeded by item code → random but stable per item. Reverted from
// the local SVG placeholder per request; picsum gives real photos. Needs network.
const picsum = (seed: string) => `https://picsum.photos/seed/${encodeURIComponent(seed)}/600/600`;

async function main() {
  const items = await prisma.item.findMany({ select: { id: true, code: true, imageUrl: true } });
  console.log(`Total items: ${items.length}`);

  let filled = 0;
  let skipped = 0;
  for (const item of items) {
    // overwrite external placeholder URLs; leave real uploads alone
    const isExternalPlaceholder =
      !item.imageUrl ||
      item.imageUrl.includes("picsum.photos") ||
      item.imageUrl.includes("placehold.co") ||
      item.imageUrl.includes("loremflickr.com") ||
      item.imageUrl.includes("placeholder-item.svg");
    if (item.imageUrl && !isExternalPlaceholder) {
      skipped++;
      continue;
    }
    await prisma.item.update({
      where: { id: item.id },
      data: { imageUrl: picsum(item.code) },
    });
    filled++;
  }

  console.log(`Filled/refreshed: ${filled}`);
  console.log(`Skipped (real image): ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
