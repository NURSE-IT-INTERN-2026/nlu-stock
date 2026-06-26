import { z } from "zod";

// ponytail: room OR detail must be present (e.g. "locker in front of room" lives in detail).
// zod v4 forbids .partial() on a schema with refinements, so create/update are independent objects.
export const locationCreateSchema = z.object({
  building: z.string().min(1, "Building is required").max(100),
  floor: z.string().min(1, "Floor is required").max(100),
  room: z.string().max(100).optional(),
  detail: z.string().max(100).optional().nullable(),
}).refine(
  (d) => !!d.room?.trim() || !!d.detail?.trim(),
  { message: "ต้องระบุห้องหรือรายละเอียดอย่างน้อยหนึ่งอย่าง", path: ["detail"] },
);

export const locationUpdateSchema = z.object({
  building: z.string().min(1).max(100).optional(),
  floor: z.string().min(1).max(100).optional(),
  room: z.string().max(100).optional(),
  detail: z.string().max(100).optional().nullable(),
});

export type LocationCreateInput = z.infer<typeof locationCreateSchema>;
export type LocationUpdateInput = z.infer<typeof locationUpdateSchema>;
