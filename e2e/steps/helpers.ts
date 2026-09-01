import type { APIRequestContext, Page } from "@playwright/test";
import { makeTracked, pool } from "../fixtures";

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
    data: { code, name: `E2E ${code}`, categoryId: cat.id, issueUnitId: unit.id, initialQty },
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
    data: { code, name: `E2E ${code}`, categoryId: cat.id, issueUnitId: unit.id, initialQty },
  });
  if (!res.ok()) throw new Error(`createCountItem failed: ${res.status()}`);
  return res.json();
}

/** File an INUSE dispense for a COUNT item via API — setup for the คืนเข้าคลัง scenario. */
export async function stationInUse(request: APIRequestContext, itemId: string) {
  const loc = (await pool.query(`SELECT id FROM locations LIMIT 1`)).rows[0];
  const res = await request.post("/api/dispense", {
    data: {
      items: [{ itemId, quantity: 1 }],
      loanType: "INUSE",
      locationId: loc.id,
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
