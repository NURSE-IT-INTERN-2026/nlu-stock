import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, json, error, parseBody } from "@/lib/api-utils";
import { embedItem } from "@/lib/gemini";
import { z } from "zod";

/**
 * POST /api/kits — สร้างสูตรชุดอุปกรณ์ (recipe), ไม่ใช่การประกอบ
 *
 * A KIT Item is the recipe: name + BOM, one row forever, zero stock. Sets only come into
 * existence when someone ประกอบชุด (POST /api/kits/[id]/assemble), and each set is a SubItem.
 * Creating the recipe touches no component stock at all.
 */

const componentSchema = z.object({
  componentItemId: z.string().min(1),
  quantity: z.number().int().min(1), // จำนวนต่อ 1 ชุด
});

const recipeSchema = z.object({
  name: z.string().min(1).max(200),
  issueUnitId: z.string().min(1),
  components: z.array(componentSchema).min(1, "ต้องมีอย่างน้อย 1 ส่วนประกอบ"),
});

export async function POST(request: NextRequest) {
  // SUPERADMIN, same as creating any other item: this mints a registry code (NLU-KIT-NNN).
  // Editing the BOM afterwards is ADMIN — that is an edit, not a new entry in the register.
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { data, error: parseError } = await parseBody(recipeSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  const { name, issueUnitId, components } = data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // kit ตายตัว: profile/category = KIT ("อุปกรณ์ประกอบวิชา"). resolve ฝั่ง server.
      const kitCategory = await tx.categoryType.findFirst({
        where: { profile: { code: "KIT" } },
        select: { id: true },
      });
      if (!kitCategory) throw new Error("ไม่พบหมวดหมู่ KIT (อุปกรณ์ประกอบวิชา) — ตรวจ seed");

      const unit = await tx.unit.findUnique({ where: { id: issueUnitId }, select: { id: true } });
      if (!unit) throw new Error("ไม่พบหน่วย");

      // รหัส kit = NLU-KIT-NNN ลำดับถัดไป (generate ฝั่ง server, share sequence กับ kit ทั้งหมด)
      const existing = await tx.item.findMany({
        where: { code: { startsWith: "NLU-KIT-" } },
        select: { code: true },
      });
      const max = existing.reduce((m, it) => {
        const n = parseInt(it.code.split("-")[2] ?? "0", 10);
        return isNaN(n) ? m : Math.max(m, n);
      }, 0);
      const kitCode = `NLU-KIT-${String(max + 1).padStart(3, "0")}`;

      const seen = new Set<string>();
      for (const c of components) {
        if (seen.has(c.componentItemId)) throw new Error("ส่วนประกอบซ้ำกัน");
        seen.add(c.componentItemId);
      }
      const compItems = await tx.item.findMany({
        where: { id: { in: [...seen] } },
        select: { id: true, name: true, issueUnitId: true, category: { select: { profile: { select: { code: true } } } } },
      });
      if (compItems.length !== seen.size) throw new Error("ไม่พบส่วนประกอบบางรายการ");
      // No set inside a set: a nested kit would need its own assemble/disassemble to run
      // inside this one's, and "the set dies on return" stops meaning anything.
      const nested = compItems.find((c) => c.category.profile.code === "KIT");
      if (nested) throw new Error(`${nested.name} เป็นชุดอุปกรณ์ ใส่ในชุดอื่นไม่ได้`);

      const kitItem = await tx.item.create({
        data: {
          code: kitCode,
          name,
          categoryId: kitCategory.id,
          issueUnitId,
          setSize: 1,
          // A set is a piece with its own status — the recipe holds no stock of its own.
          trackIndividually: true,
          totalQty: 0,
          availableQty: 0,
        },
      });

      const byId = new Map(compItems.map((c) => [c.id, c]));
      await tx.kitBom.createMany({
        data: components.map((c, i) => {
          const item = byId.get(c.componentItemId)!;
          return {
            kitItemId: kitItem.id,
            componentItemId: item.id,
            name: item.name,
            quantity: c.quantity,
            unitId: item.issueUnitId,
            sortOrder: i,
          };
        }),
      });

      return { kitItemId: kitItem.id, kitCode };
    });

    // AI embedding พื้นหลัง (ไม่ block response)
    embedItem(result.kitItemId).catch((e) => console.error("Embedding failed for kit", result.kitItemId, e));

    return json(result, 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Create kit recipe failed";
    return error(message, 400);
  }
}
