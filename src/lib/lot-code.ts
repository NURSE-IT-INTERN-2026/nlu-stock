/**
 * Auto lot codes for receives with no manufacturer lot number.
 *
 * Most of what comes into this stockroom has no printed lot number, and a made-up
 * one is worse than none. What staff actually need is "this batch arrived on this
 * day", so a blank lot field gets a code derived from the receive date: one lot per
 * item per day, same-day receives merge into it.
 *
 * This module is the only place that knows the code format — receive builds it,
 * the UI reads it back with autoLotLabel().
 */

export const AUTO_LOT_PREFIX = "RCV-";

/**
 * Lot that holds stock which existed before the item had any lots at all.
 *
 * A consumable's availableQty is its own counter until the first lot shows up —
 * after that it's SUM(lots.remainingQty) (ADR-0002). Without parking the old
 * balance somewhere, the first receive would make the next recompute delete it.
 */
export const OPENING_LOT_NUMBER = "OPENING";

const TH_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/**
 * RCV-20260721 for a receive on 21 Jul 2026.
 *
 * Local calendar parts, NOT toISOString() — an evening receive in Asia/Bangkok is
 * already the next UTC day, and the code has to match the day staff were working.
 */
export function autoLotNumber(receivedAt: Date): string {
  const y = receivedAt.getFullYear();
  const m = String(receivedAt.getMonth() + 1).padStart(2, "0");
  const d = String(receivedAt.getDate()).padStart(2, "0");
  return `${AUTO_LOT_PREFIX}${y}${m}${d}`;
}

/** System-generated code (date lot or opening balance) rather than a manufacturer's. */
export function isAutoLot(lotNumber: string): boolean {
  return lotNumber === OPENING_LOT_NUMBER || /^RCV-\d{8}(-\d+)?$/.test(lotNumber);
}

/**
 * "รับเข้า 21 ก.ค. 2569" for an auto code; a manufacturer lot number is returned
 * untouched — that string is the real-world identity of the batch.
 */
export function autoLotLabel(lotNumber: string): string {
  if (lotNumber === OPENING_LOT_NUMBER) return "ยอดยกมา";
  if (!isAutoLot(lotNumber)) return lotNumber;
  const [, digits, suffix] = /^RCV-(\d{8})(?:-(\d+))?$/.exec(lotNumber)!;
  const year = Number(digits.slice(0, 4));
  const monthIndex = Number(digits.slice(4, 6)) - 1;
  const day = Number(digits.slice(6, 8));
  const month = TH_MONTHS[monthIndex] ?? digits.slice(4, 6);
  // Buddhist era — every other date in this app is shown in พ.ศ.
  return `รับเข้า ${day} ${month} ${year + 543}${suffix ? ` (${suffix})` : ""}`;
}

/**
 * Standalone display string, prefix included — for chips and sentences where the
 * lot isn't already sitting under a "Lot" label. Inside a labelled field use
 * autoLotLabel() instead, so the word isn't repeated.
 */
export function lotDisplay(lotNumber: string): string {
  return isAutoLot(lotNumber) ? autoLotLabel(lotNumber) : `Lot ${lotNumber}`;
}

// ── self-check: npx tsx src/lib/lot-code.ts ──
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

function selfCheck(): void {
  // Format: zero-padded, local calendar parts.
  assert(autoLotNumber(new Date(2026, 6, 21, 10, 0)) === "RCV-20260721", "July 21 → RCV-20260721");
  assert(autoLotNumber(new Date(2026, 0, 5, 10, 0)) === "RCV-20260105", "Jan 5 must zero-pad");

  // Late-evening receive keeps the local day (would roll over under toISOString in +07).
  const evening = new Date(2026, 6, 21, 23, 30);
  assert(autoLotNumber(evening) === "RCV-20260721", `evening receive stays on its own day, got ${autoLotNumber(evening)}`);

  // Same day → same code, so a second receive merges instead of piling up lots.
  assert(
    autoLotNumber(new Date(2026, 6, 21, 8, 0)) === autoLotNumber(new Date(2026, 6, 21, 17, 0)),
    "two receives on one day must share a code",
  );

  // Recognising our own codes vs a manufacturer's.
  assert(isAutoLot("RCV-20260721"), "plain auto code");
  assert(isAutoLot("RCV-20260721-2"), "suffixed auto code");
  assert(!isAutoLot("LOT-A"), "manufacturer lot is not auto");
  assert(!isAutoLot("RCV-2026"), "short digits are not auto");

  // Labels: auto codes read as a date, manufacturer lots pass through untouched.
  assert(
    autoLotLabel("RCV-20260721") === "รับเข้า 21 ก.ค. 2569",
    `expected Thai date label, got ${autoLotLabel("RCV-20260721")}`,
  );
  assert(
    autoLotLabel("RCV-20260721-2") === "รับเข้า 21 ก.ค. 2569 (2)",
    `expected suffix in label, got ${autoLotLabel("RCV-20260721-2")}`,
  );
  assert(autoLotLabel("LOT-A") === "LOT-A", "manufacturer lot must pass through");

  // Opening balance reads as itself, and counts as system-generated.
  assert(isAutoLot(OPENING_LOT_NUMBER), "opening lot is system-generated");
  assert(autoLotLabel(OPENING_LOT_NUMBER) === "ยอดยกมา", `expected ยอดยกมา, got ${autoLotLabel(OPENING_LOT_NUMBER)}`);
  assert(lotDisplay(OPENING_LOT_NUMBER) === "ยอดยกมา", "opening lot must not be prefixed");

  // Standalone display keeps the "Lot" word only where it adds meaning.
  assert(lotDisplay("LOT-A") === "Lot LOT-A", `expected prefixed, got ${lotDisplay("LOT-A")}`);
  assert(
    lotDisplay("RCV-20260721") === "รับเข้า 21 ก.ค. 2569",
    `auto lot must not be prefixed, got ${lotDisplay("RCV-20260721")}`,
  );

  console.log("lot-code self-check OK");
}

if (process.argv[1]?.endsWith("lot-code.ts")) selfCheck();
