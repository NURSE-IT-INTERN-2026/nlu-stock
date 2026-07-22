import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const categoryId = params.get("categoryId") || undefined;
  const profileId = params.get("profileId") || undefined;

  const where: Record<string, unknown> = { isActive: true };
  if (categoryId) where.categoryId = categoryId;
  else if (profileId) where.category = { profileId };

  const items = await prisma.item.findMany({
    where,
    include: {
      lots: { select: { remainingQty: true, unitCost: true } },
      category: { include: { profile: { select: { name: true, dispenseType: true } } } },
      issueUnit: { select: { name: true } },
    },
    orderBy: { code: "asc" },
  });

  const rows = items.map((it) => {
    const isConsumable = it.category.profile?.dispenseType === "CONSUMABLE";
    let value = 0;
    let unitCost: number | null = null;

    if (isConsumable) {
      let totalRemaining = 0;
      for (const lot of it.lots) {
        totalRemaining += lot.remainingQty;
        value += lot.remainingQty * (lot.unitCost ?? 0);
      }
      if (totalRemaining > 0 && value > 0) unitCost = value / totalRemaining;
    } else {
      unitCost = it.purchasePrice ?? null;
      value = it.availableQty * (it.purchasePrice ?? 0);
    }

    return {
      id: it.id,
      code: it.code,
      name: it.name,
      categoryName: it.category.name,
      profileName: it.category.profile?.name ?? "—",
      dispenseType: it.category.profile?.dispenseType ?? "—",
      totalQty: it.totalQty,
      availableQty: it.availableQty,
      unitName: it.issueUnit.name,
      unitCost,
      value,
    };
  });

  const summary = {
    totalValue: rows.reduce((s, r) => s + r.value, 0),
    totalAvailableItems: rows.filter((r) => r.availableQty > 0).length,
    itemsWithoutCost: rows.filter((r) => r.unitCost === null).length,
  };

  return json({ rows, summary });
}
