import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { MIME_BY_EXT } from "@/lib/uploads";
import { requireAuth, forbidden, notFound } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { uploadFilename, readStoredUpload } from "@/lib/upload-files";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const auth = await requireAuth(_request);
  if (auth.denied) return auth.denied;
  const { path } = await params;
  const filename = uploadFilename(path);
  if (!filename) return notFound();

  if (auth.user.role === "BORROWER") {
    const url = `/uploads/${filename}`;
    const [item, piece, adjustment, maintenance, status] = await Promise.all([
      prisma.item.findFirst({ where: { OR: [{ imageUrl: url }, { images: { has: url } }] }, select: { id: true } }),
      prisma.subItem.findFirst({ where: { OR: [{ imageUrl: url }, { images: { has: url } }] }, select: { id: true } }),
      prisma.stockAdjustment.findFirst({ where: { imageEvidenceUrls: { has: url } }, select: { id: true } }),
      prisma.maintenanceRecord.findFirst({ where: { attachmentUrls: { has: url } }, select: { id: true } }),
      prisma.itemStatusLog.findFirst({ where: { imageUrls: { has: url } }, select: { id: true } }),
    ]);
    // Evidence takes precedence even if the same URL was also added to an item gallery.
    if ((!item && !piece) || adjustment || maintenance || status) return forbidden();
  }

  let buffer: Buffer;
  try {
    buffer = await readStoredUpload(join(process.cwd(), "uploads"), filename);
  } catch {
    return notFound();
  }

  const ext = "." + filename.split(".").pop()!.toLowerCase();
  const contentType = MIME_BY_EXT[ext] || "application/octet-stream";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Vary": "Cookie",
    },
  });
}
