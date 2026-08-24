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
