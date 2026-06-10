import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, json, error, parseBody } from "@/lib/api-utils";
import { forcedTrackIndividually } from "@/lib/validators";
import { z } from "zod";

const quickCreateSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(200),
  categoryId: z.string().min(1, "Category is required"),
  issueUnitId: z.string().min(1, "Issue unit is required"),
  subUnitId: z.string().min(1, "Sub unit is required"),
  conversionFactor: z.number().int().min(1).default(1),
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

  const item = await prisma.item.create({
    data: {
      code: data.code,
      name: data.name,
      categoryId: data.categoryId,
      issueUnitId: data.issueUnitId,
      subUnitId: data.subUnitId,
      conversionFactor: data.conversionFactor,
      trackIndividually,
    },
    include: {
      category: true,
      issueUnit: true,
      subUnit: true,
      location: true,
    },
  });

  return json(item, 201);
}
