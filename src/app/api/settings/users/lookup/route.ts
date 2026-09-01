import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, json, error, getSearchParams } from "@/lib/api-utils";
import { displayRole } from "@/lib/roles";
import { NextRequest } from "next/server";

/**
 * สิ่งที่รู้เกี่ยวกับอีเมลนี้ ก่อนจะยืนยันเพิ่มผู้ใช้งาน
 *
 * ชื่อมาจากตาราง users เท่านั้น — ไม่มี directory API ให้ค้น. CMU_USERINFO_URL คือ
 * `/me/basicinfo` ที่ scope เป็น Read.Me.Basicinfo: อ่านได้เฉพาะเจ้าของ access token ที่เพิ่ง
 * ล็อกอิน ไม่ใช่ค้นคนอื่นด้วยอีเมล. คนที่ยังไม่เคยล็อกอินจึงยังไม่มีชื่อ และจะได้ชื่อจริงเอง
 * ตอนล็อกอินครั้งแรก (api/auth/cmu/callback เขียนทับ placeholder ให้)
 */
export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const email = getSearchParams(request).get("email")?.trim().toLowerCase();
  if (!email) return error("ต้องระบุอีเมล");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { name: true, email: true, role: true, isBorrower: true, isActive: true },
  });

  return json({
    email,
    /** null = ยังไม่เคยล็อกอิน ยังไม่มีชื่อให้แสดง */
    name: user?.name ?? null,
    known: !!user,
    /** บทบาทที่ถืออยู่ตอนนี้ — เพิ่มไปคือการเปลี่ยนจากค่านี้ */
    currentRole: user ? displayRole(user) : null,
    isActive: user?.isActive ?? true,
  });
}
