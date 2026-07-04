import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, json, error, parseBody } from "@/lib/api-utils";
import { embedItem } from "@/lib/gemini";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

/**
 * POST /api/kits — ประกอบชุด (assemble)
 *
 * สร้าง kit Item ใหม่ + นิยาม BOM (KitBom rows link ไป component Item จริง)
 * + ตัด stock ของแต่ละ component (FIFO lot ถ้ามี lot, มิฉะนั้นตัด availableQty)
 * + เพิ่ม availableQty/totalQty ของ kit ตาม assembleQty.
 * ทุกขั้นตอนอยู่ใน $transaction เดียว — fail กลิ้งกลับทั้งหมด.
 */

const componentSchema = z.object({
  componentItemId: z.string().min(1),
  quantity: z.number().int().min(1), // จำนวนต่อ 1 ชุด
});

const assembleSchema = z.object({
  name: z.string().min(1).max(200),
  issueUnitId: z.string().min(1),
  components: z.array(componentSchema).min(1, "ต้องมีอย่างน้อย 1 ส่วนประกอบ"),
  assembleQty: z.number().int().min(1),
});

type TxClient = Prisma.TransactionClient;

/** ตัด stock component: FIFO ข้าม lots (มี lot) มิฉะนั้นตัดระดับ item. */
async function cutComponent(
  tx: TxClient,
  component: {
    item: { id: string; code: string; name: string; issueUnitId: string; issueUnitName: string; availableQty: number };
    perKit: number;
    needed: number;
    lots: { id: string; remainingQty: number; expiryDate: Date | null; createdAt: Date }[];
  },
  kitCode: string,
  userId: string,
) {
  const { item, needed, lots } = component;

  if (lots.length > 0) {
    // FIFO: expiry ใกล้สุดก่อน, ไม่มี expiry ตาม createdAt
    const sorted = [...lots].sort((a, b) => {
      if (a.expiryDate && b.expiryDate) return a.expiryDate.getTime() - b.expiryDate.getTime();
      if (a.expiryDate) return -1;
      if (b.expiryDate) return 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    let remaining = needed;
    for (const lot of sorted) {
      if (remaining <= 0) break;
      const take = Math.min(lot.remainingQty, remaining);
      await tx.lot.update({ where: { id: lot.id }, data: { remainingQty: { decrement: take } } });
      await tx.stockAdjustment.create({
        data: {
          itemId: item.id,
          lotId: lot.id,
          delta: -take,
          previousQty: lot.remainingQty,
          newQty: lot.remainingQty - take,
          reason: "ASSEMBLY",
          notes: `ประกอบเป็นชุด ${kitCode}`,
          adjustedBy: userId,
        },
      });
      remaining -= take;
    }
    if (remaining > 0) throw new Error(`${item.name} stock inconsistent (lots ไม่พอ)`);
  } else {
    // ponytail: ไม่มี lot — ตัด availableQty ระดับ item ด้วย adjustment เดียว
    await tx.stockAdjustment.create({
      data: {
        itemId: item.id,
        lotId: null,
        delta: -needed,
        previousQty: item.availableQty,
        newQty: item.availableQty - needed,
        reason: "ASSEMBLY",
        notes: `ประกอบเป็นชุด ${kitCode}`,
        adjustedBy: userId,
      },
    });
  }

  // ลด availableQty ระดับ item (ครอบทั้งกรณีมี/ไม่มี lot) — optimistic lock กันติดลบ
  // ponytail: ลด availableQty เท่านั้นตาม pattern ของ dispense; totalQty ไม่แตะ
  // (component ถูก "ยืมออก" ไปประกอบชุด). ถ้าจะ disassemble ทีหลังต้องจัดการ totalQty.
  const upd = await tx.item.updateMany({
    where: { id: item.id, availableQty: { gte: needed } },
    data: { availableQty: { decrement: needed } },
  });
  if (upd.count === 0) throw new Error(`${item.name} มีไม่พอ (ต้องการ ${needed} ${item.issueUnitName})`);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;
  if (auth.user.role === "INSTRUCTOR") return error("Instructors cannot assemble kits", 403);

  const { data, error: parseError } = await parseBody(assembleSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  const { name, issueUnitId, components, assembleQty } = data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. kit ตายตัว: profile/category = KIT ("อุปกรณ์ประกอบวิชา"). resolve ฝั่ง server.
      const kitCategory = await tx.categoryType.findFirst({
        where: { profile: { code: "KIT" } },
        select: { id: true },
      });
      if (!kitCategory) throw new Error("ไม่พบหมวดหมู่ KIT (อุปกรณ์ประกอบวิชา) — ตรวจ seed");

      const unit = await tx.unit.findUnique({ where: { id: issueUnitId }, select: { id: true } });
      if (!unit) throw new Error("ไม่พบหน่วย");

      // 2. รหัส kit = NLU-KIT-NNN ลำดับถัดไป (generate ฝั่ง server, share sequence กับ kit ทั้งหมด)
      const existing = await tx.item.findMany({
        where: { code: { startsWith: "NLU-KIT-" } },
        select: { code: true },
      });
      const max = existing.reduce((m, it) => {
        const n = parseInt(it.code.split("-")[2] ?? "0", 10);
        return isNaN(n) ? m : Math.max(m, n);
      }, 0);
      const kitCode = `NLU-KIT-${String(max + 1).padStart(3, "0")}`;

      // 3. fetch + validate components (dedupe, trackIndividually ห้าม, stock พอ)
      const seen = new Set<string>();
      const compItems: Awaited<ReturnType<typeof collectComponent>>[] = [];
      for (const c of components) {
        if (seen.has(c.componentItemId)) throw new Error("ส่วนประกอบซ้ำกัน");
        seen.add(c.componentItemId);
        compItems.push(await collectComponent(tx, c, assembleQty));
      }

      // 4. สร้าง kit Item (borrowable — นักศึกษายืม)
      const kitItem = await tx.item.create({
        data: {
          code: kitCode,
          name,
          categoryId: kitCategory.id,
          issueUnitId,
          borrowable: true,
          setSize: 1,
          totalQty: 0,
          availableQty: 0,
        },
      });

      // 5. KitBom rows (link ไป component Item จริง)
      await tx.kitBom.createMany({
        data: compItems.map((c, i) => ({
          kitItemId: kitItem.id,
          componentItemId: c.item.id,
          name: c.item.name,
          quantity: c.perKit,
          unitId: c.item.issueUnitId,
          sortOrder: i,
        })),
      });

      // 6. ตัด stock แต่ละ component
      for (const c of compItems) {
        await cutComponent(tx, c, kitCode, auth.user.userId);
      }

      // 7. เพิ่มจำนวนชุดที่ประกอบได้
      await tx.item.update({
        where: { id: kitItem.id },
        data: { availableQty: { increment: assembleQty }, totalQty: { increment: assembleQty } },
      });
      await tx.stockAdjustment.create({
        data: {
          itemId: kitItem.id,
          lotId: null,
          delta: assembleQty,
          previousQty: 0,
          newQty: assembleQty,
          reason: "ASSEMBLY",
          notes: `ประกอบชุด ${kitCode} (จาก ${compItems.length} ส่วนประกอบ)`,
          adjustedBy: auth.user.userId,
        },
      });

      return { kitItemId: kitItem.id, kitCode, assembledQty: assembleQty };
    });

    // AI embedding พื้นหลัง (block response)
    embedItem(result.kitItemId).catch((e) => console.error("Embedding failed for kit", result.kitItemId, e));

    return json(result, 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Assemble kit failed";
    return error(message, 400);
  }
}

/** Fetch component item + lots, validate ใช้เป็นส่วนประกอบได้ และ stock พอ */
async function collectComponent(
  tx: TxClient,
  c: { componentItemId: string; quantity: number },
  assembleQty: number,
) {
  const item = await tx.item.findUnique({
    where: { id: c.componentItemId },
    include: {
      issueUnit: { select: { name: true } },
      lots: { where: { remainingQty: { gt: 0 } }, select: { id: true, remainingQty: true, expiryDate: true, createdAt: true } },
    },
  });
  if (!item) throw new Error("ไม่พบส่วนประกอบ");
  if (item.trackIndividually) {
    throw new Error(`${item.name} เป็นของรายชิ้น ใช้เป็นส่วนประกอบไม่ได้`);
  }
  const needed = c.quantity * assembleQty;
  if (item.availableQty < needed) {
    throw new Error(`${item.name} มีไม่พอ (ต้องการ ${needed} ${item.issueUnit.name})`);
  }
  return {
    item: {
      id: item.id,
      code: item.code,
      name: item.name,
      issueUnitId: item.issueUnitId,
      issueUnitName: item.issueUnit.name,
      availableQty: item.availableQty,
    },
    perKit: c.quantity,
    needed,
    lots: item.lots,
  };
}
