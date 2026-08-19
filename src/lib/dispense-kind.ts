/**
 * ชนิดของการออกจากคลัง — สามอย่างที่ DispenseRecord แถวเดียวกันเป็นได้.
 *
 * One table holds three different real events, and a report that mixes them answers no
 * question honestly: เบิกใช้ never comes back so "ยังไม่คืน" is meaningless on it, ยืม has
 * a due date and someone to chase, นำไปใช้งาน has a room and no due date at all.
 *
 * Resolution order matters and is fixed here so every caller buckets a row the same way:
 *   1. loanType = INUSE            → นำไปใช้งาน (whatever the item's dispenseType)
 *   2. dispenseType = CONSUMABLE   → เบิกใช้
 *   3. everything else             → ยืม
 * loanType is NOT NULL: เบิกใช้ writes CONSUME, so no reader has to guess what a missing
 * value meant. It used to be nullable, where NULL stood for both "เบิกใช้" and "row written
 * before the column existed" at once — and every loan query had to spell out
 * `OR [{ loanType: null }, { loanType: "BORROW" }]` because Prisma compiles `not: "INUSE"`
 * into a NULL-unsafe comparison that drops those rows silently.
 *
 * Every row lands in exactly one kind, so the three segments add up to the whole table —
 * asserted against the database in dispense-kind.test.ts.
 *
 * ponytail: no Prisma import here on purpose. The report tab is a client component and
 * imports the labels; pulling in the generated client took the whole Prisma runtime into the
 * browser bundle and Turbopack refused to build it. The queries live in dispense-kind-where.ts.
 */
export const DISPENSE_KINDS = ["consume", "borrow", "inuse"] as const;
export type DispenseKind = (typeof DISPENSE_KINDS)[number];

export const DISPENSE_KIND_LABELS: Record<DispenseKind, string> = {
  consume: "เบิกใช้",
  borrow: "ยืม",
  inuse: "นำไปใช้งาน",
};

/**
 * The two loan columns, decided per line at write time (api/dispense).
 *
 * เบิกใช้ gets its own value rather than borrowing BORROW's: a consumable used to file as
 * BORROW with a due date, which reads as an open loan to anyone looking at the row. Nothing
 * broke only because every loan query AND-s a dispenseType filter over it — a guard the next
 * query to be written could easily forget. CONSUME carries no dueAt and never returns.
 */
export function loanFields(
  dispenseType: string,
  inRoom: boolean,
  dueAt: Date | null,
): { loanType: "BORROW" | "INUSE" | "CONSUME"; dueAt: Date | null } {
  if (dispenseType === "CONSUMABLE") return { loanType: "CONSUME", dueAt: null };
  // นำไปใช้งาน is open-ended — a room, not a debt.
  return { loanType: inRoom ? "INUSE" : "BORROW", dueAt: inRoom ? null : dueAt };
}

export function parseDispenseKind(v: string | null | undefined): DispenseKind {
  return (DISPENSE_KINDS as readonly string[]).includes(v ?? "")
    ? (v as DispenseKind)
    : "consume";
}
