import { z } from "zod";

export const locationCreateSchema = z.object({
  building: z.string().min(1, "Building is required").max(100),
  floor: z.string().min(1, "Floor is required").max(100),
  room: z.string().min(1, "Room is required").max(100),
  detail: z.string().max(100).optional().nullable(),
});

export const locationUpdateSchema = locationCreateSchema.partial();

export type LocationCreateInput = z.infer<typeof locationCreateSchema>;
export type LocationUpdateInput = z.infer<typeof locationUpdateSchema>;
