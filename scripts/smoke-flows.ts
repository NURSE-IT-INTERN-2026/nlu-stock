/**
 * Bulk API smoke run — drives every stock flow through the HTTP API and verifies the
 * resulting history, so the app ends up looking like it has been in real use.
 *
 * Run against a dev server:  npx tsx --env-file=.env.local scripts/smoke-flows.ts
 * Env: SMOKE_BASE (default http://localhost:3000), SMOKE_SCALE (default 1)
 *
 * Every write goes through fetch() — no direct DB writes. The pg pool is read-only here,
 * used to pick targets and to check what the API actually stored.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- raw SQL rows and API payloads; this is a test driver, not app code */
import { Pool } from "pg";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";
const SCALE = Number(process.env.SMOKE_SCALE ?? 1);
const n = (base: number) => Math.max(1, Math.round(base * SCALE));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = async <T = any>(sql: string, params: any[] = []): Promise<T[]> =>
  (await pool.query(sql, params)).rows as T[];

// ── HTTP ──────────────────────────────────────────────────────────────────────
let cookie = "";
let calls = 0;

async function api(method: string, path: string, body?: unknown) {
  calls++;
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
  return { ok: res.ok, status: res.status, json };
}
const POST = (p: string, b?: unknown) => api("POST", p, b);
const GET = (p: string) => api("GET", p);
const PATCH = (p: string, b: unknown) => api("PATCH", p, b);

// ── checks ────────────────────────────────────────────────────────────────────
type Check = { phase: string; name: string; ok: boolean; detail: string };
const checks: Check[] = [];
let phase = "-";
function check(name: string, ok: boolean, detail = "") {
  checks.push({ phase, name, ok, detail });
  if (!ok) console.log(`   ✗ ${name} — ${detail}`);
}
const eq = (name: string, actual: unknown, expected: unknown) =>
  check(name, actual === expected, `expected ${expected}, got ${actual}`);

// ── DB reads ──────────────────────────────────────────────────────────────────
type ItemRow = {
  id: string; code: string; name: string; availableQty: number; totalQty: number;
  locationId: string | null; trackIndividually: boolean; status: string; profile: string;
};
const pickItems = (profileCode: string, limit: number, extra = "") =>
  q<ItemRow>(
    `SELECT i.id, i.code, i.name, i."availableQty", i."totalQty", i."locationId",
            i."trackIndividually", i.status, p.code AS profile
       FROM items i
       JOIN categories c ON c.id = i."categoryId"
       JOIN category_profiles p ON p.id = c."profileId"
      WHERE p.code = $1 AND i."isActive" AND i.status = 'AVAILABLE' ${extra}
      ORDER BY random() LIMIT $2`,
    [profileCode, limit],
  );

const item = async (id: string) =>
  (await q<ItemRow>(`SELECT id, code, "availableQty", "totalQty", status, "locationId" FROM items WHERE id = $1`, [id]))[0];
const sub = async (id: string) =>
  (await q<any>(`SELECT id, "subCode", status, "inKitSubItemId", "locationId" FROM sub_items WHERE id = $1`, [id]))[0];
const availSubs = (itemId: string, limit = 1) =>
  q<any>(`SELECT id, "subCode" FROM sub_items WHERE "itemId" = $1 AND status = 'AVAILABLE' ORDER BY random() LIMIT $2`, [itemId, limit]);
const firstLot = async (itemId: string) =>
  (await q<any>(`SELECT id, "lotNumber", "remainingQty" FROM lots WHERE "itemId" = $1 AND "remainingQty" > 0 ORDER BY "expiryDate" NULLS LAST LIMIT 1`, [itemId]))[0];
const countRow = async (sql: string, params: any[] = []) => Number((await q<any>(sql, params))[0].c);

/** Next free sub-codes for a tracked item (C01, C02, … style). */
async function nextSubCodes(itemId: string, howMany: number) {
  const rows = await q<any>(`SELECT "subCode" FROM sub_items WHERE "itemId" = $1`, [itemId]);
  const used = new Set(rows.map((r) => r.subCode));
  const out: string[] = [];
  for (let i = 1; out.length < howMany && i < 500; i++) {
    const code = `C${String(i).padStart(2, "0")}`;
    if (!used.has(code)) out.push(code);
  }
  return out;
}

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const daysFromNow = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

// shared context filled in during the run
let locations: any[] = [];
let courses: any[] = [];
const openLoans: { itemId: string; subItemId: string; recordId: string }[] = [];
const openCountLoans: { itemId: string; recordId: string; qty: number }[] = [];
const openInUse: { itemId: string; recordId: string; qty: number; destLocationId: string }[] = [];
const touchedItems = new Set<string>();

// ── phases ────────────────────────────────────────────────────────────────────

async function phaseLogin() {
  phase = "0 login";
  const res = await POST("/api/auth/login", { email: "admin@nlu.ac.th" });
  check("login as admin", res.ok, JSON.stringify(res.json));
  if (!res.ok) throw new Error("login failed — cannot continue");
  locations = await q(`SELECT id, building, floor, room FROM locations ORDER BY random() LIMIT 12`);
  courses = await q(`SELECT code, name FROM courses ORDER BY random() LIMIT 25`);
}

/** นำเข้า — one receive path per profile. */
async function phaseReceive() {
  phase = "1 นำเข้า";

  // CONSUMABLE, no lot number → availableQty is the only counter (no lot row created).
  for (const it of await pickItems("CON", n(12))) {
    const before = await item(it.id);
    const lotsBefore = await countRow(`SELECT count(*) c FROM lots WHERE "itemId" = $1`, [it.id]);
    const qty = rand(10, 200);
    const res = await POST("/api/receive", { items: [{ itemId: it.id, quantity: qty }], notes: "รับเข้าคลัง (ไม่มีล็อต)" });
    check(`CON receive ไม่มีล็อต ${it.code}`, res.ok, JSON.stringify(res.json));
    if (!res.ok) continue;
    const after = await item(it.id);
    eq(`CON ${it.code} availableQty +${qty}`, after.availableQty, before.availableQty + qty);
    const lots = await countRow(`SELECT count(*) c FROM lots WHERE "itemId" = $1`, [it.id]);
    // A lot-less item must stay lot-less; one that already has lots gets an auto date-code
    // lot instead, or the next recompute would wipe the stock received outside a lot.
    check(
      `CON ${it.code} lot-less stays lot-less`,
      lotsBefore === 0 ? lots === 0 : lots >= lotsBefore,
      `lotsBefore=${lotsBefore} lots=${lots}`,
    );
    touchedItems.add(it.id);
  }

  // CONSUMABLE with a real lot number + expiry + unit cost.
  for (const it of await pickItems("CON", n(10))) {
    const before = await item(it.id);
    const qty = rand(20, 150);
    const lotNumber = `SMK-${Date.now().toString(36).toUpperCase()}-${rand(100, 999)}`;
    const res = await POST("/api/receive", {
      items: [{ itemId: it.id, quantity: qty, lotNumber, expiryDate: new Date(Date.now() + rand(90, 720) * 864e5).toISOString(), unitCost: rand(5, 500) }],
      notes: "รับเข้าคลัง (มีล็อต)",
    });
    check(`CON receive มีล็อต ${it.code}`, res.ok, JSON.stringify(res.json));
    if (!res.ok) continue;
    const after = await item(it.id);
    eq(`CON ${it.code} lot receive availableQty +${qty}`, after.availableQty, before.availableQty + qty);
    const lotSum = await countRow(`SELECT coalesce(sum("remainingQty"),0) c FROM lots WHERE "itemId" = $1`, [it.id]);
    eq(`CON ${it.code} SUM(lots) = availableQty`, lotSum, after.availableQty);
    touchedItems.add(it.id);
  }

  // COUNT (วัสดุคงทน) — plain qty.
  for (const it of await pickItems("DUR", n(12))) {
    const before = await item(it.id);
    const qty = rand(5, 60);
    const res = await POST("/api/receive", { items: [{ itemId: it.id, quantity: qty }], notes: "รับเข้าคลัง วัสดุคงทน" });
    check(`DUR receive ${it.code}`, res.ok, JSON.stringify(res.json));
    if (!res.ok) continue;
    const after = await item(it.id);
    eq(`DUR ${it.code} availableQty +${qty}`, after.availableQty, before.availableQty + qty);
    eq(`DUR ${it.code} totalQty +${qty}`, after.totalQty, before.totalQty + qty);
    touchedItems.add(it.id);
  }

  // ITEM (ครุภัณฑ์ / หนังสือ-ของเล่น) — one sub-code per copy.
  for (const profile of ["KRU", "BAT"]) {
    for (const it of await pickItems(profile, n(6))) {
      const before = await item(it.id);
      const qty = rand(1, 3);
      const subCodes = await nextSubCodes(it.id, qty);
      const res = await POST("/api/receive", {
        items: [{ itemId: it.id, quantity: qty, subCodes }],
        notes: `รับเข้าคลัง ${profile}`,
      });
      check(`${profile} receive ${it.code} (${subCodes.join(",")})`, res.ok, JSON.stringify(res.json));
      if (!res.ok) continue;
      const after = await item(it.id);
      eq(`${profile} ${it.code} availableQty +${qty}`, after.availableQty, before.availableQty + qty);
      const created = await countRow(`SELECT count(*) c FROM sub_items WHERE "itemId" = $1 AND "subCode" = ANY($2)`, [it.id, subCodes]);
      eq(`${profile} ${it.code} sub-items created`, created, qty);
      touchedItems.add(it.id);
    }
  }

  // Receive must be visible in the receive history report.
  const rec = await GET("/api/reports/receive-history?perPage=5");
  check("receive-history report responds", rec.ok, JSON.stringify(rec.json).slice(0, 200));
  check("receive-history has rows", (rec.json?.total ?? rec.json?.rows?.length ?? 0) > 0, JSON.stringify(rec.json).slice(0, 200));
}

/** เบิก (CONSUMABLE) — with and without lots, across all three usage types. */
async function phaseDispenseConsumable() {
  phase = "2 เบิก";
  const items = await pickItems("CON", n(25), `AND i."availableQty" > 5`);
  for (const it of items) {
    const before = await item(it.id);
    const lot = await firstLot(it.id);
    const qty = Math.max(1, Math.min(rand(1, 12), lot ? lot.remainingQty : before.availableQty));
    const usage = pick(["COURSE", "ACTIVITY", "OTHER"] as const);
    const course = pick(courses);
    const body: any = {
      items: [{ itemId: it.id, quantity: qty, lotId: lot?.id ?? null }],
      usageType: usage,
      ...(usage === "COURSE"
        ? { courseCode: course.code, usageNote: course.name }
        : { usageNote: usage === "ACTIVITY" ? "กิจกรรมซ้อมทักษะนักศึกษา" : "ใช้ในงานประกันคุณภาพ" }),
    };
    const res = await POST("/api/dispense", body);
    check(`เบิก CON ${it.code} x${qty}`, res.ok, JSON.stringify(res.json));
    if (!res.ok) continue;
    const after = await item(it.id);
    eq(`CON ${it.code} availableQty -${qty}`, after.availableQty, before.availableQty - qty);
    if (lot) {
      const l = (await q<any>(`SELECT "remainingQty" FROM lots WHERE id = $1`, [lot.id]))[0];
      eq(`CON ${it.code} lot ${lot.lotNumber} -${qty}`, l.remainingQty, lot.remainingQty - qty);
    }
    touchedItems.add(it.id);
  }
}

/** ยืม — COUNT (numeric) and ITEM (per piece). */
async function phaseBorrow() {
  phase = "3 ยืม";

  for (const it of await pickItems("DUR", n(14), `AND i."availableQty" > 3`)) {
    const before = await item(it.id);
    const qty = rand(1, Math.min(6, before.availableQty));
    const course = pick(courses);
    const res = await POST("/api/dispense", {
      items: [{ itemId: it.id, quantity: qty }],
      usageType: "COURSE",
      courseCode: course.code,
      usageNote: course.name,
      dueAt: daysFromNow(rand(-10, 20)), // some overdue on purpose
    });
    check(`ยืม DUR ${it.code} x${qty}`, res.ok, JSON.stringify(res.json));
    if (!res.ok) continue;
    const after = await item(it.id);
    eq(`DUR ${it.code} availableQty -${qty}`, after.availableQty, before.availableQty - qty);
    openCountLoans.push({ itemId: it.id, recordId: res.json.ids[0], qty });
    touchedItems.add(it.id);
  }

  for (const profile of ["KRU", "BAT"]) {
    for (const it of await pickItems(profile, n(10), `AND i."availableQty" > 0`)) {
      const subs = await availSubs(it.id, 1);
      if (!subs.length) continue;
      const before = await item(it.id);
      const course = pick(courses);
      const res = await POST("/api/dispense", {
        items: [{ itemId: it.id, subItemId: subs[0].id, quantity: 1 }],
        usageType: "COURSE",
        courseCode: course.code,
        usageNote: course.name,
        dueAt: daysFromNow(rand(-5, 21)),
      });
      check(`ยืม ${profile} ${it.code}-${subs[0].subCode}`, res.ok, JSON.stringify(res.json));
      if (!res.ok) continue;
      eq(`${profile} ${it.code}-${subs[0].subCode} → ON_LOAN`, (await sub(subs[0].id)).status, "ON_LOAN");
      eq(`${profile} ${it.code} availableQty -1`, (await item(it.id)).availableQty, before.availableQty - 1);
      openLoans.push({ itemId: it.id, subItemId: subs[0].id, recordId: res.json.ids[0] });
      touchedItems.add(it.id);
    }
  }
}

/** นำไปใช้งาน (INUSE) — qty stock and tracked pieces stationed in a room. */
async function phaseInUse() {
  phase = "4 นำไปใช้งาน";

  for (const it of await pickItems("DUR", n(10), `AND i."availableQty" > 3`)) {
    const before = await item(it.id);
    const dest = before.locationId ?? pick(locations).id;
    const qty = rand(1, Math.min(5, before.availableQty));
    const res = await POST("/api/dispense", {
      items: [{ itemId: it.id, quantity: qty }],
      loanType: "INUSE",
      locationId: dest,
      notes: "ตั้งใช้งานประจำห้อง",
    });
    check(`นำไปใช้งาน DUR ${it.code} x${qty}`, res.ok, JSON.stringify(res.json));
    if (!res.ok) continue;
    eq(`DUR ${it.code} availableQty -${qty}`, (await item(it.id)).availableQty, before.availableQty - qty);
    openInUse.push({ itemId: it.id, recordId: res.json.ids[0], qty, destLocationId: before.locationId ?? dest });
    touchedItems.add(it.id);
  }

  for (const it of await pickItems("KRU", n(8), `AND i."availableQty" > 0`)) {
    const subs = await availSubs(it.id, 1);
    if (!subs.length) continue;
    const before = await item(it.id);
    const dest = pick(locations).id;
    const res = await POST("/api/dispense", {
      items: [{ itemId: it.id, subItemId: subs[0].id, quantity: 1 }],
      loanType: "INUSE",
      locationId: dest,
      notes: "ตั้งใช้งานประจำห้องปฏิบัติการ",
    });
    check(`นำไปใช้งาน KRU ${it.code}-${subs[0].subCode}`, res.ok, JSON.stringify(res.json));
    if (!res.ok) continue;
    const s = await sub(subs[0].id);
    eq(`KRU ${it.code}-${subs[0].subCode} → IN_USE`, s.status, "IN_USE");
    eq(`KRU ${it.code}-${subs[0].subCode} location moved`, s.locationId, dest);
    openInUse.push({ itemId: it.id, recordId: res.json.ids[0], qty: 1, destLocationId: before.locationId ?? dest });
    touchedItems.add(it.id);
  }

  // นำไปใช้งาน must never show up on the รับคืน (loan) screen.
  const loans = await GET("/api/returns");
  const inUseLeak = (loans.json?.records ?? []).filter((r: any) => r.loanType === "INUSE").length;
  eq("INUSE รั่วเข้าหน้ารับคืน", inUseLeak, 0);
}

/** การคืน — loans back in (ปกติ/ชำรุด/สูญหาย), partial COUNT returns, คืนเข้าคลัง. */
async function phaseReturns() {
  phase = "5 การคืน";

  // COUNT loans: return part, then the rest.
  for (const loan of openCountLoans.slice(0, n(10))) {
    const before = await item(loan.itemId);
    const part = loan.qty > 1 ? Math.floor(loan.qty / 2) : 1;
    let res = await POST(`/api/items/${loan.itemId}/return`, { quantity: part, status: "AVAILABLE", dispenseRecordId: loan.recordId, note: "คืนบางส่วน" });
    check(`คืนบางส่วน DUR x${part}`, res.ok, JSON.stringify(res.json));
    if (!res.ok) continue;
    eq(`DUR partial return availableQty +${part}`, (await item(loan.itemId)).availableQty, before.availableQty + part);
    const rec = (await q<any>(`SELECT quantity, "resolvedQty", "returnedAt" FROM dispense_records WHERE id = $1`, [loan.recordId]))[0];
    eq(`DUR partial resolvedQty`, rec.resolvedQty, part);
    check(`DUR partial ยังไม่ปิดรายการ`, rec.returnedAt === null || part >= loan.qty, `returnedAt=${rec.returnedAt}`);

    const rest = loan.qty - part;
    if (rest > 0) {
      res = await POST(`/api/items/${loan.itemId}/return`, { quantity: rest, status: "AVAILABLE", dispenseRecordId: loan.recordId, note: "คืนครบ" });
      check(`คืนส่วนที่เหลือ DUR x${rest}`, res.ok, JSON.stringify(res.json));
      const closed = (await q<any>(`SELECT "returnedAt", "resolvedQty" FROM dispense_records WHERE id = $1`, [loan.recordId]))[0];
      check(`DUR คืนครบ → ปิดรายการ`, closed.returnedAt !== null, `resolvedQty=${closed.resolvedQty}`);
    }
    const logged = await countRow(`SELECT count(*) c FROM return_records WHERE "dispenseRecordId" = $1`, [loan.recordId]);
    check(`DUR return_records เขียนครบ`, logged >= 1, `rows=${logged}`);
  }

  // One COUNT loan returned as ชำรุด → feeds the qty repair flow in phase 7.
  const damagedLoan = openCountLoans[n(10)] ?? openCountLoans.at(-1);
  if (damagedLoan) {
    const before = await item(damagedLoan.itemId);
    const res = await POST(`/api/items/${damagedLoan.itemId}/return`, {
      quantity: 1, status: "DAMAGED", dispenseRecordId: damagedLoan.recordId, note: "ชำรุดจากการใช้งาน",
    });
    check(`คืนชำรุด DUR ${before.code ?? ""}`, res.ok, JSON.stringify(res.json));
    if (res.ok) {
      // ชำรุด is parked, not written off — the unit stays on the books (lib/stock holdsTotalQty)
      // and comes back through รับคืนจากส่งซ่อม.
      eq(`DUR ชำรุด totalQty คงเดิม`, (await item(damagedLoan.itemId)).totalQty, before.totalQty);
      eq(`DUR ชำรุด availableQty คงเดิม`, (await item(damagedLoan.itemId)).availableQty, before.availableQty);
      const adj = await countRow(
        `SELECT count(*) c FROM stock_adjustments WHERE "itemId" = $1 AND reason = 'DAMAGED_PENDING_REPAIR' AND "recoveredAt" IS NULL`,
        [damagedLoan.itemId],
      );
      check(`DUR ชำรุด → จองรอซ่อม`, adj > 0, `bookings=${adj}`);
    }
  }

  // Tracked loans: ปกติ / ชำรุด / สูญหาย.
  const outcomes = ["AVAILABLE", "AVAILABLE", "AVAILABLE", "DAMAGED", "LOST"] as const;
  for (const [i, loan] of openLoans.slice(0, n(16)).entries()) {
    const status = outcomes[i % outcomes.length];
    const res = await POST("/api/returns", {
      entries: [{ dispenseRecordId: loan.recordId, subItemId: loan.subItemId, status }],
      note: `รับคืน (${status})`,
    });
    check(`รับคืนรายชิ้น ${status}`, res.ok, JSON.stringify(res.json));
    if (!res.ok) continue;
    const s = await sub(loan.subItemId);
    eq(`sub-item หลังคืน ${status}`, s.status, status === "AVAILABLE" ? "AVAILABLE" : status);
    const rec = (await q<any>(`SELECT "returnedAt", "returnCondition" FROM dispense_records WHERE id = $1`, [loan.recordId]))[0];
    check(`ปิด dispense record หลังคืน`, rec.returnedAt !== null, JSON.stringify(rec));
    eq(`returnCondition บันทึกถูก`, rec.returnCondition, status);
    if (status === "DAMAGED") damagedSubs.push(loan);
  }

  // คืนเข้าคลัง for นำไปใช้งาน.
  for (const rec of openInUse.slice(0, n(12))) {
    const before = await item(rec.itemId);
    const res = await POST(`/api/dispense/in-use/${rec.recordId}/return`, {
      destLocationId: rec.destLocationId,
      quantity: rec.qty,
      note: "เก็บกลับเข้าคลัง",
    });
    check(`คืนเข้าคลัง ${before.code}`, res.ok, JSON.stringify(res.json));
    if (!res.ok) continue;
    const row = (await q<any>(`SELECT "returnedAt", "resolvedQty" FROM dispense_records WHERE id = $1`, [rec.recordId]))[0];
    check(`ปิดรายการนำไปใช้งาน`, row.returnedAt !== null, JSON.stringify(row));
    const isHome = rec.destLocationId === before.locationId;
    if (isHome) eq(`${before.code} คืนถิ่น availableQty +${rec.qty}`, (await item(rec.itemId)).availableQty, before.availableQty + rec.qty);
  }
}

const damagedSubs: { itemId: string; subItemId: string; recordId: string }[] = [];

/** ชุดอุปกรณ์ — ผูกสูตร → ประกอบชุด → ยืม → คืน → ยืมรอบสองได้ทันที. */
async function phaseKit() {
  phase = "6 ชุดอุปกรณ์";
  const kits = await q<ItemRow>(
    `SELECT i.id, i.code, i.name, i."locationId" FROM items i
       JOIN categories c ON c.id = i."categoryId"
       JOIN category_profiles p ON p.id = c."profileId"
      WHERE p.code = 'KIT' AND i."isActive" LIMIT $1`,
    [n(2)],
  );
  if (!kits.length) return check("มีชุดอุปกรณ์ให้ทดสอบ", false, "no KIT items");

  for (const kit of kits) {
    // 1. Link the recipe to real stock (seed BOM rows are free text only).
    const tracked = (await pickItems("KRU", 2, `AND i."availableQty" >= 3`))[0];
    const counted = (await pickItems("DUR", 2, `AND i."availableQty" >= 10`))[0];
    const consumable = (await pickItems("CON", 2, `AND i."availableQty" >= 10`))[0];
    if (!tracked || !counted || !consumable) return check("หาส่วนประกอบชุดได้", false, "missing components");

    const patch = await PATCH(`/api/kits/${kit.id}`, {
      components: [
        { componentItemId: tracked.id, quantity: 1 },
        { componentItemId: counted.id, quantity: 2 },
        { componentItemId: consumable.id, quantity: 3 },
      ],
    });
    check(`ผูกสูตรชุด ${kit.code}`, patch.ok, JSON.stringify(patch.json));
    if (!patch.ok) continue;

    // 2. ประกอบชุด — durable components get cut, consumables do not.
    const sets = 2;
    const beforeTracked = await item(tracked.id);
    const beforeCount = await item(counted.id);
    const beforeCon = await item(consumable.id);
    const asm = await POST(`/api/kits/${kit.id}/assemble`, { sets });
    check(`ประกอบชุด ${kit.code} x${sets}`, asm.ok, JSON.stringify(asm.json));
    if (!asm.ok) continue;
    eq(`ประกอบชุด สร้าง ${sets} ชุด`, asm.json.assembledQty, sets);
    eq(`ครุภัณฑ์ในชุดถูกตัด ${sets} ชิ้น`, (await item(tracked.id)).availableQty, beforeTracked.availableQty - sets);
    eq(`วัสดุคงทนในชุดถูกตัด ${sets * 2}`, (await item(counted.id)).availableQty, beforeCount.availableQty - sets * 2);
    eq(`วัสดุสิ้นเปลืองในชุดไม่ถูกตัด`, (await item(consumable.id)).availableQty, beforeCon.availableQty);

    const setIds: string[] = asm.json.setSubItemIds;
    const setId = setIds[0];
    // ชุดที่ประกอบเสร็จพร้อมให้ยืมทันที — ยอดนี้คือเส้นฐานที่การคืนต้องพากลับมาให้ได้
    const kitAvail = (await item(kit.id)).availableQty;

    // 3. ยืมชุด
    const course = pick(courses);
    const out = await POST("/api/dispense", {
      items: [{ itemId: kit.id, subItemId: setId, quantity: 1 }],
      usageType: "COURSE", courseCode: course.code, usageNote: course.name, dueAt: daysFromNow(7),
    });
    check(`ยืมชุด ${kit.code}`, out.ok, JSON.stringify(out.json));
    if (!out.ok) continue;
    const afterOut = await sub(setId);
    eq(`ชุดออกไปแล้ว → ON_LOAN`, afterOut.status, "ON_LOAN");

    // 4. คืนชุด
    const back = await POST("/api/returns", { entries: [{ dispenseRecordId: out.json.ids[0], subItemId: setId, status: "AVAILABLE" }], note: "คืนชุด" });
    check(`คืนชุด ${kit.code}`, back.ok, JSON.stringify(back.json));
    const afterBack = await sub(setId);
    eq(`ชุดคืนแล้ว → AVAILABLE`, afterBack.status, "AVAILABLE");
    eq(`ชุดคืนแล้ว นับเป็นของพร้อมใช้ทันที`, (await item(kit.id)).availableQty, kitAvail);

    // 5. ยืมรอบสองต่อจากการคืนตรงๆ — ไม่มีขั้นตรวจคั่นอีกแล้ว
    const again = await POST("/api/dispense", {
      items: [{ itemId: kit.id, subItemId: setId, quantity: 1 }],
      usageType: "COURSE", courseCode: pick(courses).code, usageNote: "ยืมรอบสอง", dueAt: daysFromNow(5),
    });
    check(`คืนแล้วยืมต่อได้ทันที`, again.ok, JSON.stringify(again.json));
    if (again.ok) {
      await POST("/api/returns", { entries: [{ dispenseRecordId: again.json.ids[0], subItemId: setId, status: "AVAILABLE" }], note: "คืนชุดรอบสอง" });
    }

    // 6. ชิ้นในชุดแจ้งชำรุด → ต้องหลุดออกจากชุด
    const inside = (await q<any>(`SELECT id, "itemId", "subCode" FROM sub_items WHERE "inKitSubItemId" = $1 LIMIT 1`, [setIds[1] ?? setId]))[0];
    if (inside) {
      const dmg = await POST(`/api/items/${inside.itemId}/status`, {
        subItemId: inside.id, newStatus: "DAMAGED", damageNote: "ชำรุดระหว่างใช้ในชุด", notes: "แจ้งชำรุดจากในชุด",
      });
      check(`แจ้งชำรุดชิ้นในชุด`, dmg.ok, JSON.stringify(dmg.json));
      if (dmg.ok) {
        const s = await sub(inside.id);
        eq(`ชิ้นชำรุดออกจากชุด`, s.inKitSubItemId, null);
        damagedSubs.push({ itemId: inside.itemId, subItemId: inside.id, recordId: "" });
      }
    }
    touchedItems.add(kit.id);
  }
}

/** บำรุงรักษา — PREVENTIVE รอบตรวจ + CORRECTIVE ทั้งแบบรายชิ้นและแบบนับจำนวน. */
async function phaseMaintenance() {
  phase = "7 บำรุงรักษา";

  // PREVENTIVE, whole item (non-tracked).
  for (const it of await pickItems("DUR", n(8))) {
    const res = await POST(`/api/items/${it.id}/maintenance`, {
      type: "PREVENTIVE", result: "AVAILABLE", performedAt: new Date().toISOString(),
      description: "ตรวจเช็คตามรอบประจำปี", cost: rand(0, 1500), attachmentUrls: [],
    });
    check(`บำรุงรักษาตามรอบ ${it.code}`, res.ok, JSON.stringify(res.json));
    if (!res.ok) continue;
    const after = await item(it.id);
    const next = (await q<any>(`SELECT "nextMaintenanceDate", "lastMaintenanceDate" FROM items WHERE id = $1`, [it.id]))[0];
    check(`${it.code} ตั้งรอบถัดไปแล้ว`, next.nextMaintenanceDate !== null, JSON.stringify(next));
    eq(`${it.code} ยอดคงเหลือไม่เปลี่ยน`, after.availableQty, it.availableQty);
    touchedItems.add(it.id);
  }

  // PREVENTIVE, per tracked piece.
  for (const it of await pickItems("KRU", n(8), `AND i."availableQty" > 0`)) {
    const subs = await availSubs(it.id, 1);
    if (!subs.length) continue;
    const res = await POST(`/api/items/${it.id}/maintenance`, {
      type: "PREVENTIVE", result: "AVAILABLE", performedAt: new Date().toISOString(),
      subItemId: subs[0].id, description: "ตรวจเช็ครายชิ้น", cost: rand(0, 900), attachmentUrls: [],
    });
    check(`บำรุงรักษารายชิ้น ${it.code}-${subs[0].subCode}`, res.ok, JSON.stringify(res.json));
    if (!res.ok) continue;
    const s = (await q<any>(`SELECT "nextMaintenanceDate" FROM sub_items WHERE id = $1`, [subs[0].id]))[0];
    check(`${it.code}-${subs[0].subCode} ตั้งรอบถัดไป`, s.nextMaintenanceDate !== null, JSON.stringify(s));
    const mr = await countRow(`SELECT count(*) c FROM maintenance_records WHERE "subItemId" = $1`, [subs[0].id]);
    check(`${it.code}-${subs[0].subCode} มีประวัติซ่อมบำรุง`, mr > 0, `rows=${mr}`);
  }

  // CORRECTIVE per piece: ชำรุด → ส่งซ่อม → รับคืน.
  const fresh = await pickItems("KRU", n(6), `AND i."availableQty" > 0`);
  const repairTargets: { itemId: string; subItemId: string }[] = [];
  for (const it of fresh) {
    const subs = await availSubs(it.id, 1);
    if (subs.length) repairTargets.push({ itemId: it.id, subItemId: subs[0].id });
  }
  for (const t of [...repairTargets, ...damagedSubs.map((d) => ({ itemId: d.itemId, subItemId: d.subItemId }))]) {
    const current = await sub(t.subItemId);
    if (current.status === "AVAILABLE") {
      const dmg = await POST(`/api/items/${t.itemId}/status`, { subItemId: t.subItemId, newStatus: "DAMAGED", damageNote: "ชำรุดจากการใช้งาน" });
      check(`แจ้งชำรุดรายชิ้น`, dmg.ok, JSON.stringify(dmg.json));
      if (!dmg.ok) continue;
    } else if (current.status !== "DAMAGED") {
      continue;
    }
    const send = await POST(`/api/items/${t.itemId}/status`, {
      subItemId: t.subItemId, newStatus: "UNDER_REPAIR",
      repairVenue: pick(["INTERNAL", "EXTERNAL"]), repairNote: "ส่งซ่อมตามใบแจ้ง",
    });
    check(`ส่งซ่อมรายชิ้น`, send.ok, JSON.stringify(send.json));
    if (!send.ok) continue;
    eq(`ชิ้นอยู่ระหว่างซ่อม`, (await sub(t.subItemId)).status, "UNDER_REPAIR");

    const done = await POST(`/api/items/${t.itemId}/maintenance`, {
      type: "CORRECTIVE", result: "AVAILABLE", performedAt: new Date().toISOString(),
      subItemId: t.subItemId, issue: "ชำรุดจากการใช้งาน", description: "เปลี่ยนอะไหล่และทดสอบ",
      cost: rand(200, 4000), attachmentUrls: [],
    });
    check(`รับคืนจากซ่อมรายชิ้น`, done.ok, JSON.stringify(done.json));
    if (!done.ok) continue;
    eq(`ซ่อมเสร็จ → พร้อมใช้งาน`, (await sub(t.subItemId)).status, "AVAILABLE");
    const venue = (await q<any>(`SELECT "repairVenue", cost FROM maintenance_records WHERE "subItemId" = $1 ORDER BY "createdAt" DESC LIMIT 1`, [t.subItemId]))[0];
    check(`บันทึกซ่อมมีสถานที่ซ่อม`, !!venue?.repairVenue, JSON.stringify(venue));
  }

  // CORRECTIVE for qty stock: ชำรุด booking → ส่งซ่อม → รับคืน.
  const bookings = await q<any>(
    `SELECT id, "itemId", "previousQty", "newQty" FROM stock_adjustments
      WHERE reason = 'DAMAGED_PENDING_REPAIR' AND "recoveredAt" IS NULL AND "repairSentAt" IS NULL
      ORDER BY "adjustedAt" DESC LIMIT $1`,
    [n(4)],
  );
  check("มีรายการชำรุดแบบนับจำนวนให้ส่งซ่อม", bookings.length > 0, `rows=${bookings.length}`);
  for (const b of bookings) {
    const before = await item(b.itemId);
    const sent = await POST("/api/repairs", { adjustmentId: b.id, venue: "EXTERNAL", repairNote: "ส่งร้านซ่อมภายนอก", damageNote: "ขาชำรุด" });
    check(`ส่งซ่อมแบบนับจำนวน ${before.code}`, sent.ok, JSON.stringify(sent.json));
    if (!sent.ok) continue;
    const row = (await q<any>(`SELECT "repairSentAt", "repairVenue" FROM stock_adjustments WHERE id = $1`, [b.id]))[0];
    check(`สแตมป์วันส่งซ่อม`, row.repairSentAt !== null, JSON.stringify(row));

    const done = await POST(`/api/items/${b.itemId}/maintenance`, {
      type: "CORRECTIVE", result: "AVAILABLE", performedAt: new Date().toISOString(),
      adjustmentId: b.id, issue: "ขาชำรุด", description: "เชื่อมและทำสีใหม่", cost: rand(300, 2500), attachmentUrls: [],
    });
    check(`รับคืนจากซ่อมแบบนับจำนวน ${before.code}`, done.ok, JSON.stringify(done.json));
    if (!done.ok) continue;
    const closed = (await q<any>(`SELECT "recoveredAt" FROM stock_adjustments WHERE id = $1`, [b.id]))[0];
    check(`ปิดรายการชำรุดแล้ว`, closed.recoveredAt !== null, JSON.stringify(closed));
    const qty = b.previousQty - b.newQty;
    eq(`${before.code} ของกลับเข้าคลัง +${qty}`, (await item(b.itemId)).availableQty, before.availableQty + qty);
  }
}

/** ประวัติ — the item timeline and every history report must show what just happened. */
async function phaseHistory() {
  phase = "8 ประวัติ";

  const sample = [...touchedItems].slice(0, n(10));
  for (const id of sample) {
    const res = await GET(`/api/items/${id}/history?perPage=100`);
    const it = await item(id);
    check(`ประวัติ ${it.code} โหลดได้`, res.ok, JSON.stringify(res.json).slice(0, 200));
    if (!res.ok) continue;
    check(`ประวัติ ${it.code} มีรายการ`, (res.json.total ?? 0) > 0, `total=${res.json.total}`);
    const dbCounts = {
      receive: await countRow(`SELECT count(*) c FROM receive_records WHERE "itemId" = $1`, [id]),
      dispense: await countRow(`SELECT count(*) c FROM dispense_records WHERE "itemId" = $1`, [id]),
      ret: await countRow(`SELECT count(*) c FROM return_records WHERE "itemId" = $1`, [id]),
      maint: await countRow(`SELECT count(*) c FROM maintenance_records WHERE "itemId" = $1`, [id]),
    };
    const dbTotal = dbCounts.receive + dbCounts.dispense + dbCounts.ret + dbCounts.maint;
    check(
      `ประวัติ ${it.code} ครอบคลุมทุก movement (db≥${dbTotal})`,
      (res.json.total ?? 0) >= dbTotal,
      `timeline=${res.json.total} db=${JSON.stringify(dbCounts)}`,
    );
    const events = res.json.events ?? [];
    const undated = events.filter((e: any) => !e.date).length;
    eq(`ประวัติ ${it.code} ทุกแถวมีวันที่`, undated, 0);
    const nameless = events.filter((e: any) => !e.user).length;
    eq(`ประวัติ ${it.code} ทุกแถวมีผู้ทำรายการ`, nameless, 0);
  }

  const reports: [string, string][] = [
    ["dispense-history", "/api/reports/dispense-history?perPage=20"],
    ["receive-history", "/api/reports/receive-history?perPage=20"],
    ["cases", "/api/cases?perPage=20"],
    ["status-log", "/api/reports/status-log?perPage=20"],
    ["stock-balance", "/api/reports/stock-balance"],
    ["maintenance-schedule", "/api/reports/maintenance-schedule"],
    ["usage-by-subject", "/api/reports/usage-by-subject"],
    ["annual-cost", "/api/reports/annual-cost"],
  ];
  for (const [name, path] of reports) {
    const res = await GET(path);
    check(`report ${name}`, res.ok, `status=${res.status} ${JSON.stringify(res.json).slice(0, 160)}`);
    if (!res.ok) continue;
    const rows = res.json.rows ?? res.json.records ?? res.json.items ?? res.json.purchases ?? [];
    check(`report ${name} มีข้อมูล`, (res.json.total ?? rows.length ?? 0) > 0, JSON.stringify(res.json).slice(0, 160));
  }

  const dashboards = [
    "/api/dashboard/tab-summary?tab=consume",
    "/api/dashboard/flow-monthly?tab=consume",
    "/api/dashboard/recent-dispense?tab=consume",
    "/api/dashboard/recent-receive",
    "/api/dashboard/outstanding-loans",
    "/api/dashboard/top-dispense?tab=consume",
    "/api/alerts",
  ];
  for (const path of dashboards) {
    const res = await GET(path);
    check(`GET ${path}`, res.ok, `status=${res.status} ${JSON.stringify(res.json).slice(0, 160)}`);
  }
}

/** Cross-cutting invariants over the whole DB after the run. */
async function phaseInvariants() {
  phase = "9 ตรวจความถูกต้องรวม";

  const negatives = await countRow(`SELECT count(*) c FROM items WHERE "availableQty" < 0 OR "totalQty" < 0`);
  eq("ไม่มียอดติดลบ", negatives, 0);

  const overAvail = await countRow(`SELECT count(*) c FROM items WHERE "availableQty" > "totalQty"`);
  eq("availableQty ไม่เกิน totalQty", overAvail, 0);

  const lotDrift = await q<any>(
    `SELECT i.code, i."availableQty", sum(l."remainingQty") lot_sum
       FROM items i JOIN lots l ON l."itemId" = i.id
      GROUP BY i.id, i.code, i."availableQty"
     HAVING i."availableQty" <> sum(l."remainingQty")`,
  );
  eq("ของที่มีล็อต: availableQty = SUM(lots)", lotDrift.length, 0);

  const trackedDrift = await q<any>(
    `SELECT i.code, i."availableQty",
            count(*) FILTER (WHERE s.status = 'AVAILABLE' AND s."inKitSubItemId" IS NULL) avail
       FROM items i JOIN sub_items s ON s."itemId" = i.id
      WHERE i."trackIndividually"
      GROUP BY i.id, i.code, i."availableQty"
     HAVING i."availableQty" <> count(*) FILTER (WHERE s.status = 'AVAILABLE' AND s."inKitSubItemId" IS NULL)`,
  );
  check("ของรายชิ้น: availableQty = จำนวนชิ้นพร้อมใช้", trackedDrift.length === 0, JSON.stringify(trackedDrift.slice(0, 5)));

  const orphanReturn = await countRow(
    `SELECT count(*) c FROM dispense_records WHERE "returnedAt" IS NOT NULL AND "resolvedQty" < quantity`,
  );
  eq("รายการที่ปิดแล้วต้องคืนครบ", orphanReturn, 0);

  const overResolved = await countRow(`SELECT count(*) c FROM dispense_records WHERE "resolvedQty" > quantity`);
  eq("คืนเกินจำนวนที่เบิก", overResolved, 0);

  const loanLeak = await countRow(
    `SELECT count(*) c FROM sub_items WHERE status = 'ON_LOAN' AND id NOT IN
       (SELECT "subItemId" FROM dispense_records WHERE "subItemId" IS NOT NULL AND "returnedAt" IS NULL)`,
  );
  eq("ชิ้นที่ ON_LOAN ต้องมีรายการยืมค้างอยู่", loanLeak, 0);
}

// ── run ───────────────────────────────────────────────────────────────────────
async function snapshot() {
  const t = async (table: string) => countRow(`SELECT count(*) c FROM ${table}`);
  return {
    dispense: await t("dispense_records"),
    receive: await t("receive_records"),
    returns: await t("return_records"),
    adjustments: await t("stock_adjustments"),
    maintenance: await t("maintenance_records"),
    statusLogs: await t("item_status_logs"),
    subItems: await t("sub_items"),
    lots: await t("lots"),
  };
}

async function main() {
  const started = Date.now();
  const before = await snapshot();

  await phaseLogin();
  for (const fn of [phaseReceive, phaseDispenseConsumable, phaseBorrow, phaseInUse, phaseReturns, phaseKit, phaseMaintenance, phaseHistory, phaseInvariants]) {
    const label = fn.name.replace("phase", "");
    process.stdout.write(`▶ ${label} …`);
    const t0 = Date.now();
    try {
      await fn();
    } catch (e) {
      check(`${label} ทำงานจนจบ`, false, e instanceof Error ? e.message : String(e));
    }
    console.log(` ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  const after = await snapshot();

  console.log("\n── รายการที่เกิดขึ้น ──");
  for (const k of Object.keys(after) as (keyof typeof after)[]) {
    console.log(`  ${k.padEnd(12)} ${String(before[k]).padStart(6)} → ${String(after[k]).padStart(6)}  (+${after[k] - before[k]})`);
  }

  console.log("\n── ผลตรวจรายเฟส ──");
  const phases = [...new Set(checks.map((c) => c.phase))];
  for (const p of phases) {
    const rows = checks.filter((c) => c.phase === p);
    const failed = rows.filter((c) => !c.ok);
    console.log(`  ${failed.length ? "✗" : "✓"} ${p.padEnd(22)} ${rows.length - failed.length}/${rows.length}`);
  }

  const failures = checks.filter((c) => !c.ok);
  if (failures.length) {
    console.log(`\n── ที่ไม่ผ่าน (${failures.length}) ──`);
    for (const f of failures.slice(0, 60)) console.log(`  [${f.phase}] ${f.name}\n      ${f.detail.slice(0, 300)}`);
    if (failures.length > 60) console.log(`  … อีก ${failures.length - 60} รายการ`);
  }

  console.log(`\nAPI calls: ${calls} · checks: ${checks.length} · fail: ${failures.length} · ${((Date.now() - started) / 1000).toFixed(1)}s`);
  await pool.end();
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
