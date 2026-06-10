import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

/**
 * GET /api/items/suggest-code
 *
 * Query params:
 *   prefix   — "CON" | "DUR" | "MED" | "KIT" | "KRU" | "ELE" | "BOOK" | "TOY"
 *   code     — (BOOK/TOY/KRU/ELE) 3-digit group code, e.g. "002"
 *   subcode  — (BOOK/TOY only) 3-digit title number, e.g. "001" — triggers copy-detection
 *   set      — (BOOK/TOY only) set size string, e.g. "S10" — used in copy prefix match
 *
 * Response:
 *   {
 *     suggestedCode: string       — full NLU-... code
 *     nextNumber: string          — just the generated segment (NNN / CNN)
 *     existingItems?: { code, name }[]  — items sharing the same base (copy detection)
 *   }
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const prefix = (searchParams.get("prefix") ?? "").toUpperCase();
  const code = searchParams.get("code") ?? "";       // 3-digit group / หมวด
  const subcode = searchParams.get("subcode") ?? ""; // 3-digit title (BOOK/TOY)
  const set = searchParams.get("set") ?? "";         // e.g. "S10" (BOOK/TOY)

  if (!prefix) {
    return NextResponse.json({ error: "prefix required" }, { status: 400 });
  }

  const FLAT = ["DUR", "CON", "MED", "KIT"];
  const INDIVIDUAL = ["KRU", "ELE"];
  const COPY_TRACK = ["BOOK", "TOY"];

  // ── 1. Flat: NLU-CON-NNN ─────────────────────────────────────────────────
  if (FLAT.includes(prefix)) {
    const likePrefix = `NLU-${prefix}-`;
    const items = await prisma.item.findMany({
      where: { code: { startsWith: likePrefix } },
      select: { code: true },
      orderBy: { code: "desc" },
    });

    const maxNum = items.reduce((max, item) => {
      const parts = item.code.split("-");
      const n = parseInt(parts[2] ?? "0", 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);

    const next = String(maxNum + 1).padStart(3, "0");
    return NextResponse.json({
      suggestedCode: `NLU-${prefix}-${next}`,
      nextNumber: next,
    });
  }

  // ── 2. KRU / ELE: NLU-ELE-NNN(group)-NNN(copy) ───────────────────────────
  if (INDIVIDUAL.includes(prefix)) {
    if (!code) {
      // No group yet — suggest next CODE group
      const likePrefix = `NLU-${prefix}-`;
      const items = await prisma.item.findMany({
        where: { code: { startsWith: likePrefix } },
        select: { code: true, name: true },
      });

      // Extract unique CODE groups with their first name
      const groups = new Map<string, string>();
      for (const item of items) {
        const parts = item.code.split("-");
        const grp = parts[2];
        if (grp && !groups.has(grp)) groups.set(grp, item.name);
      }

      const maxGroup = [...groups.keys()].reduce((max, g) => {
        const n = parseInt(g, 10);
        return isNaN(n) ? max : Math.max(max, n);
      }, 0);
      const nextGroup = String(maxGroup + 1).padStart(3, "0");

      return NextResponse.json({
        suggestedCode: `NLU-${prefix}-${nextGroup}`,
        nextNumber: nextGroup,
        groups: [...groups.entries()].map(([g, name]) => ({ code: g, name })).sort((a, b) => a.code.localeCompare(b.code)),
      });
    }

    // Has group — suggest next SUBCODE within that group
    const likeGroup = `NLU-${prefix}-${code}-`;
    const items = await prisma.item.findMany({
      where: { code: { startsWith: likeGroup } },
      select: { code: true, name: true },
      orderBy: { code: "asc" },
    });

    const maxSub = items.reduce((max, item) => {
      const parts = item.code.split("-");
      const n = parseInt(parts[3] ?? "0", 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    const nextSub = String(maxSub + 1).padStart(3, "0");

    return NextResponse.json({
      suggestedCode: `NLU-${prefix}-${code}-${nextSub}`,
      nextNumber: nextSub,
      existingCount: items.length,
    });
  }

  // ── 3. BOOK / TOY: NLU-BOOK-NNN(หมวด)-NNN(title)-SNN-CNN ─────────────────
  if (COPY_TRACK.includes(prefix)) {
    if (!code) {
      return NextResponse.json({ error: "code (หมวด) required for BOOK/TOY" }, { status: 400 });
    }

    if (!subcode) {
      // Suggest next SUBCODE (title running number) within this หมวด
      const likeBase = `NLU-${prefix}-${code}-`;
      const items = await prisma.item.findMany({
        where: { code: { startsWith: likeBase } },
        select: { code: true },
      });

      const maxSub = items.reduce((max, item) => {
        const parts = item.code.split("-");
        const n = parseInt(parts[3] ?? "0", 10);
        return isNaN(n) ? max : Math.max(max, n);
      }, 0);
      const nextSub = String(maxSub + 1).padStart(3, "0");

      return NextResponse.json({
        suggestedCode: `NLU-${prefix}-${code}-${nextSub}`,
        nextNumber: nextSub,
      });
    }

    // Has subcode — detect copies
    // Build match prefix: NLU-BOOK-013-001 or NLU-BOOK-013-001-S10
    const basePrefix = set
      ? `NLU-${prefix}-${code}-${subcode}-${set}`
      : `NLU-${prefix}-${code}-${subcode}`;

    const existing = await prisma.item.findMany({
      where: { code: { startsWith: basePrefix } },
      select: { code: true, name: true },
      orderBy: { code: "asc" },
    });

    // Count copies: items with -CNN suffix
    const copyNums = existing
      .map((item) => {
        const match = item.code.match(/-C(\d{2})$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => n > 0);

    const maxCopy = copyNums.length > 0 ? Math.max(...copyNums) : 0;
    const isCopy = existing.length > 0;
    const nextCopy = String(maxCopy + 1).padStart(2, "0");

    let suggestedCode: string;
    if (!isCopy) {
      // No existing — this is the first one, no CNN needed
      suggestedCode = basePrefix;
    } else if (maxCopy === 0 && existing.length > 0) {
      // Existing item has no CNN (it's the original) → new one gets C01, and existing stays
      suggestedCode = `${basePrefix}-C01`;
    } else {
      suggestedCode = `${basePrefix}-C${nextCopy}`;
    }

    return NextResponse.json({
      suggestedCode,
      nextNumber: isCopy ? `C${nextCopy}` : null,
      existingItems: existing.map((i) => ({ code: i.code, name: i.name })),
      isCopy,
    });
  }

  return NextResponse.json({ error: "Unknown prefix" }, { status: 400 });
}
