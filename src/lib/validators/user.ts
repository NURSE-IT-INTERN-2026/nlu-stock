import { z } from "zod";

// No role field — roles live in env allowlists (src/lib/roles.ts), not on the row.
export const userCreateSchema = z.object({
  email: z.string().email("Invalid email"),
  name: z.string().min(1, "Name is required").max(200),
  isActive: z.boolean().default(true),
});

export const userUpdateSchema = userCreateSchema.partial().omit({ email: true });

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
