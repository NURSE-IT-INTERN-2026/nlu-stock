import { NextRequest } from "next/server";
import { requireAuth, json, error } from "@/lib/api-utils";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  const { denied } = await requireAuth(request);
  if (denied) return denied;

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return error("No file provided", 400);
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return error(`Unsupported file type: ${file.type}. Allowed: jpg, png, webp, pdf`, 400);
  }

  if (file.size > MAX_SIZE) {
    return error(`File too large. Max ${MAX_SIZE / 1024 / 1024}MB`, 400);
  }

  const ext = file.name.split(".").pop() || "bin";
  const filename = `${randomUUID()}.${ext}`;
  const uploadDir = join(process.cwd(), "uploads");

  await mkdir(uploadDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(uploadDir, filename), buffer);

  return json({ url: `/uploads/${filename}` }, 201);
}
