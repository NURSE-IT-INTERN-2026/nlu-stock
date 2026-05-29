import { prisma } from "@/lib/prisma";
import { requireAuth, json } from "@/lib/api-utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const records = await prisma.dispenseRecord.findMany({
    take: 10,
    orderBy: { dispensedAt: "desc" },
    include: {
      item: { select: { id: true, code: true, name: true } },
      staff: { select: { name: true } },
    },
  });

  return json(records);
}
