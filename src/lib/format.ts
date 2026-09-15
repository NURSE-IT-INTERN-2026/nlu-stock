// ponytail: token formatter covering only the patterns this app uses.
// date-fns was pulled in solely for format(); Intl locales gave inconsistent zero-padding.
//
// Two families of token:
//   yyyy/MM/dd  → machine format (CSV export, <input type="date"> values) — keep it CE + ISO.
//   d/MMMt/bbbb → what a person reads on screen: Thai month, Buddhist year (พ.ศ.).
// Everything a user sees goes through TH_DATE / TH_DATETIME / TH_DAY below, so the whole app
// says "31 ก.ค. 2569" — never toLocaleDateString or an English month on screen.
const PAD = (n: number, l = 2) => String(n).padStart(l, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** 31 ก.ค. 2569 */
export const TH_DATE = "d MMMt bbbb";
/** 31 ก.ค. 2569 14:30 */
export const TH_DATETIME = "d MMMt bbbb HH:mm";
/** 31 ก.ค. — for tight columns where the year is obvious from context */
export const TH_DAY = "d MMMt";

export function fmtDate(input: Date | string | number, token: string): string {
  const d = input instanceof Date ? input : new Date(input);
  const map: Record<string, string> = {
    yyyy: String(d.getFullYear()),
    bbbb: String(d.getFullYear() + 543),
    MMMt: TH_MONTHS[d.getMonth()],
    MMM: MONTHS[d.getMonth()],
    MM: PAD(d.getMonth() + 1),
    dd: PAD(d.getDate()),
    d: String(d.getDate()),
    HH: PAD(d.getHours()),
    mm: PAD(d.getMinutes()),
  };
  // Longest-first alternation: MMMt before MMM before MM, dd before d.
  return token.replace(/yyyy|bbbb|MMMt|MMM|MM|dd|d|HH|mm/g, (t) => map[t]);
}

/** อายุของ — "ไม่มีข้อมูลวันนำเข้า" is a real answer, not an empty cell. */
export const NO_RECEIPT_AGE = "ไม่มีข้อมูลวันนำเข้า";

/**
 * อายุของ นับจากวันรับเข้า — "2 ปี 3 เดือน 5 วัน".
 *
 * Calendar arithmetic, not days/365: a piece received on 29 ก.พ. is one year old on 28 ก.พ.,
 * and a month is however long that month was. Borrowing from the PREVIOUS month is what makes
 * that true — day 1 minus day 31 is not "-30 days", it is "0 เดือน, and the days that month had".
 *
 * `from` is ReceiveRecord.receivedAt, the only date that says when this piece entered the
 * building. null (no receipt on file — every row registered before /receive existed) returns
 * NO_RECEIPT_AGE rather than counting from createdAt, which is when somebody typed it in.
 */
export function ageFromReceipt(from: Date | string | null | undefined, now: Date = new Date()): string {
  if (!from) return NO_RECEIPT_AGE;
  const d = from instanceof Date ? from : new Date(from);
  if (Number.isNaN(d.getTime()) || d > now) return NO_RECEIPT_AGE;

  let years = now.getFullYear() - d.getFullYear();
  let months = now.getMonth() - d.getMonth();
  let days = now.getDate() - d.getDate();
  if (days < 0) {
    months -= 1;
    // Day 0 of month M is the last day of M-1, i.e. the length of the month we borrowed from.
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    // One borrow is not always enough: the month we borrowed from can be SHORTER than the
    // receipt's day of month. Received 31 ม.ค., read on 1 มี.ค. — ก.พ. lends 28 against a
    // debt of 30 and days lands at -2, which printed as "1 เดือน -2 วัน". There is no second
    // month to borrow from that makes this exact: the anniversary of the 31st does not exist
    // in ก.พ. at all. 0 is the honest answer — the month is complete and no new day has
    // started — and it never reads backwards as the calendar moves on.
    if (days < 0) days = 0;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  // Leading zero units are dropped (no "0 ปี 0 เดือน 3 วัน"), but an inner zero stays so
  // "1 ปี 0 เดือน 5 วัน" cannot be misread as 1 ปี 5 เดือน.
  const parts: string[] = [];
  if (years) parts.push(`${years} ปี`);
  if (years || months) parts.push(`${months} เดือน`);
  parts.push(`${days} วัน`);
  return parts.join(" ");
}

/**
 * "2026-08" — the local calendar month a record belongs to.
 *
 * Local getters, not toISOString(): an evening dispense in Asia/Bangkok is already the next
 * UTC day, and on the 31st that lands the row in the wrong month entirely — the same reason
 * lot-code builds its date from local parts.
 */
export function monthKey(input: Date | string | number): string {
  const d = input instanceof Date ? input : new Date(input);
  return `${d.getFullYear()}-${PAD(d.getMonth() + 1)}`;
}

/** "2026-08" → "ส.ค. 2569" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${TH_MONTHS[m - 1]} ${y + 543}`;
}

/** "2026-08" → "ส.ค. 69" — for chart axes, where twelve four-digit years do not fit. */
export function monthLabelShort(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${TH_MONTHS[m - 1]} ${String(y + 543).slice(2)}`;
}

/** Every month from `from` to `to` inclusive. A month with no records still has to appear on
 *  the chart — a missing bar reads as "no data yet", a zero bar reads as "nothing was used". */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  let y = fy;
  let m = fm;
  // Bounded by construction, but a caller that swaps the ends would otherwise spin forever.
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${PAD(m)}`);
    if (m === 12) {
      m = 1;
      y++;
    } else {
      m++;
    }
  }
  return out;
}
