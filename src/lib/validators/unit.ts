import { z } from "zod";

export const unitCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(50),
});

export const unitUpdateSchema = unitCreateSchema.partial();
