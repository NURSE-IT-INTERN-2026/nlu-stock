import { z } from "zod";
import { AdjustmentReason, ItemStatus, RepairVenue } from "@/generated/prisma/enums";

import { MAX_EVIDENCE_FILES } from "@/lib/uploads";
import { isSafeImageSrc, isUploadUrl } from "@/lib/attachments";

/**
 * หลักฐานแนบ — ต้องเป็นไฟล์ที่ POST /api/upload เขียนเองเท่านั้น.
 *
 * ค่าที่นี่ลงไปอยู่ทั้งใน <img src> และ <a href> (AttachmentList) — สตริงที่ไม่ได้ตรวจคือ
 * origin ของคนอื่น หรือ `javascript:` ที่เรา render ให้เอง. /api/attachments ตรวจแบบนี้อยู่
 * แล้วตั้งแต่แรก; เส้นทางที่ "สร้างรายการครั้งแรก" คือช่องที่ยังเหลือ
 */
const evidenceUrls = z
  .array(z.string().refine(isUploadUrl, "ไฟล์แนบต้องมาจากการอัปโหลดในระบบ"))
  .max(MAX_EVIDENCE_FILES);

/** รูปพัสดุ — /uploads/ ของเรา หรือ https ภายนอก. ดู isSafeImageSrc ว่าทำไมถึงยอมอย่างหลัง */
const imageSrc = z.string().refine(isSafeImageSrc, "ลิงก์รูปไม่ถูกต้อง");
const itemBaseSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(200),
  nameEn: z.string().max(200).optional().nullable(),
  categoryId: z.string().min(1, "Category is required"),
  trackIndividually: z.boolean().default(false),
  issueUnitId: z.string().min(1, "Issue unit is required"),
  minThreshold: z.number().int().min(0).default(0),
  locationId: z.string().optional().nullable(),
  imageUrl: imageSrc.optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  isActive: z.boolean().default(true),
  // Fixed Asset fields
  model: z.string().max(200).optional().nullable(),
  purchaseDate: z.coerce.date().optional().nullable(),
  purchasePrice: z.number().min(0).optional().nullable(),
  vendorCompany: z.string().max(200).optional().nullable(),
  vendorContact: z.string().max(200).optional().nullable(),
  vendorPhone: z.string().max(50).optional().nullable(),
  warrantyMonths: z.number().int().min(0).optional().default(0),
  maintenanceCycleMonths: z.number().int().min(1).default(12),
  lastMaintenanceDate: z.coerce.date().optional().nullable(),
  // คู่มือ — ไฟล์ที่อัปโหลด หรือลิงก์เว็บผู้ผลิต. ยังไม่มีหน้าไหน render มัน แต่กติกาเดียวกับรูป
  // ไว้ก่อน ดีกว่าปล่อยสตริงดิบรอวันที่มีคนเอาไปใส่ <a href>
  manualUrl: imageSrc.optional().nullable(),
  // Stock count cadence override; null/omitted = profile default (3 mo consumable, 12 mo rest).
  countCycleMonths: z.number().int().min(1).optional().nullable(),
  // Consumable fields
  storageRequirements: z.string().max(500).optional().nullable(),
  // ยืมเอง — the per-item OFF switch and its per-borrow cap. The profile rule in
  // lib/self-borrow.ts still overrules both; these can only ever close, never open.
  selfBorrowable: z.boolean().default(true),
  // null = ตามประเภท. Only an exception carries its own number.
  selfBorrowLimit: z.number().int().min(1).optional().nullable(),
});

export const itemCreateSchema = itemBaseSchema;
export const itemUpdateSchema = itemBaseSchema.partial();

export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;

export const stockAdjustSchema = z.object({
  shelfCount: z.number().int().min(0, "Shelf count cannot be negative").optional(),
  // Lot-level correction (consumables): correct a specific lot's remainingQty.
  lotId: z.string().optional().nullable(),
  lotCount: z.number().int().min(0).optional(),
  // Scheduled stock count (ตรวจนับ): stamps lastCountDate/nextCountDate and lets the
  // server pick the reason from the delta (over → COUNT_MISMATCH_OVER, short → LOST),
  // so the UI never has to. A count that matches is valid and carries no adjustment.
  stockCount: z.boolean().optional(),
  reason: z.nativeEnum(AdjustmentReason).optional(),
  notes: z.string().max(500).optional().nullable(),
  imageEvidenceUrls: evidenceUrls.default([]),
}).refine((d) => d.stockCount || d.shelfCount != null || (d.lotId != null && d.lotCount != null), {
  message: "Either shelfCount or (lotId + lotCount) is required",
}).refine((d) => d.stockCount || d.reason != null, {
  message: "reason is required",
});

export const statusChangeSchema = z.object({
  newStatus: z.nativeEnum(ItemStatus),
  subItemId: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  imageUrls: evidenceUrls.default([]),
  repairVenue: z.nativeEnum(RepairVenue).optional().nullable(),
  repairNote: z.string().max(500).optional().nullable(),
  // อาการที่ชำรุด carried on the repair rows so it can be corrected mid-trip.
  damageNote: z.string().max(500).optional().nullable(),
  // Where the piece ends up when it leaves IN_USE (คืนเข้าคลัง). นำไปใช้งาน overwrote its
  // SubItem.locationId on the way out, so without this the piece keeps claiming the room
  // it was returned FROM. Omit to leave the location untouched (repair/damage flows).
  locationId: z.string().optional().nullable(),
});

// Bulk per-piece status change for tracked items (used by adjust dialog + subcodes tab batch).
// Generic over the full ItemStatus set; the UI limits which statuses each entry point offers.
export const bulkSubItemStatusSchema = z.object({
  subItemIds: z.array(z.string().min(1)).min(1, "เลือกอย่างน้อย 1 ชิ้น"),
  newStatus: z.nativeEnum(ItemStatus),
  notes: z.string().max(500).optional().nullable(),
  imageUrls: evidenceUrls.default([]),
});
