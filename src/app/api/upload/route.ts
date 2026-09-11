import { NextRequest } from "next/server";
import { requireAdmin, json, error, quotaDenied } from "@/lib/api-utils";
import { consumeUploadQuota } from "@/lib/quota";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { EXT_BY_MIME, MAX_UPLOAD_BYTES, sniff } from "@/lib/uploads";

const ALLOWED_LABEL = "jpg, png, webp, pdf";

export async function POST(request: NextRequest) {
  const { user, denied } = await requireAdmin(request);
  if (denied) return denied;

  // นับก่อนอ่าน body: เพดานที่นับหลังรับไฟล์ 10MB เข้าหน่วยความจำแล้วคือเพดานที่จ่ายค่าโจมตี
  // ไปเรียบร้อยก่อนปฏิเสธ
  const overQuota = await quotaDenied(
    (tx) => consumeUploadQuota(tx, user.userId),
    "อัปโหลดถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
  );
  if (overQuota) return overQuota;

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return error("ไม่พบไฟล์ที่อัปโหลด", 400);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return error(`ไฟล์ใหญ่เกิน ${MAX_UPLOAD_BYTES / 1024 / 1024}MB`, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // The bytes decide, not the filename and not the browser-declared type — both are the
  // uploader's to set. A .pdf full of HTML, or an .exe renamed to .png, dies here.
  const kind = sniff(buffer);
  if (!kind) {
    return error(`ไฟล์ประเภทนี้ใช้ไม่ได้ รองรับ: ${ALLOWED_LABEL}`, 400);
  }
  // A declared type that disagrees with the bytes means one of the two is a lie; refuse rather
  // than pick a winner. (A blank type — some pickers send none — is not a disagreement.)
  if (file.type && file.type !== kind) {
    return error(`ชนิดไฟล์ไม่ตรงกับเนื้อไฟล์ (${file.type} ≠ ${kind})`, 400);
  }

  // Name comes from the sniff, never from file.name: the serve route picks its Content-Type by
  // extension, so a user-chosen one would let an uploader choose how their bytes are served.
  // The original name is dropped on purpose — it can carry personal data (เงินเดือน_นายสมชาย.pdf).
  const filename = `${randomUUID()}${EXT_BY_MIME[kind]}`;
  const uploadDir = join(process.cwd(), "uploads");

  await mkdir(uploadDir, { recursive: true });
  await writeFile(join(uploadDir, filename), buffer);

  return json({ url: `/uploads/${filename}` }, 201);
}
