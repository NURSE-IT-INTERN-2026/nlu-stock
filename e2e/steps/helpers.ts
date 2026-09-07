import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { makeTracked, pool, dbHomeLocation } from "../fixtures";

/** Create a CONSUMABLE item with a known qty, via the same API the wizard uses. */
export async function createConsumable(
  request: APIRequestContext,
  code: string,
  initialQty: number
) {
  const cat = (
    await pool.query(
      `SELECT c.id FROM categories c JOIN category_profiles p ON c."profileId" = p.id WHERE p.code = 'CON' LIMIT 1`
    )
  ).rows[0];
  const unit = (await pool.query(`SELECT id FROM units LIMIT 1`)).rows[0];
  const res = await request.post("/api/items/quick-create", {
    data: {
      code,
      name: `E2E ${code}`,
      categoryId: cat.id,
      issueUnitId: unit.id,
      initialQty,
      locationId: await dbHomeLocation(),
    },
  });
  if (!res.ok()) throw new Error(`createConsumable failed: ${res.status()}`);
  return res.json();
}

/** Borrow a tracked sub-item via API — setup for the return-flow scenarios. */
export async function borrowSubItem(
  request: APIRequestContext,
  itemId: string,
  subItemId: string
) {
  const due = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const res = await request.post("/api/dispense", {
    data: {
      items: [{ itemId, subItemId, quantity: 1 }],
      usageType: "ACTIVITY",
      usageNote: "E2E borrow",
      dueAt: due,
    },
  });
  if (!res.ok()) throw new Error(`borrowSubItem failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

/** Mark a sub-item DAMAGED via the status route — puts it on /repairs รอส่งซ่อม. */
export async function damageSubItem(
  request: APIRequestContext,
  itemId: string,
  subItemId: string
) {
  const res = await request.post(`/api/items/${itemId}/status`, {
    data: { newStatus: "DAMAGED", subItemId, damageNote: "E2E damage" },
  });
  if (!res.ok()) throw new Error(`damageSubItem failed: ${res.status()} ${await res.text()}`);
}

/** Send a damaged sub-item for repair via the status route (UNDER_REPAIR). */
export async function sendRepair(
  request: APIRequestContext,
  itemId: string,
  subItemId: string,
  venue: "INTERNAL" | "EXTERNAL" = "INTERNAL"
) {
  const res = await request.post(`/api/items/${itemId}/status`, {
    data: {
      newStatus: "UNDER_REPAIR",
      subItemId,
      repairVenue: venue,
      repairNote: venue === "EXTERNAL" ? "ส่งซ่อมร้าน ABC" : "ซ่อมใน",
      damageNote: "E2E damage",
    },
  });
  if (!res.ok()) throw new Error(`sendRepair failed: ${res.status()} ${await res.text()}`);
}

/** Create a COUNT (ยืม-คืน ตามจำนวน) item with initial qty — for นำไปใช้งาน / คืนเข้าคลัง. */
export async function createCountItem(
  request: APIRequestContext,
  code: string,
  initialQty: number
) {
  const cat = (
    await pool.query(
      `SELECT c.id FROM categories c JOIN category_profiles p ON c."profileId" = p.id WHERE p.code = 'DUR' LIMIT 1`
    )
  ).rows[0];
  const unit = (await pool.query(`SELECT id FROM units LIMIT 1`)).rows[0];
  const res = await request.post("/api/items/quick-create", {
    data: {
      code,
      name: `E2E ${code}`,
      categoryId: cat.id,
      issueUnitId: unit.id,
      initialQty,
      locationId: await dbHomeLocation(),
    },
  });
  if (!res.ok()) throw new Error(`createCountItem failed: ${res.status()}`);
  return res.json();
}

/** File an INUSE dispense for a COUNT item via API — setup for the คืนเข้าคลัง scenario. */
export async function stationInUse(request: APIRequestContext, itemId: string) {
  const res = await request.post("/api/dispense", {
    data: {
      items: [{ itemId, quantity: 1 }],
      loanType: "INUSE",
      locationId: await dbHomeLocation(),
      notes: "E2E ตั้งใช้ในห้อง",
    },
  });
  if (!res.ok()) throw new Error(`stationInUse failed: ${res.status()} ${await res.text()}`);
}

export { makeTracked };

/** Item detail by code — the route accepts the code as [id]. */
export async function openItemDetail(page: Page, code: string) {
  await page.goto(`/items/${code}`);
  await page.getByRole("button", { name: "ข้อมูลทั่วไป" }).waitFor();
}

/** Tracked item whose first AVAILABLE sub-item is the target piece. */
export async function freshTracked(request: APIRequestContext, code: string) {
  const t = await makeTracked(request, code, 3);
  return t; // { id, code, subId, subCode }
}

/**
 * ยืนยันว่าสิ่งที่เพิ่งกดไปโผล่ใน "ประวัติ" ของพัสดุชิ้นนั้นจริง — toast เขียวบอกแค่ว่า request ผ่าน
 * ไม่ได้บอกว่าประวัติบันทึกอะไรไว้ และเรียงลำดับถูกหรือเปล่า.
 *
 * `newestFirst` คือหัวแถวที่ควรเห็นจากบนลงล่าง = ย้อนลำดับที่กดมา เทียบแค่เท่าที่ส่งมา
 * แถวที่เก่ากว่านั้นปล่อยผ่าน เพราะ DB ใช้ร่วมกันทั้ง suite และ seed ใส่ประวัติมาให้แล้ว.
 *
 * ส่ง `detail` มาด้วยเพื่อเปิดแถวนั้นจริง ๆ แล้วอ่านช่องขวา: แท็บ รายละเอียด ต้องพูดถึงเหตุการณ์นั้น
 * และถ้าระบุ `evidence` แท็บ หลักฐาน ต้องนับไฟล์ได้ตามนั้น.
 */
export async function expectHistory(
  page: Page,
  code: string,
  newestFirst: (string | RegExp)[],
  detail?: { row?: string; contains?: string | RegExp; evidence?: number; copy?: string; steps?: string[] },
) {
  // ?copy= เปิดประวัติของชิ้นนั้นชิ้นเดียว ไม่ใช่ของทั้งรายการ — ลำดับที่กดมาจะอ่านได้ตรงกว่า
  await page.goto(detail?.copy ? `/items/${code}?copy=${detail.copy}` : `/items/${code}`);
  await page.getByRole("button", { name: "ประวัติ", exact: true }).click();

  // Rail() ห่อ children ไว้ใน <div class="min-w-0"> อีกชั้น — ol > li > div > button คือแถวจริง
  const rows = page.locator("ol > li > div > button");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  for (const [i, label] of newestFirst.entries()) {
    await expect(rows.nth(i)).toContainText(label, { timeout: 15_000 });
  }

  if (!detail) return;

  await rows.filter({ hasText: detail.row ?? newestFirst[0] }).first().click();

  // ช่องขวาคือแผงเดียวที่มีปุ่มแท็บ ไทม์ไลน์ — ยึดจากตรงนั้น ไม่ใช่ ol ตัวแรกซึ่งเป็นลิสต์ทางซ้าย
  const pane = page
    .locator("section")
    .filter({ has: page.getByRole("button", { name: "ไทม์ไลน์", exact: true }) })
    .last();

  if (detail.steps) {
    // เคสหนึ่งใบยุบหลายขั้นไว้ในแถวเดียว — ลำดับที่กดมาจริงอ่านได้จากไทม์ไลน์ข้างในนี้ (เก่า→ใหม่)
    await pane.getByRole("button", { name: "ไทม์ไลน์", exact: true }).click();
    const steps = pane.locator("ol > li");
    for (const [i, label] of detail.steps.entries()) {
      await expect(steps.nth(i)).toContainText(label, { timeout: 10_000 });
    }
  }

  await pane.getByRole("button", { name: "รายละเอียด", exact: true }).click();
  if (detail.contains) {
    await expect(page.getByText(detail.contains).first()).toBeVisible({ timeout: 10_000 });
  }
  if (detail.evidence !== undefined) {
    // แท็บ หลักฐาน พิมพ์จำนวนไฟล์ต่อท้ายชื่อแท็บ — นับจากตรงนั้น ไม่ต้องไล่ <img> ที่ยังโหลดไม่เสร็จ
    await expect(
      page.getByRole("button").filter({ hasText: new RegExp(`หลักฐาน\\s*${detail.evidence}(?!\\d)`) }).first(),
    ).toBeVisible({ timeout: 10_000 });
  }
}
