import { test } from "node:test";
import assert from "node:assert/strict";
import { weightedUnitCost, writeOffValue } from "@/lib/cost";

test("weightedUnitCost weighs by quantity and ignores unpriced rows", () => {
  // The whole reason this is not a plain average: one cheap piece must not mark 10 down.
  assert.equal(weightedUnitCost([
    { quantity: 10, unitCost: 100 },
    { quantity: 1, unitCost: 10 },
  ]), 1010 / 11);

  // An unpriced receipt is unknown, not free — counting it as 0 would halve the value here.
  assert.equal(weightedUnitCost([
    { quantity: 1, unitCost: 60000 },
    { quantity: 1, unitCost: null },
  ]), 60000);

  // Nothing priced → null, so the caller stores "ไม่ทราบราคา" instead of "฿0".
  assert.equal(weightedUnitCost([{ quantity: 5, unitCost: null }]), null);
  assert.equal(weightedUnitCost([]), null);

  // A zero-quantity row cannot contribute weight and must not divide by zero.
  assert.equal(weightedUnitCost([{ quantity: 0, unitCost: 500 }]), null);
});

test("writeOffValue prefers the piece's own receipt over the item average", () => {
  // ชิ้นที่ผูกใบรับเข้าไว้ = ยอดที่จ่ายจริงของใบนั้น แม้ราคาเฉลี่ยของรายการจะต่างกันคนละโลก
  assert.deepEqual(writeOffValue(52000, 30000), { value: 52000, exact: true });

  // ไม่มีใบของตัวเอง (รับเข้าก่อนมีคอลัมน์นี้ / เพิ่มชิ้นจากหน้าตั้งค่า) → ประมาณการ ต้องติดธงไว้
  assert.deepEqual(writeOffValue(null, 30000), { value: 30000, exact: false });
  assert.deepEqual(writeOffValue(undefined, 30000), { value: 30000, exact: false });

  // ไม่รู้ราคาเลย → null (ไม่ทราบราคา) ไม่ใช่ 0 ที่จะถูกบวกเข้ายอดรวมเงียบๆ
  assert.deepEqual(writeOffValue(null, null), { value: null, exact: false });

  // ของฟรีจริงๆ ราคา 0 บาท ยังเป็นราคาที่กรอกไว้ ไม่ใช่ "ไม่มีข้อมูล" — ห้ามตกไปใช้ค่าเฉลี่ย
  assert.deepEqual(writeOffValue(0, 30000), { value: 0, exact: true });
});
