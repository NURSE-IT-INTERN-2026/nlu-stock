import { PrismaClient } from "./src/generated/prisma/client/index.js";
const prisma = new PrismaClient();
try {
  const locs = await prisma.location.findMany({
    orderBy: [{ building: "asc" }, { floor: "asc" }, { room: "asc" }, { detail: "asc" }],
    include: { _count: { select: { items: true } } },
  });
  console.log("OK count:", locs.length);
} catch (e) {
  console.log("ERR:", e.message);
} finally { await prisma.$disconnect(); }
