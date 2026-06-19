import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

/**
 * GET /api/items/suggest-code?prefix=XXX
 *
 * Uniform scheme (ADR-0001): every item code is `NLU-{PREFIX}-{NNN}`
 * (+ optional `-{SNN}` set on BOOK/TOY, applied client-side; copy `-{CNN}`
 * lives on the SubItem). This endpoint only suggests the next running NNN
 * for a prefix — no group/title parsing, no string scanning beyond the NNN
 * segment.
 *
 * Response:
 *   { suggestedCode: "NLU-BOOK-043", nextNumber: "043" }
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prefix = (new URL(req.url).searchParams.get("prefix") ?? "").toUpperCase();
  if (!prefix) return NextResponse.json({ error: "prefix required" }, { status: 400 });

  const items = await prisma.item.findMany({
    where: { code: { startsWith: `NLU-${prefix}-` } },
    select: { code: true },
  });

  // NNN is always the 3rd segment (NLU-PREFIX-NNN[-S..])
  const max = items.reduce((m, item) => {
    const seg = item.code.split("-")[2];
    const n = seg ? parseInt(seg, 10) : 0;
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);

  const nextNumber = String(max + 1).padStart(3, "0");
  return NextResponse.json({
    suggestedCode: `NLU-${prefix}-${nextNumber}`,
    nextNumber,
  });
}
