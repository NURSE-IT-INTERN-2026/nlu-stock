import { prisma } from "@/lib/prisma";
import { requireAdmin, json, notFound, error, parseBody } from "@/lib/api-utils";
import { profileUpdateSchema } from "@/lib/validators";
import { NextRequest } from "next/server";

// Behavior fields can only change while the profile has no items (see validators/profile.ts).
const BEHAVIOR_FIELDS = ["code", "dispenseType", "assetTracking", "setTracking"] as const;

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const { data, error: parseError } = await parseBody(profileUpdateSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  const touchesBehavior = BEHAVIOR_FIELDS.some((f) => f in (data as Record<string, unknown>));
  if (touchesBehavior) {
    const itemCount = await prisma.item.count({
      where: { category: { profileId: id } },
    });
    if (itemCount > 0) return error("เปลี่ยนพฤติกรรมประเภทไม่ได้เพราะมีพัสดุอยู่", 409);
  }

  try {
    const profile = await prisma.categoryProfile.update({ where: { id }, data });
    return json(profile);
  } catch {
    return notFound("Profile not found");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  const subCount = await prisma.categoryType.count({ where: { profileId: id } });
  if (subCount > 0) return error("ลบไม่ได้เพราะประเภทนี้มีหมวดหมู่ย่อย", 409);

  try {
    await prisma.categoryProfile.delete({ where: { id } });
    return json({ success: true });
  } catch {
    return notFound("Profile not found");
  }
}
