import { USAGE_TYPE_LABELS } from "@/lib/constants";

// รูปร่างของ "การใช้งานรายเดือน" — แยกจาก lib/usage-by-subject เพราะไฟล์นั้น import prisma และ
// tab ของรายงานเป็น client component: ดึงเข้าไปทีเดียวคือลาก Prisma runtime ทั้งก้อนเข้า bundle
// แล้ว Turbopack ก็ build ไม่ผ่าน (เหตุผลเดียวกับที่ lib/dispense-kind แยกจาก dispense-kind-where).

/** กลุ่มบนแกนของกราฟ. NONE ไม่ใช่ค่าใน enum — เป็นถังของแถวที่ไม่ได้เลือกการใช้งาน ซึ่งต้องเห็น
 *  ไม่งั้นยอดในกราฟไม่เท่ากับที่เบิกจริง */
export const USAGE_GROUPS = ["COURSE", "ACTIVITY", "OTHER", "NONE"] as const;
export type UsageGroup = (typeof USAGE_GROUPS)[number];

export const USAGE_GROUP_LABELS: Record<string, string> = {
  ...USAGE_TYPE_LABELS,
  NONE: "ไม่ระบุ",
  /** inuse มีกลุ่มเดียว — ห้องคือรายละเอียด ไม่ใช่แกนของกราฟ (ดู groupUsageByMonth) */
  INUSE: "นำไปใช้งาน",
};

export type UsageMonthItem = {
  code: string;
  name: string;
  unit: string;
  quantity: number;
  records: number;
};

/** หนึ่งวิชา / กิจกรรม / ห้อง ภายในเดือนหนึ่ง */
export type UsageMonthRow = {
  key: string;
  label: string;
  records: number;
  totalQuantity: number;
  items: UsageMonthItem[];
};

export type UsageMonthGroup = {
  group: string;
  label: string;
  records: number;
  totalQuantity: number;
  rows: UsageMonthRow[];
};

export type UsageMonth = {
  /** "2026-08" */
  month: string;
  records: number;
  totalQuantity: number;
  groups: UsageMonthGroup[];
};
