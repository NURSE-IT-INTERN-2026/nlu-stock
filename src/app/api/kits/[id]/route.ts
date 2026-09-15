import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, json, error, notFound, parseBody } from "@/lib/api-utils";
import { kitSetDrift, loadKitComponents, maxAssemblableSets, unitMismatches } from "@/lib/kits";
import { ItemStatus } from "@/generated/prisma/enums";
import { z } from "zod";

/**
 * GET  /api/kits/[id] — สูตร + ส่วนประกอบพร้อมสต็อกปัจจุบัน + ชุดที่ประกอบไว้แล้ว
 * PATCH /api/kits/[id] — แก้รายการส่วนประกอบ (BOM)
 *
 * The BOM is never frozen, not even while a set is alive: sets are persistent, so locking on a
 * live set would lock every recipe permanently from its first assemble. What still reads
 * the BOM against a live set is the ดูของในชุด checklist (advice a human reads with the box open)
 * and ยกเลิกชุด (a rare admin action with a confirm screen listing what goes back), so drift
 * is visible where it matters and costs nothing to accept.
 */

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const kit = await prisma.item.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      issueUnit: { select: { id: true, name: true } },
      category: { select: { profile: { select: { code: true } } } },
    },
  });
  if (!kit) return notFound("ไม่พบชุดอุปกรณ์");
  if (kit.category.profile.code !== "KIT") return error("รายการนี้ไม่ใช่ชุดอุปกรณ์", 400);

  const [components, sets] = await Promise.all([
    loadKitComponents(prisma, id),
    prisma.subItem.findMany({
      where: { itemId: id, status: { not: ItemStatus.DISPOSED } },
      orderBy: { subCode: "asc" },
      select: {
        id: true,
        subCode: true,
        status: true,
        kitContents: {
          select: { id: true, subCode: true, item: { select: { id: true, code: true, name: true } } },
        },
      },
    }),
  ]);

  // ponytail: drift per set, two queries each. A kit holds a handful of boxes; batch the
  // holdings into one query if a kit ever holds dozens.
  const setsWithDrift = await Promise.all(
    sets.map(async (s) => ({ ...s, drift: await kitSetDrift(prisma, s.id) })),
  );

  return json({
    kit: { id: kit.id, code: kit.code, name: kit.name, issueUnit: kit.issueUnit },
    components,
    sets: setsWithDrift,
    maxSets: maxAssemblableSets(components),
    // Recipe rows whose unit disagrees with the item's issue unit. Assemble refuses to run on
    // these — surfaced here so the ชุดประกอบ tab can say which line to fix instead of failing
    // at the moment someone presses ประกอบ.
    unitMismatches: unitMismatches(components).map((c) => ({
      itemId: c.itemId, name: c.name, bomUnitName: c.bomUnitName, unitName: c.unitName,
    })),
  });
}

const patchSchema = z.object({
  components: z
    .array(z.object({ componentItemId: z.string().min(1), quantity: z.number().int().min(1) }))
    .min(1, "ต้องมีอย่างน้อย 1 ส่วนประกอบ"),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const { data, error: parseError } = await parseBody(patchSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  try {
    await prisma.$transaction(async (tx) => {
      const kit = await tx.item.findUnique({
        where: { id },
        select: { id: true, category: { select: { profile: { select: { code: true } } } } },
      });
      if (!kit) throw new Error("ไม่พบชุดอุปกรณ์");
      if (kit.category.profile.code !== "KIT") throw new Error("รายการนี้ไม่ใช่ชุดอุปกรณ์");

      const seen = new Set(data.components.map((c) => c.componentItemId));
      if (seen.size !== data.components.length) throw new Error("ส่วนประกอบซ้ำกัน");

      const compItems = await tx.item.findMany({
        where: { id: { in: [...seen] } },
        select: { id: true, name: true, issueUnitId: true, category: { select: { profile: { select: { code: true } } } } },
      });
      if (compItems.length !== seen.size) throw new Error("ไม่พบส่วนประกอบบางรายการ");
      const nested = compItems.find((c) => c.category.profile.code === "KIT");
      if (nested) throw new Error(`${nested.name} เป็นชุดอุปกรณ์ ใส่ในชุดอื่นไม่ได้`);

      const byId = new Map(compItems.map((c) => [c.id, c]));
      await tx.kitBom.deleteMany({ where: { kitItemId: id } });
      await tx.kitBom.createMany({
        data: data.components.map((c, i) => {
          const item = byId.get(c.componentItemId)!;
          return {
            kitItemId: id,
            componentItemId: item.id,
            name: item.name,
            quantity: c.quantity,
            unitId: item.issueUnitId,
            sortOrder: i,
          };
        }),
      });
    });

    return json({ success: true });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Update kit BOM failed", 400);
  }
}
