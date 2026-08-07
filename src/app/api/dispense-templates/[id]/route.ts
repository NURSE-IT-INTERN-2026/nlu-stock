import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, json, notFound, parseBody, handleError } from "@/lib/api-utils";
import { assertTemplateItemsExist } from "@/lib/dispense-template-items";

// Current dispenseable item shape — mirrors /api/dispense/items so the client can feed each
// line straight into buildCartItem (src/components/dispense/cart-context.tsx).
const itemSelect = {
  id: true,
  code: true,
  name: true,
  imageUrl: true,
  isActive: true,
  availableQty: true,
  trackIndividually: true,
  category: { select: { name: true, profile: { select: { dispenseType: true } } } },
  issueUnit: { select: { name: true } },
  lots: {
    where: { remainingQty: { gt: 0 } },
    orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { receivedDate: "asc" }],
    select: { id: true, lotNumber: true, expiryDate: true, remainingQty: true },
  },
  subItems: {
    where: { status: "AVAILABLE" as const },
    select: { id: true, subCode: true, condition: true },
  },
  location: { select: { building: true, floor: true, room: true, detail: true } },
} satisfies Prisma.ItemSelect;

// GET → one template with lines joined to current stock (for loading into the cart).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const template = await prisma.dispenseTemplate.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      lines: { select: { id: true, quantity: true, item: { select: itemSelect } } },
    },
  });
  if (!template) return notFound("ไม่พบเทมเพลต");

  return json({
    id: template.id,
    name: template.name,
    // Deactivated items are kept but flagged so the UI/cart can skip + warn.
    lines: template.lines.map((l) => ({ id: l.id, quantity: l.quantity, unavailable: !l.item.isActive, item: l.item })),
  });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  lines: z
    .array(z.object({ itemId: z.string().min(1), quantity: z.number().int().positive() }))
    .min(1)
    .optional(),
});

// PATCH → update name and/or replace all lines.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const { data, error } = await parseBody(patchSchema)(req);
  if (error) return error;

  if (data!.lines !== undefined) {
    const missing = await assertTemplateItemsExist(data!.lines.map((l) => l.itemId));
    if (missing) return missing;
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (data!.name !== undefined) {
        await tx.dispenseTemplate.update({ where: { id }, data: { name: data!.name } });
      }
      if (data!.lines !== undefined) {
        // Lines carry no state of their own — replace wholesale instead of diffing.
        await tx.dispenseTemplateLine.deleteMany({ where: { templateId: id } });
        await tx.dispenseTemplateLine.createMany({
          data: data!.lines.map((l) => ({ templateId: id, itemId: l.itemId, quantity: l.quantity })),
        });
        // Touch updatedAt even when only lines changed.
        await tx.dispenseTemplate.update({ where: { id }, data: { updatedAt: new Date() } });
      }
    });
    return json({ ok: true });
  } catch (err) {
    return handleError(err, "แก้ไขเทมเพลตไม่สำเร็จ");
  }
}

// DELETE → remove template (lines cascade).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  try {
    await prisma.dispenseTemplate.delete({ where: { id } });
    return json({ ok: true });
  } catch (err) {
    return handleError(err, "ลบเทมเพลตไม่สำเร็จ");
  }
}
