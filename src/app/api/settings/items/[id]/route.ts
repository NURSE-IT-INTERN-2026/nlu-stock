import { prisma } from "@/lib/prisma";
import { requireAdmin, json, notFound, error, parseBody } from "@/lib/api-utils";
import { itemUpdateSchema } from "@/lib/validators";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  const item = await prisma.item.findUnique({
    where: { id },
    include: {
      category: true,
      location: true,
      issueUnit: true,
      subUnit: true,
      subItems: { orderBy: { subCode: "asc" } },
      lots: { orderBy: { expiryDate: "asc" } },
    },
  });

  if (!item) return notFound("Item not found");

  return json(item);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const { data, error: parseError } = await parseBody(itemUpdateSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  if (data.code) {
    const existing = await prisma.item.findFirst({ where: { code: data.code, NOT: { id } } });
    if (existing) return error("Item code already exists");
  }

  try {
    const item = await prisma.item.update({
      where: { id },
      data,
      include: { category: true, location: true, issueUnit: true, subUnit: true },
    });
    return json(item);
  } catch {
    return notFound("Item not found");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  const hasRecords = await prisma.dispenseRecord.count({ where: { itemId: id } })
    .then((c) => c > 0)
    .catch(() => false);

  if (hasRecords) return error("Cannot delete item with transaction records. Deactivate instead.");

  try {
    await prisma.item.delete({ where: { id } });
    return json({ success: true });
  } catch {
    return notFound("Item not found");
  }
}
