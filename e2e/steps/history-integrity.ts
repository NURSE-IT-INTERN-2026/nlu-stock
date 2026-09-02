import { createBdd } from "playwright-bdd";
import { test, expect, pool } from "../fixtures";

const { When, Then } = createBdd(test);

/** ค่าที่ไม่ควรโผล่ถึงตา — แปลว่ามีตัวแปรว่างไหลลงไปถึงข้อความบนจอ */
const RAW_VALUE = /undefined|null|NaN|Invalid Date|\[object/i;

type Row = Record<string, unknown> & { steps?: Row[] };

/**
 * เก็บประวัติของทุก item ที่ suite สร้างไว้ ผ่าน API ตัวเดียวกับที่หน้าประวัติเรียก.
 *
 * ยิงทีเดียวใน When แล้วให้ Then สามข้อแบ่งกันตรวจ — ไม่ใช่ยิงซ้ำสามรอบ.
 * เขียนแบบไล่ทุก item ไม่ใช่ hardcode ชื่อแถวเป็นภาษาไทยแบบ expectHistory: กติกาพวกนี้ต้องจริง
 * กับพัสดุทุกตัว และต้องครอบ flow ที่เพิ่งเพิ่มเข้ามาให้เองโดยไม่ต้องมาแก้เทส
 */
When("ฉันเปิดประวัติของพัสดุทุกตัวที่เทสสร้างไว้", async ({ request, bdd }) => {
  // ตะแกรงเดิมจับด้วยรหัสอย่างเดียว จึงมองไม่เห็นของที่สร้างผ่าน wizard — ตรงนั้นระบบเป็นคน
  // ออกรหัสให้ (NLU-KRU-167) เทสตั้งได้แค่ชื่อ
  const { rows } = await pool.query(
    `SELECT id, code, "totalQty" FROM items
      WHERE code LIKE 'E2E-%' OR name LIKE 'E2E %' ORDER BY code`
  );
  expect(rows.length, "suite ต้องสร้างพัสดุไว้ก่อนถึงจะมีอะไรให้ตรวจ").toBeGreaterThan(0);

  bdd.histories = [];
  for (const item of rows) {
    const res = await request.get(`/api/items/${item.id}/history?perPage=50`);
    expect(res.ok(), `${item.code}: ประวัติเปิดไม่ได้ (HTTP ${res.status()})`).toBeTruthy();
    const body = await res.json();
    const moved = await pool.query(
      `SELECT (SELECT count(*) FROM dispense_records WHERE "itemId" = $1)
            + (SELECT count(*) FROM stock_adjustments WHERE "itemId" = $1)
            + (SELECT count(*) FROM receive_records  WHERE "itemId" = $1)
            + (SELECT count(*) FROM item_status_logs WHERE "itemId" = $1) AS n`,
      [item.id]
    );
    bdd.histories.push({
      code: item.code,
      events: (body.events ?? []) as Row[],
      dbRows: Number(moved.rows[0].n),
      totalQty: Number(item.totalQty),
    });
  }
});

Then("ของที่ยอดหรือสถานะขยับ ต้องมีอย่างน้อยหนึ่งรายการในประวัติ", async ({ bdd }) => {
  const silent = bdd.histories
    .filter((h: { events: Row[]; dbRows: number }) => h.dbRows > 0 && h.events.length === 0)
    .map((h: { code: string; dbRows: number }) => `${h.code} (${h.dbRows} รายการใน DB)`);
  expect(silent, "ของขยับแล้วแต่ประวัติว่างเปล่า").toEqual([]);
});

// ยอดตั้งต้นก็เป็นการขยับ: ของ 10 ชิ้นโผล่เข้าคลังต้องตอบได้ว่ามาจากไหน ไม่ใช่แค่ของที่
// ขยับ *หลัง* สร้างแล้วเท่านั้น — ledger ว่างทำให้ข้อบนไม่ทันเห็นเคสนี้
Then("ของที่มียอดอยู่ในคลัง ต้องบอกได้ว่ายอดตั้งต้นมาจากไหน", async ({ bdd }) => {
  const unexplained = bdd.histories
    .filter((h: { events: Row[]; totalQty: number }) => h.totalQty > 0 && h.events.length === 0)
    .map((h: { code: string; totalQty: number }) => `${h.code} (${h.totalQty} ชิ้น)`);
  expect(unexplained, "มีของอยู่ในคลังแต่ประวัติว่างเปล่า").toEqual([]);
});

Then(
  "ทุกแถวและทุกขั้นตอน ต้องมีผู้ทำรายการ วันที่อ่านได้ และข้อความที่ไม่มีค่าดิบหลุดมา",
  async ({ bdd }) => {
    const bad: string[] = [];
    for (const h of bdd.histories) {
      const check = (r: Row, where: string) => {
        const text = `${r.note ?? ""} ${r.subtitle ?? ""} ${r.statusLabel ?? ""} ${r.subject ?? ""}`;
        if (RAW_VALUE.test(text)) bad.push(`${h.code} ${where}: ค่าดิบในข้อความ → "${text.trim()}"`);
        if (isNaN(new Date(String(r.date)).getTime())) bad.push(`${h.code} ${where}: date พัง → ${r.date}`);
        // เฉพาะขั้นตอน/กิจกรรมที่มีคนทำ — การ์ดเคสไม่ได้ถือ user ของตัวเอง
        if ("user" in r && !r.user) bad.push(`${h.code} ${where}: ไม่มีชื่อผู้ทำรายการ`);
      };
      for (const e of h.events) {
        check(e, e.caseType ? `case ${e.caseType}` : `event ${e.type}`);
        for (const s of e.steps ?? []) check(s, `case ${e.caseType} → step ${s.type}`);
      }
    }
    expect(bad, "ประวัติแสดงผลผิดปกติ").toEqual([]);
  }
);

Then(
  "เคสที่ปิดแล้วต้องมีวันปิด เคสที่ยังไม่ปิดต้องไม่มี และทุกเคสต้องมีขั้นตอนอย่างน้อยหนึ่งขั้น",
  async ({ bdd }) => {
    const bad: string[] = [];
    for (const h of bdd.histories) {
      for (const e of h.events.filter((x: Row) => x.kind === "trip")) {
        const at = `${h.code} case ${e.caseType}`;
        if (e.done && !e.closedAt) bad.push(`${at}: ปิดแล้วแต่ไม่มี closedAt`);
        if (!e.done && e.closedAt) bad.push(`${at}: ยังไม่ปิดแต่มี closedAt`);
        if (!(e.steps ?? []).length) bad.push(`${at}: เคสไม่มีขั้นตอนเลย`);
      }
    }
    expect(bad, "สถานะเคสกับข้อมูลข้างในไม่ตรงกัน").toEqual([]);
  }
);
