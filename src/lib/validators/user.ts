import { z } from "zod";

/** บทบาทที่ superadmin มอบจากหน้า /settings ได้. SUPERADMIN ไม่อยู่ในนี้โดยตั้งใจ — มาจาก env
 *  ทางเดียว ไม่งั้นใครที่เข้าหน้านี้ได้ก็แต่งตั้ง superadmin เพิ่มได้เอง. ผู้ยืมก็ไม่อยู่ —
 *  มาจาก claims ของ provider ไม่ใช่จากการแอด */
export const GRANTABLE_ROLES = ["ADMIN", "EXECUTIVE"] as const;

// name ไม่ได้รับจากฟอร์ม: คนที่เคยล็อกอินมีชื่อจริงอยู่แล้ว คนที่ยังไม่เคยจะได้ชื่อจาก provider
// ตอนล็อกอินครั้งแรก (api/auth/cmu/callback เขียนทับ placeholder ให้)
export const userCreateSchema = z.object({
  email: z.string().email("Invalid email"),
  role: z.enum(GRANTABLE_ROLES),
});

export const userUpdateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200).optional(),
  // null = ถอดบทบาทที่เคยให้ ไม่ใช่ "ไม่แก้"
  role: z.enum(GRANTABLE_ROLES).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
