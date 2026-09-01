import { prisma } from "@/lib/prisma";
import { requireAuth, json } from "@/lib/api-utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  // ตัวเลือก "เจ้าหน้าที่" ในตัวกรองรายงาน — เป็น <Select> ธรรมดา ไม่มีช่องค้น. ตาราง users โต
  // ตามจำนวน นศ. ที่เคยล็อกอิน (ทุกคนได้แถวตอน sign-in แรก) ไม่ใช่ตามจำนวนเจ้าหน้าที่ — คน
  // ที่ยืมเองจริงเท่านั้นที่มีแถวให้กรอง ที่เหลือไม่ต้องอยู่ในลิสต์
  const users = await prisma.user.findMany({
    where: { isActive: true, OR: [{ isBorrower: false }, { dispenseRecords: { some: {} } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return json(users);
}
