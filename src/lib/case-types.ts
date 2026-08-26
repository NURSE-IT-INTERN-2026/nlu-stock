// The two enums both the server builder (src/lib/cases.ts) and the client need. Split out so a
// client bundle can name a case type without importing the module that talks to prisma.
// ยืม กับ ตั้งใช้ในห้อง เป็นคนละประเภทเพราะมันมีชีวิตคนละแบบ ไม่ใช่เพราะอยากมีประเภทเยอะ:
// ยืมมีกำหนดคืนและปิดที่หน้ารับคืน ส่วนตั้งใช้ในห้องไม่มีกำหนดคืนเลยสักแถว (0 จาก 676) และปิดผ่าน
// หน้าสถานะ. รวมกันแล้วคำว่า "เกินกำหนด" คำนวณไม่ได้ตลอดกาลกับครึ่งนึงของกอง — ของที่ตั้งค้างมา
// 358 วันจึงเงียบสนิท ทั้งที่เป็นข้อมูลที่ระบบมีอยู่แล้ว.
export type CaseType = "REPAIR" | "MAINTENANCE" | "BORROW" | "INUSE" | "LOST";
export type CaseState = "OPEN" | "DONE" | "CANCELLED";

export const CASE_PREFIX: Record<CaseType, string> = {
  REPAIR: "RC", MAINTENANCE: "MC", BORROW: "BR", INUSE: "IU", LOST: "LC",
};
export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  REPAIR: "ซ่อมแซม",
  MAINTENANCE: "บำรุงรักษา",
  BORROW: "ยืมพัสดุ",
  INUSE: "ตั้งใช้ในห้อง",
  LOST: "สูญหาย",
};
export const CASE_STATE_LABELS: Record<CaseState, string> = {
  OPEN: "กำลังดำเนินการ",
  DONE: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
};

/**
 * ตัวเลือกของ dropdown "ช่วงเวลา" — ที่เดียว เพราะแท็บประวัติของพัสดุกับเวิร์กสเปซเคสต้องเสนอ
 * ชุดเดียวกัน และค่า `y<ค.ศ.>` ต้องสะกดตรงกับที่ caseRangeBounds (src/lib/cases.ts) แปล.
 * ปีย้อนหลังมีไว้ตัดกองประวัติที่โตขึ้นทุกปีให้เหลือทีละปี — label เป็น พ.ศ. เหมือนวันที่ทุกจุดในแอป.
 */
export function caseRangeOptions(): { value: string; label: string }[] {
  const year = new Date().getFullYear();
  return [
    { value: "all", label: "ทั้งหมด" },
    { value: "7d", label: "7 วันล่าสุด" },
    { value: "30d", label: "30 วันล่าสุด" },
    { value: "90d", label: "90 วันล่าสุด" },
    { value: "year", label: "ปีนี้" },
    ...Array.from({ length: 3 }, (_, i) => year - 1 - i).map((y) => ({
      value: `y${y}`,
      label: `พ.ศ. ${y + 543}`,
    })),
  ];
}
