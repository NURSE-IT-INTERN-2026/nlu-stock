// ยืมเอง — นศ./บุคลากรสแกน QR แล้วกดเบิก/ยืมเองจากหน้าพัสดุ ไม่ผ่านเจ้าหน้าที่ ไม่ต้องอนุมัติ.
// Shared by /api/borrow (the enforcer) and the item page (which only decides whether to
// render the button). Pure — no db, no request.

/** กำหนดคืน ตั้งต้น = 24 ชม. จากเวลาที่กดยืม. Consumables ignore it — เบิกใช้ never comes back. */
export const SELF_BORROW_HOURS = 24;
export const SELF_BORROW_DEFAULT_DAYS = 1;
/** เพดานที่ยืดเองได้. Not a policy anyone stated — a guardrail so a slip on the date picker
 *  cannot file a loan due in 2099. Raise it here if the คณะ wants longer self-service loans. */
export const SELF_BORROW_MAX_DAYS = 30;

/**
 * กำหนดคืน = ตอนนี้ + N วัน (วันละ 24 ชม.) ไม่ใช่สิ้นวันที่ N — ยืมบ่ายสาม คืนบ่ายสาม.
 * N comes from the borrower (default 1), and the SERVER computes the timestamp: a client that
 * posts its own dueAt is a client that can post any dueAt, including one already past.
 */
export function selfBorrowDueAt(days: number = SELF_BORROW_DEFAULT_DAYS, from: Date = new Date()): Date {
  const n = Number.isFinite(days) ? Math.min(Math.max(Math.trunc(days), 1), SELF_BORROW_MAX_DAYS) : SELF_BORROW_DEFAULT_DAYS;
  return new Date(from.getTime() + n * SELF_BORROW_HOURS * 60 * 60 * 1000);
}

/** The shape both callers can supply: the API from Prisma, the page from its item JSON. */
export interface SelfBorrowItem {
  selfBorrowable: boolean;
  /** null = ตามประเภท. Only an exception ever carries a number of its own. */
  selfBorrowLimit: number | null;
  availableQty: number;
  trackIndividually: boolean;
  dispenseType: string;
  /** CategoryProfile.selfBorrowable — closes a whole ประเภท at once. */
  profileSelfBorrowable: boolean;
  /** CategoryProfile.selfBorrowLimit — the number almost every item actually uses. */
  profileSelfBorrowLimit: number;
}

/**
 * Two switches, both must be on, and they only ever close:
 *   CategoryProfile.selfBorrowable — a whole ประเภท (KIT is off: a teaching set has to be
 *     checked by staff, because nothing in the system deducts the consumables inside it).
 *   Item.selfBorrowable — one item inside an otherwise-open ประเภท.
 *
 * Note there is no rule about dispenseType or assetTracking any more. Every ประเภท including
 * ครุภัณฑ์ and วัสดุสิ้นเปลือง is open by default — this is stock inside NLU's own building
 * being handed to its own students and staff, who are named on every record either way.
 *
 * Availability is checked separately (by the caller / the API transaction) because a
 * temporarily empty shelf is not the same answer as "this item is not lendable".
 */
export function isSelfBorrowable(item: SelfBorrowItem): boolean {
  return item.profileSelfBorrowable && item.selfBorrowable;
}

/** เบิกใช้ (ไม่ต้องคืน) vs ยืม (มีกำหนดคืน) — same split lib/dispense-kind draws. */
export function isConsumeOnly(item: Pick<SelfBorrowItem, "dispenseType">): boolean {
  return item.dispenseType === "CONSUMABLE";
}

/**
 * เพดานต่อการกด 1 ครั้ง. The ประเภท sets it; an item overrides only when it is an exception —
 * same null-means-inherit shape as countCycleFor, and for the same reason: a number that has
 * to be typed on every row is a number nobody types.
 *
 * ponytail: caps ONE press, not a person's running total. Someone can press it again. Add an
 * outstanding-per-borrower count in /api/borrow if that turns out to matter.
 */
export function selfBorrowLimitFor(override: number | null | undefined, profileLimit: number): number {
  if (override != null && Number.isFinite(override) && override > 0) return override;
  return profileLimit;
}

/** How many units one person may take at once. Tracked items go out a piece at a time. */
export function selfBorrowMax(item: SelfBorrowItem): number {
  if (item.trackIndividually) return 1;
  const limit = selfBorrowLimitFor(item.selfBorrowLimit, item.profileSelfBorrowLimit);
  return Math.max(0, Math.min(limit, item.availableQty));
}
