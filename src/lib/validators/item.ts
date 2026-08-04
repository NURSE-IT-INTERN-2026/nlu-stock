import { z } from "zod";
import { AdjustmentReason, ItemStatus, RepairVenue } from "@/generated/prisma/enums";

const itemBaseSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(200),
  nameEn: z.string().max(200).optional().nullable(),
  categoryId: z.string().min(1, "Category is required"),
  trackIndividually: z.boolean().default(false),
  issueUnitId: z.string().min(1, "Issue unit is required"),
  minThreshold: z.number().int().min(0).default(0),
  locationId: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
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
  manualUrl: z.string().optional().nullable(),
  // Stock count cadence override; null/omitted = profile default (3 mo consumable, 12 mo rest).
  countCycleMonths: z.number().int().min(1).optional().nullable(),
  // Consumable fields
  storageRequirements: z.string().max(500).optional().nullable(),
  // Book/Toy set + borrowing (ADR-0001)
  setSize: z.number().int().min(1).default(1),
  borrowLimit: z.number().int().min(0).default(0),
  borrowable: z.boolean().default(false),
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
  imageEvidence: z.string().optional().nullable(),
}).refine((d) => d.stockCount || d.shelfCount != null || (d.lotId != null && d.lotCount != null), {
  message: "Either shelfCount or (lotId + lotCount) is required",
}).refine((d) => d.stockCount || d.reason != null, {
  message: "reason is required",
});

export const statusChangeSchema = z.object({
  newStatus: z.nativeEnum(ItemStatus),
  subItemId: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  repairVenue: z.nativeEnum(RepairVenue).optional().nullable(),
  repairNote: z.string().max(500).optional().nullable(),
  // อาการที่ชำรุด carried on the repair rows so it can be corrected mid-trip.
  damageNote: z.string().max(500).optional().nullable(),
});

// Bulk per-piece status change for tracked items (used by adjust dialog + subcodes tab batch).
// Generic over the full ItemStatus set; the UI limits which statuses each entry point offers.
export const bulkSubItemStatusSchema = z.object({
  subItemIds: z.array(z.string().min(1)).min(1, "เลือกอย่างน้อย 1 ชิ้น"),
  newStatus: z.nativeEnum(ItemStatus),
  notes: z.string().max(500).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
});
