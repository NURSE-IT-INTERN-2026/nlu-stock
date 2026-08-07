import { prisma } from "@/lib/prisma";
import { locationLabel } from "@/lib/constants";
import { damagedQtyOf } from "@/lib/stock";
import { AdjustmentReason, ItemStatus } from "@/generated/prisma/enums";

/**
 * Where an item's stock physically is, right now, as one flat list.
 *
 * DERIVED, never stored. Everything here already exists in three places the app writes on
 * every dispense and return — SubItem.locationId, Item.availableQty, and the open
 * DispenseRecords — so a fourth counter would only be a fourth thing to fall out of sync
 * (see AGENTS.md on availableQty vs SUM(lots), the last time this project stored a total
 * twice). The cost is one extra query per item detail; the payoff is that this can't lie.
 *
 * No location is privileged. Item.locationId is "ที่ตั้งตามทะเบียน" and comes back as an
 * ordinary row — staff decide for themselves which room is the real home by looking at the
 * numbers, so the table has no reason to bless one of them.
 *
 * Stock away from its registered location counts as ใช้งานอยู่, not ว่าง: a chair standing
 * in a classroom is not something the next person can walk into the storeroom and draw.
 * Moving it back is an explicit act (คืนเข้าคลัง), which is exactly what makes it visible.
 */
export type DistributionRow = {
  /** "location" = sitting somewhere; "borrower" = out with a person, owed back. */
  kind: "location" | "borrower";
  label: string;
  qty: number;
  state: "AVAILABLE" | "IN_USE" | "ON_LOAN" | "DAMAGED";
  /** Loan rows only — when it went out, so ของค้างนาน is visible at a glance. */
  since?: Date;
  dueAt?: Date | null;
  /**
   * Stock that IS in use but whose room was never recorded — records written before
   * นำไปใช้งาน required a real Location. Flagged rather than left to a label match so the
   * UI can say why the row exists instead of reading as missing data.
   */
  unlocated?: true;
};

/** Rows a piece/qty in these statuses never contributes: it isn't anywhere anymore. */
const GONE: ReadonlySet<ItemStatus> = new Set([ItemStatus.DISPOSED, ItemStatus.LOST]);

export async function getItemDistribution(itemId: string): Promise<DistributionRow[]> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      availableQty: true,
      trackIndividually: true,
      location: true,
      locationId: true,
      category: { select: { profile: { select: { dispenseType: true } } } },
    },
  });
  if (!item) return [];

  const homeLabel = item.location ? locationLabel(item.location) : "ไม่ระบุที่ตั้ง";

  // Consumables are drawn to be used up, not handed out and owed back: their dispense
  // records keep returnedAt null forever, which would read as a permanent loan to whoever
  // signed for the last box of gloves. What is left is simply what is on the shelf.
  if (item.category.profile?.dispenseType === "CONSUMABLE") {
    return item.availableQty > 0
      ? [{ kind: "location", label: homeLabel, qty: item.availableQty, state: "AVAILABLE" }]
      : [];
  }

  // Loans (BORROW) are custody, not a place — one row per open loan, named after the person.
  // They stay separate from the location rows because "อยู่กับ อ.สมชาย" answers a different
  // question than "อยู่ห้อง 402", even though both explain the same missing units.
  // Explicit OR, never `loanType: { not: "INUSE" }` — that compiles to a NULL-unsafe
  // `!= 'INUSE'` which silently drops every legacy row, and legacy null IS a borrow
  // (schema.prisma on DispenseRecord.loanType). Same trap as api/returns/route.ts.
  const loans = await prisma.dispenseRecord.findMany({
    where: { itemId, returnedAt: null, OR: [{ loanType: null }, { loanType: "BORROW" }] },
    select: {
      quantity: true, resolvedQty: true, dispensedAt: true, dueAt: true,
      recipient: true, staff: { select: { name: true } },
    },
    orderBy: { dispensedAt: "asc" },
  });

  const borrowerRows: DistributionRow[] = loans
    .map((l) => ({
      kind: "borrower" as const,
      label: l.recipient?.trim() || l.staff.name,
      qty: l.quantity - l.resolvedQty,
      state: "ON_LOAN" as const,
      since: l.dispensedAt,
      dueAt: l.dueAt,
    }))
    .filter((r) => r.qty > 0);

  const locationRows = item.trackIndividually
    ? await trackedRows(itemId, homeLabel)
    : await countedRows(itemId, item.availableQty, homeLabel);

  return [...locationRows, ...borrowerRows, ...(await damagedRows(itemId, homeLabel))];
}

/**
 * Stock pulled out of service as ชำรุด and not yet handed back.
 *
 * Derived from the adjustments that booked it, not from a counter: each แจ้งชำรุด writes a
 * StockAdjustment with reason DAMAGED_PENDING_REPAIR that deducts availableQty and leaves
 * totalQty alone, and รับคืนจากซ่อม stamps `recoveredAt` on that same row. So "how much is
 * still broken" is the open rows, the way ON_LOAN is the open loans — one fact, one place.
 *
 * Tracked items are excluded on purpose: their damage lives on the piece (SubItem.status),
 * which trackedRows already reports, and booking it twice would double the count.
 */
async function damagedRows(itemId: string, homeLabel: string): Promise<DistributionRow[]> {
  const open = await prisma.stockAdjustment.findMany({
    where: { itemId, reason: AdjustmentReason.DAMAGED_PENDING_REPAIR, recoveredAt: null },
    select: { previousQty: true, newQty: true, recoveredAt: true },
  });
  const qty = damagedQtyOf(open);
  return qty > 0 ? [{ kind: "location", label: homeLabel, qty, state: "DAMAGED" }] : [];
}

/**
 * Tracked items carry their room on each piece, so the breakdown is a plain group-by.
 * A null SubItem.locationId means "wherever the spec lives" (1130 of 1132 rows hold null) —
 * it folds into the registered-location row rather than becoming an "unknown" bucket.
 * ON_LOAN pieces are skipped: the borrower rows above already account for them.
 */
async function trackedRows(itemId: string, homeLabel: string): Promise<DistributionRow[]> {
  const subs = await prisma.subItem.findMany({
    where: { itemId },
    select: { status: true, location: true, locationId: true },
  });

  const buckets = new Map<string, DistributionRow>();
  for (const s of subs) {
    if (GONE.has(s.status) || s.status === ItemStatus.ON_LOAN) continue;
    const label = s.location ? locationLabel(s.location) : homeLabel;
    // A piece in for repair still sits somewhere, but it is not stock anyone can use —
    // group it with ใช้งานอยู่ rather than inflating the ว่าง count for that room.
    const state = s.status === ItemStatus.AVAILABLE ? "AVAILABLE" : "IN_USE";
    const key = `${label}|${state}`;
    const row = buckets.get(key);
    if (row) row.qty += 1;
    else buckets.set(key, { kind: "location", label, qty: 1, state });
  }
  return [...buckets.values()].sort(byHomeFirst(homeLabel));
}

/**
 * COUNT items have no per-unit row to hang a room on, so the split is: whatever is still
 * available sits at the registered location, and every open INUSE record accounts for the
 * rest. That is why นำไปใช้งาน must name a real Location (validators/dispense.ts) — an
 * unnamed record here would be stock with nowhere to appear.
 *
 * Rows written before that rule still exist with locationId NULL and a free-text room in
 * notes; they land in one honest "ไม่ระบุที่ตั้ง" row instead of being dropped, so the
 * column still adds up to what the item claims to own.
 */
async function countedRows(itemId: string, availableQty: number, homeLabel: string): Promise<DistributionRow[]> {
  const stationed = await prisma.dispenseRecord.findMany({
    where: { itemId, returnedAt: null, loanType: "INUSE" },
    select: { quantity: true, resolvedQty: true, location: true },
  });

  const rows: DistributionRow[] = availableQty > 0
    ? [{ kind: "location", label: homeLabel, qty: availableQty, state: "AVAILABLE" }]
    : [];

  const buckets = new Map<string, DistributionRow>();
  for (const d of stationed) {
    const qty = d.quantity - d.resolvedQty;
    if (qty <= 0) continue;
    const label = d.location ? locationLabel(d.location) : "ไม่ระบุที่ตั้ง";
    const row = buckets.get(label);
    if (row) row.qty += qty;
    else buckets.set(label, { kind: "location", label, qty, state: "IN_USE", ...(d.location ? {} : { unlocated: true } as const) });
  }

  return [...rows, ...[...buckets.values()].sort(byHomeFirst(homeLabel))];
}

/** Registered location first, then alphabetical — a stable order, not a claim of importance. */
function byHomeFirst(homeLabel: string) {
  return (a: DistributionRow, b: DistributionRow) =>
    (a.label === homeLabel ? -1 : b.label === homeLabel ? 1 : 0) || a.label.localeCompare(b.label, "th");
}
