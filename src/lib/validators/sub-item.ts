import { z } from "zod";
import { ItemStatus, ItemCondition } from "@/generated/prisma/enums";

export const subItemCreateSchema = z.object({
  subCode: z.string().min(1, "Sub-code is required").max(50),
  status: z.nativeEnum(ItemStatus).default("AVAILABLE"),
  condition: z.nativeEnum(ItemCondition).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
});

export const subItemUpdateSchema = subItemCreateSchema.partial();

export const subItemBatchCreateSchema = z.object({
  prefix: z.string().min(1).max(30),
  startNumber: z.number().int().min(0),
  endNumber: z.number().int().min(0),
}).refine((data) => data.endNumber >= data.startNumber, {
  message: "End number must be >= start number",
});

export type SubItemCreateInput = z.infer<typeof subItemCreateSchema>;
export type SubItemUpdateInput = z.infer<typeof subItemUpdateSchema>;
export type SubItemBatchCreateInput = z.infer<typeof subItemBatchCreateSchema>;
