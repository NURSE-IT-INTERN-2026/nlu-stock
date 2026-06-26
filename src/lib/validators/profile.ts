import { z } from "zod";
import { DispenseType } from "@/generated/prisma/enums";

const codeRegex = /^[A-Z][A-Z0-9]{1,5}$/; // 2-6 chars, uppercase, alnum, starts with letter

export const profileCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  code: z
    .string()
    .min(2, "Code must be 2-6 characters")
    .max(6, "Code must be 2-6 characters")
    .regex(codeRegex, "Code must be UPPERCASE letters/numbers"),
  description: z.string().max(500).optional(),
  dispenseType: z.nativeEnum(DispenseType),
  assetTracking: z.boolean().default(false),
  setTracking: z.boolean().default(false),
  icon: z.string().min(1).default("Package"),
  color: z.string().min(1),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

// Update: cosmetic fields always; behavior fields (code/dispenseType/flags) only when no items.
export const profileUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  icon: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  // behavior fields — caller must verify no items before applying
  code: z.string().regex(codeRegex).optional(),
  dispenseType: z.nativeEnum(DispenseType).optional(),
  assetTracking: z.boolean().optional(),
  setTracking: z.boolean().optional(),
});
