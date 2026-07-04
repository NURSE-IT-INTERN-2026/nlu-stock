// ponytail: token formatter covering only yyyy/MM/dd/MMM/HH/mm — the patterns this app uses.
// date-fns was pulled in solely for format(); Intl locales gave inconsistent zero-padding.
const PAD = (n: number, l = 2) => String(n).padStart(l, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(input: Date | string | number, token: string): string {
  const d = input instanceof Date ? input : new Date(input);
  const map: Record<string, string> = {
    yyyy: String(d.getFullYear()),
    MMM: MONTHS[d.getMonth()],
    MM: PAD(d.getMonth() + 1),
    dd: PAD(d.getDate()),
    HH: PAD(d.getHours()),
    mm: PAD(d.getMinutes()),
  };
  return token.replace(/yyyy|MMM|MM|dd|HH|mm/g, (t) => map[t]);
}
