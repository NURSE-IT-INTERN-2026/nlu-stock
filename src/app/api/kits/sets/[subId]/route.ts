import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, json, error, notFound, parseBody } from "@/lib/api-utils";
import { cancelKitSet, loadKitComponents } from "@/lib/kits";
import { z } from "zod";

/**
 * GET  /api/kits/sets/[subId] — สิ่งที่ควรอยู่ในชุดนี้ (ดูของในชุด / รับคืน)
 * POST /api/kits/sets/[subId] — ยกเลิกชุด: ชุดตาย ของคงทนกลับเข้าคลัง
 *
 * ยกเลิกชุด is the exit door, not part of the cycle. A set is persistent — it is borrowed and
 * returned over and over — so without this a mis-assembled set would hold its tracked pieces
 * forever. Consumables are not handed back because they were never taken: the system does not
 * cut them at assemble time (the recipe counts ชิ้น, the stock counts กล่อง).
 */

export async function GET(request: NextRequest, { params }: { params: Promise<{ subId: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { subId } = await params;
  const set = await prisma.subItem.findUnique({
    where: { id: subId },
    select: {
      id: true,
      subCode: true,
      status: true,
      item: { select: { id: true, code: true, name: true, category: { select: { profile: { select: { code: true } } } } } },
      kitContents: {
        select: {
          id: true,
          subCode: true,
          serialNumber: true,
          item: { select: { id: true, code: true, name: true, issueUnit: { select: { name: true } } } },
        },
      },
    },
  });
  if (!set) return notFound("ไม่พบชุดอุปกรณ์");
  if (set.item.category.profile.code !== "KIT") return error("รายการนี้ไม่ใช่ชุดอุปกรณ์", 400);

  const components = await loadKitComponents(prisma, set.item.id);
  const expectedTracked = components.filter((c) => c.kind === "TRACKED");
  const heldByItem = new Map<string, number>();
  for (const piece of set.kitContents) {
    heldByItem.set(piece.item.id, (heldByItem.get(piece.item.id) ?? 0) + 1);
  }

  return json({
    set: {
      id: set.id, subCode: set.subCode, status: set.status, item: set.item,
    },
    // What is physically in the box, as far as anything can be known. Tracked pieces are known
    // exactly; the rest is what the recipe says should be there. Nothing here is a count of
    // consumables — nobody counts gauze, and the system never pretended to.
    tracked: set.kitContents,
    durables: components.filter((c) => c.kind === "COUNT"),
    consumables: components.filter((c) => c.kind === "CONSUMABLE"),
    // Tracked slots the recipe expects that no piece currently fills — a component reported
    // broken leaves the box, and this is what says so on the ดูของในชุด checklist.
    missingTracked: expectedTracked.flatMap((c) => {
      const short = c.perSet - (heldByItem.get(c.itemId) ?? 0);
      return short > 0 ? [{ itemId: c.itemId, code: c.code, name: c.name, missing: short }] : [];
    }),
  });
}

const cancelSchema = z.object({
  note: z.string().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ subId: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { subId } = await params;
  const { data, error: parseError } = await parseBody(cancelSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  try {
    const result = await prisma.$transaction((tx) =>
      cancelKitSet(tx, {
        setSubItemId: subId,
        userId: auth.user.userId,
        note: data.note?.trim() || null,
      }),
    );
    return json(result);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Cancel kit set failed", 400);
  }
}
