// เลขเคส — จ่ายครั้งเดียว แล้วไม่เปลี่ยนอีก.
//
// เดิมเลขนี้คือ "ลำดับที่เท่าไหร่ของประเภทนั้นในปีนั้น" คำนวณสดทุกครั้งที่เปิดหน้า ซึ่งนิ่งอยู่ได้ตราบที่
// นิยามของประเภทไม่ขยับ — พอแยก ตั้งใช้ในห้อง ออกจาก ยืม ทีเดียว เลข BR ทั้งกองก็เลื่อน และเลขที่
// เจ้าหน้าที่เขียนไว้บนกล่องที่ส่งร้านซ่อมเมื่อวานก็ชี้ไปคนละเคส. ตาราง case_codes จึงเก็บเลขไว้จริง.
//
// เลขนับรวมทั้งปี ไม่แยกประเภท: เคสที่ย้ายประเภทเก็บเลขเดิม เปลี่ยนแค่ prefix ส่วนประเภทใหม่หยิบเลข
// ถัดไปโดยไม่รบกวนใคร. แลกกับเลขของแต่ละ prefix ที่ไม่ต่อเนื่อง ซึ่งไม่มีใครต้องอ่านต่อเนื่องอยู่แล้ว.
import { prisma } from "@/lib/prisma";
import { CASE_PREFIX, type CaseType } from "@/lib/case-types";

/** ตารางต้นทางของเคส. คีย์ไม่มีชื่อประเภทอยู่ในนั้น — ประเภทเปลี่ยนได้ แถวต้นทางเปลี่ยนไม่ได้. */
export const CASE_SOURCES = {
  adj: "stock_adjustments",
  log: "item_status_logs",
  maint: "maintenance_records",
  disp: "dispense_records",
  ret: "return_records",
  doc: "dispense_records.loanGroupId",
} as const;

export type CaseSource = keyof typeof CASE_SOURCES;

export const sourceKey = (src: CaseSource, rowId: string) => `${src}:${rowId}`;

const beYear = (d: Date) => d.getFullYear() + 543;
export const formatCode = (prefix: string, be: number, seq: number) =>
  `${prefix}-${be}-${String(seq).padStart(4, "0")}`;

export type CodeRequest = { sourceKey: string; openedAt: Date; prefix: string };

/**
 * เลขของเคสที่ขอมา — ตัวที่ยังไม่เคยมีเลขจะได้เลขใหม่ตรงนี้เลย.
 *
 * จ่ายเลขตอนอ่านครั้งแรกแทนที่จะไปแก้ write path ทั้งหกเส้น: เคสไม่ได้ถูก "สร้าง" ที่ไหนสักที่ มันคือ
 * การตีความแถวที่มีอยู่แล้ว จุดที่รู้ว่ามีเคสเกิดขึ้นจึงเป็นตอนที่มีคนถามหามันนี่แหละ.
 *
 * เรียงตาม openedAt ก่อนจ่าย เพื่อให้ชุดที่มาพร้อมกันได้เลขตามลำดับเวลา ไม่ใช่ตามลำดับที่บังเอิญวนถึง.
 */
export async function codesFor(requests: CodeRequest[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!requests.length) return out;

  const keys = [...new Set(requests.map((r) => r.sourceKey))];
  const existing = await prisma.caseCode.findMany({ where: { sourceKey: { in: keys } } });
  const known = new Map(existing.map((c) => [c.sourceKey, c]));

  const missing = requests
    .filter((r) => !known.has(r.sourceKey))
    .sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime() || a.sourceKey.localeCompare(b.sourceKey));

  for (const r of missing) {
    if (known.has(r.sourceKey)) continue; // duplicate request in the same batch
    known.set(r.sourceKey, await assign(r.sourceKey, beYear(r.openedAt)));
  }

  for (const r of requests) {
    const row = known.get(r.sourceKey);
    if (row) out.set(r.sourceKey, formatCode(r.prefix, row.be, row.seq));
  }
  return out;
}

/** Next free number for the year. Two readers can race for it, so a clash just tries again. */
async function assign(key: string, be: number, attempt = 0): Promise<{ be: number; seq: number; sourceKey: string; createdAt: Date }> {
  const top = await prisma.caseCode.aggregate({ where: { be }, _max: { seq: true } });
  const seq = (top._max.seq ?? 0) + 1;
  try {
    return await prisma.caseCode.create({ data: { sourceKey: key, be, seq } });
  } catch (err) {
    // Someone else took either this number or this key while we looked.
    const mine = await prisma.caseCode.findUnique({ where: { sourceKey: key } });
    if (mine) return mine;
    if (attempt >= 5) throw err;
    return assign(key, be, attempt + 1);
  }
}

/** เลขของเคสเดียว — prefix มาจากประเภทปัจจุบัน ส่วนตัวเลขมาจากตาราง. */
export async function codeFor(type: CaseType, src: CaseSource, rowId: string, openedAt: Date): Promise<string> {
  const key = sourceKey(src, rowId);
  const map = await codesFor([{ sourceKey: key, openedAt, prefix: CASE_PREFIX[type] }]);
  return map.get(key) ?? "";
}
