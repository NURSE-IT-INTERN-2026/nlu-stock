// ทุก relation ที่ชี้มาที่ users แล้ว **กันการลบ** — คือทุกตัวที่ไม่ได้ตั้ง onDelete ไว้
// (Prisma default = Restrict). แถวที่มีสักรายการจึงลบไม่ได้ และไม่ควรลบ: ประวัติเบิก/ยืม/ซ่อม
// จะขาดเจ้าของ. /settings ใช้ค่านี้ตัดสินว่าแถวไหนโชว์ปุ่มลบได้ — ส่วนปุ่มปิดใช้งานโชว์ทุกแถว
// เสมอ เพราะนั่นคือการแบนตัวจริง (ลบทิ้งแล้วเจ้าตัวล็อกอินใหม่ แถวก็ถูกสร้างกลับมา —
// ดู api/auth/cmu/callback).
//
// **ลิสต์นี้ต้องครบทุกตัวที่เป็น Restrict** ตัวที่ตกหล่นไม่ได้ทำให้ปุ่มหายไปเฉยๆ — มันทำตรงข้าม:
// แถวนั้นอ่านว่า "ไม่มีประวัติ" ปุ่มลบจึงโผล่ แล้ว prisma.user.delete ไปตายที่ FK เป็น 500 แทน
// ข้อความไทยที่เตรียมไว้ให้พอดีกับเคสนี้. priceChanges/fieldChanges เคยตกหล่นมาแล้วด้วยเหตุนี้
// — ทั้งคู่เขียนโดย PATCH /api/receive/[id] ซึ่งเป็นทางที่คนไล่เติมราคาย้อนหลังใช้ ฉะนั้นบัญชี
// ที่ "ทำแค่แก้ราคา" มีอยู่จริงและเป็นเคสที่เจอก่อนเพื่อน.
//
// cartLines ไม่อยู่ในนี้โดยตั้งใจ: CartLine ตั้ง onDelete: Cascade ตะกร้าจึงหายไปพร้อมเจ้าของ
// และไม่กันการลบ. เพิ่ม relation ใหม่ที่ users ตอนไหน ให้กลับมาดูว่ามันเป็น Cascade หรือ Restrict.
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
  priceChanges: true,
  fieldChanges: true,
} as const;

export function hasHistory(count: Record<keyof typeof HISTORY_RELATIONS, number>): boolean {
  return Object.values(count).some((n) => n > 0);
}
