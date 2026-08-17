import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { parseScope, scopeItemRelWhere } from "@/lib/dashboard-scope-where";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const records = await prisma.receiveRecord.findMany({
    where: scopeItemRelWhere(parseScope(getSearchParams(request))),
    take: 50,
    orderBy: { receivedAt: "desc" },
    include: {
      item: { select: { id: true, code: true, name: true } },
      receiver: { select: { name: true } },
    },
  });

  return json(records);
}
