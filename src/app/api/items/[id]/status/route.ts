import { prisma } from "@/lib/prisma";
import { requireAuth, json, notFound, error, parseBody, forbidden } from "@/lib/api-utils";
import { statusChangeSchema } from "@/lib/validators";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;
  if (auth.user.role === "INSTRUCTOR") return forbidden();

  const { id } = await params;
  const { data, error: parseError } = await parseBody(statusChangeSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) return notFound("Item not found");

  if (data.subItemId) {
    const subItem = await prisma.subItem.findUnique({ where: { id: data.subItemId } });
    if (!subItem || subItem.itemId !== id) return notFound("Sub-item not found");

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.subItem.update({
        where: { id: data.subItemId! },
        data: { status: data.newStatus },
      });

      await tx.itemStatusLog.create({
        data: {
          itemId: id,
          subItemId: data.subItemId,
          previousStatus: subItem.status,
          newStatus: data.newStatus,
          reason: data.notes || `Status changed to ${data.newStatus}`,
          changedBy: auth.user.userId,
          imageUrl: data.imageUrl,
        },
      });

      return updated;
    });

    return json(result, 201);
  }

  if (data.newStatus === item.status) return error("New status is the same as current");

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.item.update({
      where: { id },
      data: { status: data.newStatus },
    });

    await tx.itemStatusLog.create({
      data: {
        itemId: id,
        previousStatus: item.status,
        newStatus: data.newStatus,
        reason: data.notes || `Status changed to ${data.newStatus}`,
        changedBy: auth.user.userId,
        imageUrl: data.imageUrl,
      },
    });

    return updated;
  });

  return json(result, 201);
}
