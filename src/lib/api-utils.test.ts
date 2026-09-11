import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@/generated/prisma/client";
import { handleError } from "./api-utils";

const body = async (r: Response) => (await r.json()) as { error: string };

test("ข้อความที่เราโยนเองถึงผู้ใช้ แต่รูปร่างฐานข้อมูลของ Prisma ไม่ถึง", async () => {
  const mine = handleError(new Error("ล็อต L-2501 เหลือไม่พอ"), "เบิกไม่สำเร็จ");
  assert.equal((await body(mine)).error, "ล็อต L-2501 เหลือไม่พอ");

  // ชื่อคอลัมน์ ชื่อ constraint และค่าที่ชนต้องไม่หลุดออกไปกับ response
  const known = new Prisma.PrismaClientKnownRequestError(
    "Unique constraint failed on the fields: (`email`)",
    { code: "P2002", clientVersion: "6" },
  );
  assert.equal((await body(handleError(known, "เพิ่มผู้ใช้ไม่สำเร็จ"))).error, "เพิ่มผู้ใช้ไม่สำเร็จ");

  const invalid = new Prisma.PrismaClientValidationError("Argument `where` is missing", { clientVersion: "6" });
  assert.equal((await body(handleError(invalid, "บันทึกไม่สำเร็จ"))).error, "บันทึกไม่สำเร็จ");

  // สถานะยังส่งต่อได้เหมือนเดิม และของที่ไม่ใช่ Error ตกไปที่ fallback
  const opaque = handleError("boom", "ดึงชื่อวิชาไม่สำเร็จ", 502);
  assert.equal(opaque.status, 502);
  assert.equal((await body(opaque)).error, "ดึงชื่อวิชาไม่สำเร็จ");
});
