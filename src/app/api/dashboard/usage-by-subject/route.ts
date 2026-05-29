import { prisma } from "@/lib/prisma";
import { requireAuth, json } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { USAGE_TYPE_LABELS } from "@/lib/constants";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const groups = await prisma.dispenseRecord.groupBy({
    by: ["usageType"],
    where: {
      dispensedAt: { gte: startOfMonth },
      usageType: { not: null },
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
  });

  const noTypeCount = await prisma.dispenseRecord.aggregate({
    _sum: { quantity: true },
    where: {
      dispensedAt: { gte: startOfMonth },
      usageType: null,
    },
  });

  const data = groups.map((g) => ({
    usageType: g.usageType,
    label: USAGE_TYPE_LABELS[g.usageType ?? ""] ?? g.usageType ?? "Unknown",
    totalQuantity: g._sum.quantity ?? 0,
  }));

  if ((noTypeCount._sum.quantity ?? 0) > 0) {
    data.push({
      usageType: null,
      label: "ไม่ระบุ",
      totalQuantity: noTypeCount._sum.quantity ?? 0,
    });
  }

  return json(data);
}
