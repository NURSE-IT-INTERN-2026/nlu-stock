// ponytail: token formatter covering only the patterns this app uses.
// date-fns was pulled in solely for format(); Intl locales gave inconsistent zero-padding.
//
// Two families of token:
//   yyyy/MM/dd  → machine format (CSV export, <input type="date"> values) — keep it CE + ISO.
//   d/MMMt/bbbb → what a person reads on screen: Thai month, Buddhist year (พ.ศ.).
// Everything a user sees goes through TH_DATE / TH_DATETIME / TH_DAY below, so the whole app
// says "31 ก.ค. 2569" instead of the three different dates it used to show (th-TH here,
// browser-locale 7/31/2026 there, English "Jul 2026" in the reports).
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
