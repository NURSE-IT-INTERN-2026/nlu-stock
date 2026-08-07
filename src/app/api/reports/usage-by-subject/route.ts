import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { groupUsageBySubject } from "@/lib/usage-by-subject";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const dateFrom = params.get("dateFrom") || undefined;
  const dateTo = params.get("dateTo") || undefined;
  const categoryId = params.get("categoryId") || undefined;

  const where: Record<string, unknown> = {};
  if (dateFrom || dateTo) {
    where.dispensedAt = {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
    };
  }
  if (categoryId) {
    where.item = { categoryId };
  }

  const data = await groupUsageBySubject(where);

  const noTypeCount = await prisma.dispenseRecord.aggregate({
    _sum: { quantity: true },
    where: { ...where, usageType: null },
  });

  if ((noTypeCount._sum.quantity ?? 0) > 0) {
    data.push({
      usageType: null,
      courseCode: null,
      label: "ไม่ระบุ",
      totalQuantity: noTypeCount._sum.quantity ?? 0,
    });
  }

  return json(data);
}
