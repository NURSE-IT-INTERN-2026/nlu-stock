import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, json, error, parseBody } from "@/lib/api-utils";
import { assembleKitSets } from "@/lib/kits";
import { z } from "zod";

/**
 * POST /api/kits/[id]/assemble — ประกอบชุด
 *
 * Builds `sets` physical copies of the recipe as SubItems and cuts every component's stock
 * in one transaction. `picks` lets staff swap the auto-chosen copies of a tracked component
 * before confirming — auto-only would make inKitSubItemId lie the first time a piece is
 * physically not the one the system grabbed.
 */

const assembleSchema = z.object({
  sets: z.number().int().min(1).max(100),
  picks: z
    .array(z.object({ componentItemId: z.string().min(1), subItemIds: z.array(z.string().min(1)) }))
    .optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const { data, error: parseError } = await parseBody(assembleSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  try {
    const result = await prisma.$transaction((tx) =>
      assembleKitSets(tx, {
        kitItemId: id,
        sets: data.sets,
        picks: data.picks,
        userId: auth.user.userId,
      }),
    );
    return json({ assembledQty: result.setSubItemIds.length, setSubItemIds: result.setSubItemIds }, 201);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Assemble kit failed", 400);
  }
}
