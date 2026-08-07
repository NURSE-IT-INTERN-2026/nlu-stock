import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, json, notFound, error, parseBody } from "@/lib/api-utils";
import { locationUpdateSchema } from "@/lib/validators";
import { NextRequest } from "next/server";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const { data, error: parseError } = await parseBody(locationUpdateSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  try {
    const location = await prisma.location.update({ where: { id }, data });
    return json(location);
  } catch {
    return notFound("Location not found");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  const itemCount = await prisma.item.count({ where: { locationId: id } });
  if (itemCount > 0) return error("Cannot delete location with items");

  try {
    await prisma.location.delete({ where: { id } });
    return json({ success: true });
  } catch {
    return notFound("Location not found");
  }
}
