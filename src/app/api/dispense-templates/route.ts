import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, json, parseBody, handleError } from "@/lib/api-utils";
import { assertTemplateItemsExist } from "@/lib/dispense-template-items";

// GET → list templates (lightweight: name, creator, line count, updated)
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;

  const templates = await prisma.dispenseTemplate.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      updatedAt: true,
      createdBy: { select: { name: true } },
      _count: { select: { lines: true } },
    },
  });

  return json({
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      updatedAt: t.updatedAt,
      createdByName: t.createdBy.name,
      lineCount: t._count.lines,
    })),
  });
}

const bodySchema = z.object({
  name: z.string().trim().min(1, "ต้องมีชื่อเทมเพลต"),
  lines: z
    .array(z.object({ itemId: z.string().min(1), quantity: z.number().int().positive() }))
    .min(1, "ต้องมีอย่างน้อย 1 รายการ"),
});

// POST → create template. createdBy = auth user.
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;

  const { data, error } = await parseBody(bodySchema)(req);
  if (error) return error;

  const missing = await assertTemplateItemsExist(data!.lines.map((l) => l.itemId));
  if (missing) return missing;

  try {
    const created = await prisma.dispenseTemplate.create({
      data: {
        name: data!.name,
        createdById: auth.user.userId,
        lines: { create: data!.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })) },
      },
      select: { id: true },
    });
    return json({ id: created.id }, 201);
  } catch (err) {
    return handleError(err, "สร้างเทมเพลตไม่สำเร็จ");
  }
}
