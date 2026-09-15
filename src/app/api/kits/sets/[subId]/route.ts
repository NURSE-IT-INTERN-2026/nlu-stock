import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, json, error, notFound, parseBody } from "@/lib/api-utils";
import { cancelKitSet, kitSetDrift, loadKitComponents, loadSetHoldings, resyncKitSet } from "@/lib/kits";
import { z } from "zod";

/**
 * GET   /api/kits/sets/[subId] — สิ่งที่ควรอยู่ในชุดนี้ (ดูของในชุด / รับคืน)
 * PATCH /api/kits/sets/[subId] — ปรับชุดตามสูตร: กล่องเดิม ของข้างในขยับเฉพาะส่วนที่ต่าง
 * POST  /api/kits/sets/[subId] — ยกเลิกชุด: ชุดตาย ของคงทนกลับเข้าคลัง
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
          // _count.subItems feeds effectiveCode: a one-copy item IS its base code, and a
          // phantom "-C01" on it reads as a second piece that does not exist.
          item: { select: { id: true, code: true, name: true, issueUnit: { select: { name: true } }, _count: { select: { subItems: true } } } },
        },
      },
    },
  });
  if (!set) return notFound("ไม่พบชุดอุปกรณ์");
  if (set.item.category.profile.code !== "KIT") return error("รายการนี้ไม่ใช่ชุดอุปกรณ์", 400);

  const components = await loadKitComponents(prisma, set.item.id);
  const holdings = await loadSetHoldings(prisma, set.id);
  const drift = await kitSetDrift(prisma, set.id);

  return json({
    set: {
      id: set.id, subCode: set.subCode, status: set.status, item: set.item,
    },
    // What is physically in the box, as far as anything can be known. Tracked pieces and
    // คงทน are known from what assemble recorded, so an edited recipe does not rewrite what an
    // old box says it holds. Consumables have no record — nobody counts gauze, and the system
    // never pretended to — so there the recipe is the only thing left to print.
    tracked: set.kitContents,
    durables: holdings.length > 0
      ? holdings
      : components.filter((c) => c.kind === "COUNT").map((c) => ({
          itemId: c.itemId, code: c.code, name: c.name, unitName: c.unitName, quantity: c.perSet,
        })),
    consumables: components.filter((c) => c.kind === "CONSUMABLE"),
    // Where the box and the current recipe disagree — empty when they match. ปรับชุดตามสูตร
    // works from exactly this list, and the button is hidden while it is empty.
    // Don't add a separate "missing tracked slots" list: it is a strict subset of drift
    // (tracked held counts come from `kitContents` either way), so it would only repeat these rows.
    drift,
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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ subId: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { subId } = await params;
  const { data, error: parseError } = await parseBody(cancelSchema)(request);
  if (parseError) return parseError;

  try {
    const result = await prisma.$transaction((tx) =>
      resyncKitSet(tx, { setSubItemId: subId, userId: auth.user.userId, note: data?.note ?? null }),
    );
    return json(result);
  } catch (e) {
    return error(e instanceof Error ? e.message : "ปรับชุดตามสูตรไม่สำเร็จ", 400);
  }
}
