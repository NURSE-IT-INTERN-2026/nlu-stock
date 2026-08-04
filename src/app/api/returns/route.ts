import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden, handleError } from "@/lib/api-utils";
import { recomputeItemCounts } from "@/lib/stock";
import { resolveSubItemReturn } from "@/lib/returns";

// Per-row return condition chosen in the return detail view.
const CONDITIONS = ["AVAILABLE", "DAMAGED", "LOST"] as const;
type ReturnCondition = (typeof CONDITIONS)[number];

const BORROWABLE: Prisma.ItemWhereInput = {
  category: { profile: { dispenseType: { in: ["COUNT", "ITEM"] } } },
};

const ITEM_INCLUDE = {
  item: {
    select: {
      id: true,
      code: true,
      name: true,
      imageUrl: true,
      issueUnit: { select: { name: true } },
      category: { select: { name: true, profile: { select: { dispenseType: true } } } },
      location: { select: { building: true, floor: true, room: true, detail: true } },
      _count: { select: { subItems: true } },
    },
  },
  subItem: { select: { id: true, subCode: true, name: true, serialNumber: true } },
  staff: { select: { name: true } },
} as const;

// Lists loans for the รับคืน tab grouped client-side by loanGroupId (one card per borrow event).
// 2-step: find loanGroupIds with an open BORROW record, then fetch ALL records in those groups
// (including already-returned ones) so the UI can show "ค้าง X/Y". Legacy null-loanGroupId
// records are returned singly (Y = X). Consumables + INUSE (ตั้งใช้ในห้อง) are filtered out —
// BORROWABLE must be on BOTH queries: a cart mixing วัสดุสิ้นเปลือง with a durable shares one
// loanGroupId, and a consumable line never gets returnedAt, so without it the card counts a
// permanently-open row as ค้าง and never clears.
// Keep every open loan EXCEPT per-unit (trackIndividually) INUSE — those return via
// คืนเข้าพัสดุ (status route), not here. COUNT-type INUSE still returns numerically through
// this screen, so it must stay visible. null loanType = legacy BORROW.
// (Avoid NOT:{AND:[INUSE,tracked]} — Prisma over-filters it to 6 instead of 20; explicit OR is correct.)
const NOT_TRACKED_INUSE = {
  OR: [
    { loanType: null },
    { loanType: "BORROW" as const },
    { AND: [{ loanType: "INUSE" as const }, { item: { trackIndividually: false } }] },
  ],
} satisfies Prisma.DispenseRecordWhereInput;
export async function GET() {
  const auth = await requireAuth();
  if (auth.denied) return auth.denied;

  const open = await prisma.dispenseRecord.findMany({
    where: { returnedAt: null, item: BORROWABLE, ...NOT_TRACKED_INUSE },
    select: { loanGroupId: true },
  });
  const groupIds = [...new Set(open.map((r) => r.loanGroupId).filter(Boolean) as string[])];

  const [grouped, legacy] = await Promise.all([
    groupIds.length
      ? prisma.dispenseRecord.findMany({ where: { loanGroupId: { in: groupIds }, item: BORROWABLE, ...NOT_TRACKED_INUSE }, include: ITEM_INCLUDE, orderBy: { dispensedAt: "desc" } })
      : Promise.resolve([]),
    prisma.dispenseRecord.findMany({ where: { returnedAt: null, loanGroupId: null, item: BORROWABLE, ...NOT_TRACKED_INUSE }, include: ITEM_INCLUDE, orderBy: { dispensedAt: "desc" } }),
  ]);

  return NextResponse.json({ records: [...grouped, ...legacy] });
}

// Return per-unit SubItems from a loan event, each with its own condition.
// DAMAGED → SubItem ชำรุด, queued on แจ้งชำรุด until someone sends it for repair.
// Count-based loans use the single /api/items/[id]/return (numeric).
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;
  if (auth.user.role === "INSTRUCTOR") return forbidden();

  const body = await req.json();
  const rawEntries = Array.isArray(body?.entries) ? body.entries : [];
  const overallNote = (body?.note as string | undefined)?.trim() || null;
  const proofUrls = Array.isArray(body?.proofUrls) ? (body.proofUrls as string[]).filter(Boolean) : undefined;

  if (rawEntries.length === 0) {
    return NextResponse.json({ error: "No entries" }, { status: 400 });
  }

  type Entry = { dispenseRecordId: string; subItemId: string; status: ReturnCondition; note?: string; photos?: string[] };
  const entries: Entry[] = [];
  for (const e of rawEntries) {
    if (!e?.dispenseRecordId || !e?.subItemId) {
      return NextResponse.json({ error: "Entry missing dispenseRecordId/subItemId" }, { status: 400 });
    }
    if (!CONDITIONS.includes(e.status)) {
      return NextResponse.json({ error: `Invalid status: ${e.status}` }, { status: 400 });
    }
    entries.push({
      dispenseRecordId: e.dispenseRecordId,
      subItemId: e.subItemId,
      status: e.status,
      note: typeof e.note === "string" ? e.note.trim() : undefined,
      photos: Array.isArray(e.photos) ? (e.photos as string[]).filter(Boolean) : undefined,
    });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const affectedItems = new Set<string>();
      for (const e of entries) {
        const sub = await tx.subItem.findUnique({
          where: { id: e.subItemId },
          select: { itemId: true },
        });
        if (!sub) throw new Error(`Sub-item ${e.subItemId} not found`);

        const rowNote = [overallNote, e.note].filter(Boolean).join(" · ") || null;
        // Per-entry evidence (when damaged/lost) stamps this dispense record.
        const entryProofs = [...(proofUrls ?? []), ...(e.photos ?? [])];

        // A damaged return lands on ชำรุด and stops there. It does NOT jump to ส่งซ่อม:
        // sending for repair is a separate decision that has to capture ภายใน/ภายนอก and
        // where it went, so it happens on the แจ้งชำรุด screen with its own log row.
        await resolveSubItemReturn(tx, {
          itemId: sub.itemId,
          subItemId: e.subItemId,
          status: e.status,
          note: rowNote,
          userId: auth.user.userId,
          dispenseRecordId: e.dispenseRecordId,
          proofUrls: entryProofs.length > 0 ? entryProofs : undefined,
        });

        affectedItems.add(sub.itemId);
      }
      // recompute each affected item once
      for (const itemId of affectedItems) {
        await recomputeItemCounts(tx, itemId);
      }
    });

    return NextResponse.json({ success: true, count: entries.length });
  } catch (err) {
    return handleError(err, "Batch return failed");
  }
}
