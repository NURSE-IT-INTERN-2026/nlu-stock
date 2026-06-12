import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, json, error, parseBody } from "@/lib/api-utils";
import { forcedTrackIndividually } from "@/lib/validators";
import { embedItem } from "@/lib/gemini";
import { z } from "zod";

const quickCreateSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(200),
  categoryId: z.string().min(1, "Category is required"),
  issueUnitId: z.string().min(1, "Issue unit is required"),
  subUnitId: z.string().min(1, "Sub unit is required"),
  conversionFactor: z.number().int().min(1).default(1),
  copyCount: z.number().int().min(1).default(1),
});

export async function POST(request: NextRequest) {
  const session = await requireAuth(request);
  if (session.denied) return session.denied;
  if (session.user.role === "INSTRUCTOR") {
    return error("Instructors cannot create items", 403);
  }

  const { data, error: parseError } = await parseBody(quickCreateSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  const existing = await prisma.item.findUnique({ where: { code: data.code } });
  if (existing) return error("Item code already exists");

  const cat = await prisma.categoryType.findUnique({ where: { id: data.categoryId } });
  if (!cat) return error("Category not found");

  const trackIndividually = forcedTrackIndividually(cat.category) ?? false;

  // Build sub-items for individually tracked items
  const subItems = trackIndividually
    ? Array.from({ length: data.copyCount }, (_, i) => ({
        subCode: data.copyCount === 1
          ? data.code
          : `${data.code}-C${String(i + 1).padStart(2, "0")}`,
        name: data.copyCount === 1
          ? data.name
          : `${data.name} (copy ${i + 1})`,
        status: "AVAILABLE" as const,
      }))
    : [];

  const item = await prisma.item.create({
    data: {
      code: data.code,
      name: data.name,
      categoryId: data.categoryId,
      issueUnitId: data.issueUnitId,
      subUnitId: data.subUnitId,
      conversionFactor: data.conversionFactor,
      trackIndividually,
      ...(subItems.length > 0
        ? { subItems: { createMany: { data: subItems } } }
        : {}),
      totalQty: trackIndividually ? data.copyCount : 0,
      availableQty: trackIndividually ? data.copyCount : 0,
    },
    include: {
      category: true,
      issueUnit: true,
      subUnit: true,
      location: true,
    },
  });

  // Generate embedding in background (don't block the response)
  embedItem(item.id).catch((e) => console.error("Embedding failed for", item.id, e));

  return json(item, 201);
}
