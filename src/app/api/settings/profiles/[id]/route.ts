import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, json, notFound, error, parseBody } from "@/lib/api-utils";
import { profileUpdateSchema } from "@/lib/validators";
import { NextRequest } from "next/server";

// Behavior fields can only change while the profile has no items (see validators/profile.ts).
// selfBorrowable/selfBorrowLimit are deliberately NOT here: they decide who may take stock
// out, not how the stock is modelled, so they stay editable for a profile full of items.
const BEHAVIOR_FIELDS = ["code", "dispenseType", "assetTracking"] as const;

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const { data, error: parseError } = await parseBody(profileUpdateSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  // Compare against the stored row rather than testing for the key's presence. The edit form
  // posts the whole profile every time, so presence alone meant every save on a stocked
  // profile was a 409 — including one that only renamed it, or that flipped ให้เบิก-ยืมเอง.
  const current = await prisma.categoryProfile.findUnique({ where: { id } });
  if (!current) return notFound("Profile not found");

  const patch = data as Record<string, unknown>;
  const changesBehavior = BEHAVIOR_FIELDS.some(
    (f) => f in patch && patch[f] !== (current as Record<string, unknown>)[f],
  );
  if (changesBehavior) {
    const itemCount = await prisma.item.count({
      where: { category: { profileId: id } },
    });
    if (itemCount > 0) return error("เปลี่ยนพฤติกรรมประเภทไม่ได้เพราะมีพัสดุอยู่", 409);
  }

  try {
    const profile = await prisma.categoryProfile.update({ where: { id }, data });
    // หมวดย่อยตัวตั้งต้น (ดู POST /api/settings/profiles) ใช้ชื่อเดียวกับประเภทและถูกซ่อนใน UI
    // เปลี่ยนชื่อประเภทจึงต้องลากมันตามไป ไม่งั้นตัวกรองจะโผล่ชั้นสองที่ยังใช้ชื่อเก่า.
    // แตะเฉพาะตอนที่มันยังเป็นหมวดย่อยตัวเดียวและยังไม่ถูกตั้งชื่อเอง
    if (typeof patch.name === "string" && patch.name !== current.name) {
      const subs = await prisma.categoryType.findMany({ where: { profileId: id } });
      const untouched = [current.name, `${current.name} (${current.code})`];
      if (subs.length === 1 && untouched.includes(subs[0].name)) {
        // ชื่อใหม่อาจชนหมวดย่อยอื่น — ปล่อยชื่อเดิมไว้ดีกว่าทำ PUT ทั้งก้อนพัง
        await prisma.categoryType
          .update({ where: { id: subs[0].id }, data: { name: profile.name } })
          .catch(() => {});
      }
    }
    return json(profile);
  } catch {
    return notFound("Profile not found");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;

  // เดิมกันไว้ที่ "มีหมวดหมู่ย่อย" — ใช้ไม่ได้แล้วเพราะทุกประเภทมีตัวตั้งต้นติดมาหนึ่งตัวเสมอ
  // ด่านจริงคือพัสดุ: หมวดย่อยที่ไม่มีของอยู่เป็นแค่โครง ลบไปพร้อมประเภทได้
  const itemCount = await prisma.item.count({ where: { category: { profileId: id } } });
  if (itemCount > 0) return error("ลบไม่ได้เนื่องจากประเภทนี้มีพัสดุอยู่", 409);

  try {
    await prisma.$transaction([
      prisma.categoryType.deleteMany({ where: { profileId: id } }),
      prisma.categoryProfile.delete({ where: { id } }),
    ]);
    return json({ success: true });
  } catch {
    return notFound("Profile not found");
  }
}
