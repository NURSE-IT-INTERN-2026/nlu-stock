/** ราคาต่อหน่วยถัวเฉลี่ยถ่วงน้ำหนักจากรายการรับเข้าที่มีราคา — ค่าที่ Item.purchasePrice เก็บไว้
 *  ให้รายงานมูลค่าคงคลังตีราคาของคงทน.
 *
 *  Weighted by quantity, not a plain average of the prices: receiving 10 pieces at ฿100 and
 *  1 more at ฿10 leaves the stock worth ฿91.8 each, not ฿55. Rows with no price are the
 *  caller's to exclude — an unpriced receipt is unknown, and averaging it in as 0 would
 *  quietly mark stock down every time someone skipped the field.
 *
 *  Returns null when nothing priced is left to average, so the caller writes null (ไม่ทราบ
 *  ราคา) rather than 0 (ฟรี). */
export function weightedUnitCost(rows: { quantity: number; unitCost: number | null }[]): number | null {
  const priced = rows.filter((r) => r.unitCost != null && r.quantity > 0);
  const qty = priced.reduce((s, r) => s + r.quantity, 0);
  if (qty === 0) return null;
  return priced.reduce((s, r) => s + r.quantity * r.unitCost!, 0) / qty;
}
