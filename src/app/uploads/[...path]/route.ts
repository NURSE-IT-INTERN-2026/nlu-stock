import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { join } from "path";

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const filePath = join(process.cwd(), "uploads", ...path);

  // Prevent path traversal
  if (!filePath.startsWith(join(process.cwd(), "uploads"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = "." + (path[path.length - 1]?.split(".").pop() ?? "");
  const contentType = MIME_MAP[ext] || "application/octet-stream";
  const buffer = await readFile(filePath);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
