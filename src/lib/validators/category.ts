import { z } from "zod";
import { Category } from "@/generated/prisma/enums";

export const categoryCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  category: z.nativeEnum(Category),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export const categoryUpdateSchema = categoryCreateSchema.partial();

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
