import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, json, error, parseBody } from "@/lib/api-utils";
import { isItemTracked } from "@/lib/category-profile";
import { countCycleFor, nextCountFrom } from "@/lib/stock-count";
import { nextMaintenanceFromCycle } from "@/lib/maintenance";
import { embedItem } from "@/lib/gemini";
import { AdjustmentReason } from "@/generated/prisma/enums";
import { z } from "zod";

const quickCreateSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(200),
  categoryId: z.string().min(1, "Category is required"),
  issueUnitId: z.string().min(1, "Issue unit is required"),
  copyCount: z.number().int().min(1).default(1),
  initialQty: z.number().int().min(0).default(0),
  description: z.string().max(1000).optional(),
  // ห้องที่ลงทะเบียนไว้. wizard บังคับกรอกครบ อาคาร/ชั้น/ห้อง ก่อนกดถัดไป แต่ที่นี่ยังรับ null
  // ได้ เพราะสคริปต์นำเข้าข้อมูลเก่ายิง route นี้ตรง ๆ และ DistributionTable เป็นตัวตอบว่าของ
  // อยู่ไหนจริง ๆ อยู่แล้ว
  locationId: z.string().min(1).nullish(),
});

export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (session.denied) return session.denied;

  const { data, error: parseError } = await parseBody(quickCreateSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  const existing = await prisma.item.findUnique({ where: { code: data.code } });
  if (existing) return error("Item code already exists");

  const cat = await prisma.categoryType.findUnique({ where: { id: data.categoryId }, include: { profile: true } });
  if (!cat) return error("Category not found");

  const trackIndividually = isItemTracked(cat.profile);

  // Maintenance schedule seed. quick-create uses the default cycle (12 mo); no cycle
  // field in its payload. CONSUMABLE never gets a cycle. Tracked → seed each copy;
  // flat (COUNT) → seed the item.
  const DEFAULT_CYCLE = 12;
  const hasMaintenance = cat.profile.dispenseType !== "CONSUMABLE";
  const seedNextMaintenance = hasMaintenance ? nextMaintenanceFromCycle(new Date(), DEFAULT_CYCLE) : null;

  // Build sub-items for individually tracked items — subCode is the copy part (C01, C02…);
  // full reference = item.code + "-" + subCode (see ADR-0001).
  const subItems = trackIndividually
    ? Array.from({ length: data.copyCount }, (_, i) => ({
        subCode: `C${String(i + 1).padStart(2, "0")}`,
        name: data.copyCount === 1 ? data.name : `${data.name} (copy ${i + 1})`,
        status: "AVAILABLE" as const,
        ...(seedNextMaintenance ? { nextMaintenanceDate: seedNextMaintenance } : {}),
      }))
    : [];

  const openingQty = trackIndividually ? data.copyCount : data.initialQty;

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.item.create({
      data: {
        code: data.code,
        name: data.name,
        categoryId: data.categoryId,
        issueUnitId: data.issueUnitId,
        locationId: data.locationId ?? null,
        description: data.description,
        trackIndividually,
        ...(subItems.length > 0
          ? { subItems: { createMany: { data: subItems } } }
          : {}),
        totalQty: openingQty,
        availableQty: openingQty,
        // First count is due one cycle from creation — a brand new item isn't overdue.
        nextCountDate: nextCountFrom(new Date(), countCycleFor(cat.profile.dispenseType)),
        // Flat items carry the maintenance schedule on the Item (tracked ones on each copy above).
        ...(!trackIndividually && seedNextMaintenance ? { nextMaintenanceDate: seedNextMaintenance } : {}),
      },
      include: {
        category: { include: { profile: true } },
        issueUnit: true,
        location: true,
      },
    });

    // ยอดตั้งต้นคือการขยับครั้งแรกของพัสดุชิ้นนี้ ไม่ใช่ "ไม่มีอะไรเกิดขึ้น" — ถ้าไม่บันทึก
    // ประวัติจะว่างเปล่าทั้งที่มีของอยู่ในคลัง ตอบไม่ได้ว่า 10 ชิ้นนี้มาจากไหน
    // (e2e 27-history-integrity ยันกติกาข้อนี้กับพัสดุทุกตัวที่ suite สร้าง)
    if (openingQty > 0) {
      await tx.stockAdjustment.create({
        data: {
          itemId: created.id,
          delta: openingQty,
          previousQty: 0,
          newQty: openingQty,
          reason: AdjustmentReason.OPENING_BALANCE,
          adjustedBy: session.user.userId,
        },
      });
    }

    return created;
  });

  // Generate embedding in background (don't block the response)
  embedItem(item.id).catch((e) => console.error("Embedding failed for", item.id, e));

  return json(item, 201);
}
