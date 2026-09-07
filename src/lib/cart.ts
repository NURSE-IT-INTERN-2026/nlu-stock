// คีย์ของบรรทัดตะกร้า — ใช้ร่วมกันทั้งฝั่ง client และ API
//
// ของชิ้นเดียวกันอยู่ในตะกร้าได้หลายบรรทัดโดยตั้งใจ: ล็อตคนละล็อต หรือชิ้น C01 กับ C02 คือคนละ
// บรรทัด ตัวที่แยกมันออกจากกันคือสามค่านี้ ไม่ใช่ itemId เดี่ยวๆ
//
// เก็บลง DB เป็นคอลัมน์เพราะ Postgres ถือว่า NULL ไม่เท่ากับ NULL: unique([userId, itemId,
// subItemId, lotId]) จะปล่อยให้บรรทัดเดิมซ้ำได้ไม่จำกัดตอน subItemId/lotId เป็น null ซึ่งเป็น
// กรณีที่พบบ่อยที่สุด (ของนับเป็นจำนวน ไม่มีล็อต)
export function cartLineKey(
  itemId: string,
  subItemId?: string | null,
  lotId?: string | null,
): string {
  return `${itemId}-${subItemId ?? ""}-${lotId ?? ""}`;
}
