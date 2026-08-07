import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, json, notFound, parseBody, error } from "@/lib/api-utils";
import { userUpdateSchema } from "@/lib/validators";
import { NextRequest } from "next/server";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const { data, error: parseErr } = await parseBody(userUpdateSchema)(request);
  if (parseErr) return parseErr;
  if (!data) return error("No data");

  try {
    const user = await prisma.user.update({ where: { id }, data });
    return json(user);
  } catch {
    return notFound("User not found");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  try {
    const user = await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
    return json(user);
  } catch {
    return notFound("User not found");
  }
}
