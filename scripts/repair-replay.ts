/**
 * Wipe one item's repair history and replay it through the HTTP API, so the timeline
 * shows rows written by the current code instead of the legacy packed-string ones.
 *
 *   npx tsx --env-file=.env.local scripts/repair-replay.ts NLU-DUR-003
 *
 * Deletes are scoped to the named item and to repair rows only (ชำรุด booking, ส่งซ่อม log,
 * รับคืนจากซ่อม). Every write goes through fetch() — the point is to exercise the writers.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- raw SQL rows and API payloads */
import { Pool } from "pg";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";
const CODE = process.argv[2] ?? "NLU-DUR-003";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async <T = any>(sql: string, params: any[] = []): Promise<T[]> => (await pool.query(sql, params)).rows;

let cookie = "";
async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  const [item] = await q(`SELECT id, code, "availableQty", "totalQty" FROM items WHERE code = $1`, [CODE]);
  if (!item) throw new Error(`no item ${CODE}`);
  console.log(`${item.code}  available=${item.availableQty} total=${item.totalQty}`);

  const del = async (label: string, sql: string) => {
    const r = await pool.query(sql, [item.id]);
    console.log(`  − ${label}: ${r.rowCount}`);
  };
  console.log("clearing old repair rows");
  await del("maintenance CORRECTIVE", `DELETE FROM maintenance_records WHERE "itemId" = $1 AND type = 'CORRECTIVE'`);
  await del("status log ส่งซ่อม", `DELETE FROM item_status_logs WHERE "itemId" = $1 AND "repairVenue" IS NOT NULL`);
  await del("status log ปรับสต็อก(ชำรุด)", `DELETE FROM item_status_logs WHERE "itemId" = $1 AND reason LIKE '%เหตุผล:ชำรุด%'`);
  await del("stock adjustment ชำรุด/ซ่อม", `DELETE FROM stock_adjustments WHERE "itemId" = $1 AND reason IN ('DAMAGED_PENDING_REPAIR','REPAIR_RETURN','DAMAGE_CANCELLED')`);

  await api("POST", "/api/auth/login", { email: "admin@nlu.ac.th" });

  const QTY = 5;
  console.log(`\nแจ้งชำรุด ${QTY}`);
  await api("POST", `/api/items/${item.id}/adjust`, {
    shelfCount: item.availableQty - QTY,
    reason: "DAMAGED_PENDING_REPAIR",
    notes: "ขาโต๊ะหัก 5 ตัว",
  });
  const [booking] = await q(
    `SELECT id FROM stock_adjustments WHERE "itemId" = $1 AND reason = 'DAMAGED_PENDING_REPAIR' ORDER BY "adjustedAt" DESC LIMIT 1`,
    [item.id],
  );

  console.log("ส่งซ่อมภายใน");
  await api("POST", "/api/repairs", {
    adjustmentId: booking.id, venue: "INTERNAL", repairNote: "ฝ่าย it ตรวจเบื้องต้น", damageNote: "ขาโต๊ะหัก",
  });

  console.log("แก้ข้อมูลส่งซ่อม → ภายนอก");
  await api("POST", "/api/repairs", {
    adjustmentId: booking.id, venue: "EXTERNAL", repairNote: "ร้านเจริญเฟอร์นิเจอร์", damageNote: "ขาโต๊ะหัก ซ่อมเองไม่ได้",
  });

  console.log("รับคืนจากซ่อม");
  await api("POST", `/api/items/${item.id}/maintenance`, {
    type: "CORRECTIVE", result: "AVAILABLE", performedAt: new Date().toISOString(),
    adjustmentId: booking.id, issue: "ขาโต๊ะหัก", description: "เชื่อมขาใหม่ ทำสี", cost: 1800, attachmentUrls: [],
  });

  const hist = await api("GET", `/api/items/${item.id}/history?perPage=8`);
  console.log("\nประเภท          จำนวน  รายการ / บรรทัดล่าง");
  for (const e of hist.events) {
    const qty = e.qty == null ? "—" : `${e.qty}`;
    console.log(`${e.type.padEnd(15)} ${qty.padStart(4)}  ${e.note}${e.subtitle ? `\n${" ".repeat(22)}${e.subtitle}` : ""}`);
  }
  const [after] = await q(`SELECT "availableQty", "totalQty" FROM items WHERE id = $1`, [item.id]);
  console.log(`\n${item.code}  available=${after.availableQty} total=${after.totalQty}`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
