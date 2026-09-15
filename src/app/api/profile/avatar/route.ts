import { NextRequest } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { requireAuth, json, error, quotaDenied } from "@/lib/api-utils";
import { consumeUploadQuota } from "@/lib/quota";
import { EXT_BY_MIME, MAX_UPLOAD_BYTES, sniff } from "@/lib/uploads";
import { uploadFilename } from "@/lib/upload-files";
import { prisma } from "@/lib/prisma";

// รูปโปรไฟล์ของผู้ที่ล็อกอินอยู่เท่านั้น — ทุก role รวม BORROWER จึงไม่ใช้ /api/upload ที่ต้องเป็น
// admin. ตัว dialog ครอปและย่อเป็น webp มาแล้ว แต่ด่านยังตัดสินจากไบต์เหมือน /api/upload
export async function POST(request: NextRequest) {
  const { user, denied } = await requireAuth(request);
  if (denied) return denied;

  const overQuota = await quotaDenied(
    (tx) => consumeUploadQuota(tx, user.userId),
    "อัปโหลดถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
  );
  if (overQuota) return overQuota;

  const file = (await request.formData()).get("file");
  if (!(file instanceof File)) return error("ไม่พบไฟล์ที่อัปโหลด", 400);
  if (file.size > MAX_UPLOAD_BYTES) return error(`ไฟล์ใหญ่เกิน ${MAX_UPLOAD_BYTES / 1024 / 1024}MB`, 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  const kind = sniff(buffer);
  if (!kind || kind === "application/pdf") return error("รองรับเฉพาะรูป jpg, png, webp", 400);

  const dir = join(process.cwd(), "uploads");
  const filename = `${randomUUID()}${EXT_BY_MIME[kind]}`;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), buffer);

  const url = `/uploads/${filename}`;
  const before = await prisma.user.findUnique({ where: { id: user.userId }, select: { avatarUrl: true } });
  await prisma.user.update({ where: { id: user.userId }, data: { avatarUrl: url } });

  // รูปเก่าไม่มีใครอ้างถึงแล้ว (avatarUrl เป็นของคนเดียว) — ลบทิ้ง ลบไม่ได้ก็ไม่เป็นไร
  const old = before?.avatarUrl && uploadFilename([before.avatarUrl.replace(/^\/uploads\//, "")]);
  if (old) await unlink(join(dir, old)).catch(() => {});

  return json({ url }, 201);
}
