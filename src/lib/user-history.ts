// ทุก relation ที่ชี้มาที่ users. ไม่มีตัวไหนตั้ง onDelete ไว้ (= Restrict) แถวที่มีสักรายการจึง
// ลบไม่ได้ และไม่ควรลบ: ประวัติเบิก/ยืม/ซ่อม จะขาดเจ้าของ. /settings ใช้ค่านี้ตัดสินว่าแถวไหน
// โชว์ปุ่มลบได้ — ส่วนปุ่มปิดใช้งานโชว์ทุกแถวเสมอ เพราะนั่นคือการแบนตัวจริง (ลบทิ้งแล้วเจ้าตัว
// ล็อกอินใหม่ แถวก็ถูกสร้างกลับมา — ดู api/auth/cmu/callback).
export const HISTORY_RELATIONS = {
  dispenseRecords: true,
  receiveRecords: true,
  adjustments: true,
  maintenanceRecords: true,
  statusChanges: true,
  locationChanges: true,
  dispenseTemplates: true,
  returnRecords: true,
  attachmentChanges: true,
} as const;

export function hasHistory(count: Record<keyof typeof HISTORY_RELATIONS, number>): boolean {
  return Object.values(count).some((n) => n > 0);
}
