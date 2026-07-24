import { z } from "zod";
import { ItemStatus, ItemCondition } from "@/generated/prisma/enums";

export const subItemCreateSchema = z.object({
  subCode: z.string().min(1, "Sub-code is required").max(50),
  name: z.string().max(200).optional().nullable(),
  status: z.nativeEnum(ItemStatus).default("AVAILABLE"),
  condition: z.nativeEnum(ItemCondition).optional().nullable(),
  serialNumber: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  images: z.array(z.string()).default([]),
});

// `status` is deliberately NOT updatable here. The settings PUT writes the row directly with
// no ItemStatusLog, so allowing it would let a status change happen with no history at all —
// and it would sidestep the lifecycle rules in status-utils.ts. Status moves only through
// /api/items/[id]/status (single) or .../status/bulk.
export const subItemUpdateSchema = subItemCreateSchema.omit({ status: true }).partial();

export const subItemBatchCreateSchema = z.object({
  prefix: z.string().min(1).max(30),
  startNumber: z.number().int().min(0),
  endNumber: z.number().int().min(0),
}).refine((data) => data.endNumber >= data.startNumber, {
  message: "End number must be >= start number",
});

export type SubItemCreateInput = z.infer<typeof subItemCreateSchema>;
export type SubItemUpdateInput = z.infer<typeof subItemUpdateSchema>;
