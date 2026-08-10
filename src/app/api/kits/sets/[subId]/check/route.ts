import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, json, error, parseBody } from "@/lib/api-utils";
import { confirmKitSetChecked } from "@/lib/kits";
import { z } from "zod";

/**
 * POST /api/kits/sets/[subId]/check — ยืนยันตรวจชุด
 *
 * The one action that lifts รอตรวจ. It verifies nothing and moves no stock: a set comes back
 * from a loan with an unknown number of consumables left in it, nobody counts gauze, and
 * anything that had to be replaced or reported was done through the ordinary เบิก / แจ้งชำรุด
 * screens before this button was pressed. All this records is that a human opened the box.
 */

const checkSchema = z.object({
  note: z.string().max(500).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ subId: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { subId } = await params;
  const { data, error: parseError } = await parseBody(checkSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  try {
    const result = await prisma.$transaction((tx) =>
      confirmKitSetChecked(tx, {
        setSubItemId: subId,
        userId: auth.user.userId,
        note: data.note?.trim() || null,
      }),
    );
    return json(result);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Confirm kit set failed", 400);
  }
}
