import { prisma } from "@/lib/prisma";
import { lockItems, recomputeItemCounts } from "@/lib/stock";
import { requireSuperAdmin, json, notFound, parseBody, error } from "@/lib/api-utils";
import { subItemUpdateSchema } from "@/lib/validators";
import { NextRequest } from "next/server";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const { data, error: parseErr } = await parseBody(subItemUpdateSchema)(request);
  if (parseErr) return parseErr;
  if (!data) return error("No data");

  try {
    const subItem = await prisma.subItem.update({ where: { id }, data });
    return json(subItem);
  } catch {
    return notFound("Sub-item not found");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  const hasRecords = await prisma.dispenseRecord.count({ where: { subItemId: id } })
    .then((c) => c > 0)
    .catch(() => false);

  if (hasRecords) return notFound("Cannot delete sub-item with transaction records");

  const sub = await prisma.subItem.findUnique({ where: { id }, select: { itemId: true } });
  if (!sub) return notFound("Sub-item not found");

  // Same reason as the create side: the parent's counters ARE the sub-item counts.
  await prisma.$transaction(async (tx) => {
    await lockItems(tx, [sub.itemId]);
    await tx.subItem.delete({ where: { id } });
    await recomputeItemCounts(tx, sub.itemId);
  });

  return json({ success: true });
}
