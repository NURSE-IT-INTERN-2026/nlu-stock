import { z } from "zod";

export const categoryCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  profileId: z.string().min(1, "ประเภท is required"),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export const categoryUpdateSchema = categoryCreateSchema.partial();
