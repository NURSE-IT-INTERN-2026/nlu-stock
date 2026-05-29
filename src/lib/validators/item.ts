import { z } from "zod";
import { Category, AdjustmentReason, ItemStatus } from "@/generated/prisma/enums";

const itemBaseSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(200),
  nameEn: z.string().max(200).optional().nullable(),
  categoryId: z.string().min(1, "Category is required"),
  trackIndividually: z.boolean().default(false),
  issueUnitId: z.string().min(1, "Issue unit is required"),
  subUnitId: z.string().min(1, "Sub unit is required"),
  conversionFactor: z.number().int().min(1).default(1),
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
  // Consumable fields
  storageRequirements: z.string().max(500).optional().nullable(),
});

export const itemCreateSchema = itemBaseSchema;
export const itemUpdateSchema = itemBaseSchema.partial();

export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;

// Category → forced trackIndividually value. undefined = user choice (DUR, KIT).
export function forcedTrackIndividually(categoryEnum: string): boolean | undefined {
  if (categoryEnum === "KRU" || categoryEnum === "ELE" || categoryEnum === "BOOK" || categoryEnum === "TOY") return true;
  if (categoryEnum === "CON" || categoryEnum === "MED") return false;
  return undefined; // DUR, KIT — user choice
}

export const stockAdjustSchema = z.object({
  shelfCount: z.number().int().min(0, "Shelf count cannot be negative"),
  reason: z.nativeEnum(AdjustmentReason),
  notes: z.string().max(500).optional().nullable(),
  imageEvidence: z.string().optional().nullable(),
});

export type StockAdjustInput = z.infer<typeof stockAdjustSchema>;

export const statusChangeSchema = z.object({
  newStatus: z.nativeEnum(ItemStatus),
  subItemId: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
});

export type StatusChangeInput = z.infer<typeof statusChangeSchema>;
