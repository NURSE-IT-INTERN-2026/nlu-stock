import { createBdd } from "playwright-bdd";
import { test, expect, pool } from "../fixtures";
import { createConsumable, freshTracked } from "./helpers";

const { Given, When, Then } = createBdd(test);

const TAB_QUERY: Record<string, string> = {
  หมวดหมู่: "categories",
  หน่วยนับ: "units",
  ประเภท: "profiles",
  สถานที่: "locations",
  ผู้ใช้งาน: "users",
};

Given("ฉันเปิดหน้าตั้งค่า แท็บ {string}", async ({ page }, tab: string) => {
  await page.goto(`/settings?tab=${TAB_QUERY[tab] ?? tab}`);
  await expect(page.getByRole("button", { name: new RegExp(`^เพิ่ม${tab}`) })).toBeVisible({ timeout: 15_000 });
});

When(
  "ฉันกด {string} ตั้งชื่อแล้วเลือกประเภท {string} และกดสร้าง",
  async ({ page, bdd, uniqueCode }, button: string, profile: string) => {
    bdd.categoryName = `E2E หมวด ${uniqueCode}`;
    await page.getByRole("button", { name: new RegExp(`^${button}`) }).first().click();
    // สร้างหมวดหมู่เป็น wizard สองขั้น (ตั้งชื่อ+ประเภท → หน้ายืนยัน) ไม่ใช่ฟอร์มเดียวจบ
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("ชื่อหมวดหมู่").fill(bdd.categoryName);
    await dialog.getByRole("button", { name: profile, exact: true }).click();
    await dialog.getByRole("button", { name: /^ถัดไป/ }).click();
    await dialog.getByRole("button", { name: /^บันทึก/ }).click();
    await expect(page.getByText("สร้างหมวดหมู่สำเร็จ")).toBeVisible({ timeout: 15_000 });
  }
);

When("ฉันกด {string} ตั้งชื่อแล้วกดสร้าง", async ({ page, bdd, uniqueCode }, button: string) => {
  bdd.unitName = `E2E หน่วย ${uniqueCode}`;
  await page.getByRole("button", { name: new RegExp(`^${button}`) }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("ชื่อหน่วยนับ").fill(bdd.unitName);
  await dialog.getByRole("button", { name: "สร้าง", exact: true }).click();
  await expect(page.getByText("เพิ่มหน่วยสำเร็จ")).toBeVisible({ timeout: 15_000 });
});

Then("ฉันจะเห็นหมวดหมู่ใหม่ในตารางหมวดหมู่", async ({ page, bdd }) => {
  // 23 หมวดกับหน้าละ 20 — ตัวใหม่ตกไปหน้า 2 กรองด้วยประเภทก่อนถึงจะอยู่หน้าเดียว
  // (แถบ pill กลายเป็น Select ตั้งแต่ eca9ec4 — ประเภทเพิ่มจาก UI ได้ แถวปุ่มเลยยาวไม่จบ)
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "ครุภัณฑ์", exact: true }).click();
  await expect(page.getByText(bdd.categoryName, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  const { rows } = await pool.query(`SELECT id FROM categories WHERE name = $1`, [bdd.categoryName]);
  expect(rows.length, "หมวดหมู่ไม่ได้ลง DB").toBe(1);
});

Then("ฉันจะเห็นหน่วยนับใหม่ในตารางหน่วยนับ", async ({ page, bdd }) => {
  await expect(page.getByText(bdd.unitName, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  const { rows } = await pool.query(`SELECT id FROM units WHERE name = $1`, [bdd.unitName]);
  expect(rows.length, "หน่วยนับไม่ได้ลง DB").toBe(1);
});

Then(
  "หมวดหมู่ใหม่ต้องเลือกได้ใน wizard เพิ่มพัสดุ ใต้ประเภท {string}",
  async ({ page, bdd }, profile: string) => {
    // ปิดวงจร: wizard เลือกได้อย่างเดียวแล้ว หมวดที่สร้างที่นี่ต้องไปโผล่ที่นั่นจริง
    // ไม่งั้นการตัดทางสร้างออกจาก wizard = ตัดทางใช้หมวดใหม่ไปด้วย
    await page.goto("/receive");
    await page.getByRole("button", { name: /เพิ่มใหม่/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("ชื่อพัสดุ").fill("E2E ตรวจหมวดใหม่");
    await dialog.getByRole("button", { name: /ยืม-คืน ตาม Code/ }).click();
    await dialog.getByRole("button", { name: /^ถัดไป/ }).click();
    await dialog.getByRole("button", { name: "หมวดหมู่", exact: true }).click();
    await page.getByRole("group", { name: "ประเภท" }).getByRole("button", { name: profile, exact: true }).click();
    await expect(
      page.getByRole("group", { name: "หมวดหมู่ย่อย" }).getByRole("button", { name: bdd.categoryName, exact: true })
    ).toBeVisible({ timeout: 15_000 });
  }
);

Given("มีรายการ X อยู่ในทะเบียน", async ({ request, bdd, uniqueCode }) => {
  bdd.item = await createConsumable(request, uniqueCode, 5);
});

When(
  "ฉันเปิดหน้าตั้งค่า แท็บรายการพัสดุ กดแก้ไขที่แถวของ X แล้วเปลี่ยนชื่อ",
  async ({ page, bdd }) => {
    bdd.renamed = `${bdd.item.name} (แก้ชื่อแล้ว)`;
    await page.goto("/settings?tab=items");
    // ทะเบียนมีเกือบพันรายการ — ค้นก่อนแล้วค่อยกดแถว ไม่งั้นแถวที่ต้องการอยู่คนละหน้า
    await page.getByPlaceholder(/ค้นหา/).first().fill(bdd.item.code);
    const row = page
      .getByText(bdd.item.code, { exact: false })
      .locator('xpath=ancestor::*[.//button[@aria-label="แก้ไข"]][1]')
      .first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: "แก้ไข", exact: true }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("เช่น เครื่องดื่มหัวปลีแบบผง").fill(bdd.renamed);
    await dialog.getByRole("button", { name: /^บันทึกการแก้ไข/ }).click();
    await expect(page.getByText("แก้ไขรายการสำเร็จ")).toBeVisible({ timeout: 15_000 });
  }
);

Given("มีครุภัณฑ์ X อยู่ในทะเบียน", async ({ request, bdd, uniqueCode }) => {
  // ครุภัณฑ์เป็น profile เดียวที่ assetTracking = true — ฟิลด์จัดซื้อของประเภทอื่นถูก
  // sanitizeItemByProfile ตัดทิ้งก่อนถึง DB จึงไม่มีอะไรให้บันทึก
  bdd.item = await freshTracked(request, uniqueCode);
});

When(
  "ฉันเปิดหน้าตั้งค่า แท็บรายการพัสดุ กดแก้ไขที่แถวของ X แล้วตั้งราคาจัดซื้อเป็น {int}",
  async ({ page, bdd }, price: number) => {
    await page.goto("/settings?tab=items");
    await page.getByPlaceholder(/ค้นหา/).first().fill(bdd.item.code);
    const row = page
      .getByText(bdd.item.code, { exact: false })
      .locator('xpath=ancestor::*[.//button[@aria-label="แก้ไข"]][1]')
      .first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: "แก้ไข", exact: true }).first().click();

    const dialog = page.getByRole("dialog");
    const priceField = dialog.locator('input[type="number"][step="0.01"]').first();
    await expect(priceField).toBeVisible({ timeout: 10_000 });
    await priceField.fill(String(price));
    await dialog.getByRole("button", { name: /^บันทึกการแก้ไข/ }).click();
    await expect(page.getByText("แก้ไขรายการสำเร็จ")).toBeVisible({ timeout: 15_000 });
  }
);

// ── ประเภท (CategoryProfile) ────────────────────────────────────────────────
When("ฉันกด {string} ตั้งชื่อกับรหัสย่อแล้วกดสร้าง", async ({ page, bdd, uniqueCode }, button: string) => {
  bdd.profileName = `E2E ประเภท ${uniqueCode}`;
  // รหัสย่อต้องผ่าน /^[A-Z][A-Z0-9]{1,5}$/ — uniqueCode เป็น base36 พิมพ์ใหญ่ แต่ขึ้นต้นด้วยเลขได้
  bdd.profileCode = `Z${uniqueCode.slice(-5)}`;
  await page.getByRole("button", { name: new RegExp(`^${button}`) }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("ชื่อประเภท").fill(bdd.profileName);
  await dialog.getByLabel("รหัสย่อ").fill(bdd.profileCode);
  await dialog.getByRole("button", { name: "สร้าง", exact: true }).click();
  await expect(page.getByText("สร้างประเภทสำเร็จ")).toBeVisible({ timeout: 15_000 });
});

Then("ฉันจะเห็นประเภทใหม่ในตารางประเภท", async ({ page, bdd }) => {
  await expect(page.getByText(bdd.profileName, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  const { rows } = await pool.query(`SELECT id FROM category_profiles WHERE code = $1`, [bdd.profileCode]);
  expect(rows.length, "ประเภทไม่ได้ลง DB").toBe(1);
});

Then("ประเภทใหม่ต้องเลือกได้ตอนสร้างหมวดหมู่", async ({ page, bdd }) => {
  // ปิดวงจร: ประเภทที่เพิ่งสร้างต้องโผล่ในขั้นเลือกประเภทของ wizard สร้างหมวดหมู่จริง
  await page.goto("/settings?tab=categories");
  await page.getByRole("button", { name: /^เพิ่มหมวดหมู่/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: bdd.profileName, exact: true })
  ).toBeVisible({ timeout: 15_000 });
});

// ── สถานที่ ─────────────────────────────────────────────────────────────────
When("ฉันกด {string} กรอกอาคาร ชั้น ห้อง แล้วกดสร้าง", async ({ page, bdd, uniqueCode }, button: string) => {
  bdd.building = `E2E อาคาร ${uniqueCode}`;
  await page.getByRole("button", { name: new RegExp(`^${button}`) }).first().click();
  const dialog = page.getByRole("dialog");
  // Combobox = Input ธรรมดาที่มี dropdown — พิมพ์ค่าใหม่ลงไปตรง ๆ ได้
  await dialog.getByLabel("อาคาร").fill(bdd.building);
  await dialog.getByLabel("ชั้น").fill("9");
  await dialog.getByLabel("ห้อง").fill("901");
  await dialog.getByRole("button", { name: /^สร้างสถานที่/ }).click();
  await expect(page.getByText("สร้างสถานที่สำเร็จ")).toBeVisible({ timeout: 15_000 });
});

Then("ฉันจะเห็นสถานที่ใหม่ในผังสถานที่", async ({ page, bdd }) => {
  await expect(page.getByText(bdd.building, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  const { rows } = await pool.query(
    `SELECT id FROM locations WHERE building = $1 AND floor = '9' AND room = '901'`,
    [bdd.building]
  );
  expect(rows.length, "สถานที่ไม่ได้ลง DB").toBe(1);
});

// ── เทมเพลตเบิก ─────────────────────────────────────────────────────────────
When(
  "ฉันเปิดหน้าตั้งค่า แท็บเทมเพลตเบิก กด {string} ตั้งชื่อแล้วใส่ X",
  async ({ page, bdd, uniqueCode }, button: string) => {
    bdd.templateName = `E2E เทมเพลต ${uniqueCode}`;
    await page.goto("/settings?tab=templates");
    await page.getByRole("button", { name: new RegExp(`^${button}`) }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder(/^ชื่อเทมเพลต/).fill(bdd.templateName);
    await dialog.getByPlaceholder(/^ค้นหาพัสดุเพื่อเพิ่ม/).fill(bdd.item.code);
    await dialog.getByRole("button").filter({ hasText: bdd.item.code }).first().click();
    await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(page.getByText("สร้างเทมเพลตแล้ว")).toBeVisible({ timeout: 15_000 });
  }
);

Then("ฉันจะเห็นเทมเพลตใหม่ในตารางเทมเพลต", async ({ page, bdd }) => {
  await expect(page.getByText(bdd.templateName, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  // นับบรรทัดใน DB ด้วย — ชื่อโผล่ในตารางได้ถึงแม้ของในเทมเพลตจะหายไปหมด
  const { rows } = await pool.query(
    `SELECT COUNT(l.id)::int AS lines
       FROM dispense_templates t
       LEFT JOIN dispense_template_lines l ON l."templateId" = t.id
      WHERE t.name = $1
      GROUP BY t.id`,
    [bdd.templateName]
  );
  expect(rows.length, "เทมเพลตไม่ได้ลง DB").toBe(1);
  expect(rows[0].lines, "เทมเพลตไม่มีรายการ").toBe(1);
});

// ── ผู้ใช้งาน ───────────────────────────────────────────────────────────────
When(
  "ฉันกด {string} กรอกอีเมลใหม่ เลือกบทบาท {string} แล้วยืนยัน",
  async ({ page, bdd, uniqueCode }, button: string, role: string) => {
    bdd.userEmail = `e2e-${uniqueCode.toLowerCase()}@cmu.ac.th`;
    await page.getByRole("button", { name: new RegExp(`^${button}`) }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("อีเมล").fill(bdd.userEmail);
    await dialog.getByRole("button", { name: role, exact: true }).click();
    await dialog.getByRole("button", { name: /^ถัดไป/ }).click();
    // ขั้นยืนยันมีปุ่มคนละชื่อกันระหว่าง "เคยล็อกอินแล้ว" กับ "ยังไม่เคย" — ตัวนี้คือยังไม่เคย
    await dialog.getByRole("button", { name: /^ยืนยันเพิ่มผู้ใช้งาน/ }).click();
    await expect(page.getByText("เพิ่มผู้ใช้งานสำเร็จ")).toBeVisible({ timeout: 15_000 });
  }
);

Then(
  "ฉันจะเห็นผู้ใช้ใหม่ในตารางผู้ใช้งาน พร้อมบทบาท {string}",
  async ({ page, bdd }, role: string) => {
    // ทุกแท็บ mount พร้อมกัน (ตัวที่ไม่ active แค่ hidden) — ช่องค้นหาต้องเจาะด้วย placeholder เต็ม
    await page.getByPlaceholder("ค้นหาชื่อหรืออีเมล").fill(bdd.userEmail);
    const row = page
      .getByText(bdd.userEmail, { exact: false })
      .locator("xpath=ancestor::tr[1]")
      .first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText(role, { exact: true })).toBeVisible();
    const { rows } = await pool.query(`SELECT role FROM users WHERE email = $1`, [bdd.userEmail]);
    expect(rows.length, "ผู้ใช้ไม่ได้ลง DB").toBe(1);
    expect(rows[0].role).toBe("ADMIN");
  }
);

// ── รหัสย่อยเป็นชุด ─────────────────────────────────────────────────────────
When(
  "ฉันเปิดหน้าตั้งค่า แท็บรายการพัสดุ กางแถวของ X แล้วสร้างรหัสย่อยเป็นชุด {int} ชิ้น",
  async ({ page, bdd }, count: number) => {
    await page.goto("/settings?tab=items");
    await page.getByPlaceholder(/ค้นหา/).first().fill(bdd.item.code);
    // แถวกางได้เฉพาะพัสดุที่ติดตามรายชิ้นและมีมากกว่า 1 ชิ้น — คลิกที่ชื่อ ไม่ใช่ปุ่มในแถว
    const row = page.locator("tr").filter({ hasText: bdd.item.code }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByText(bdd.item.code, { exact: false }).first().click();

    await page.getByRole("button", { name: /^สร้างเป็นชุด/ }).click();
    const dialog = page.getByRole("dialog");
    bdd.batchPrefix = "B";
    await dialog.getByLabel("คำนำหน้า").fill(bdd.batchPrefix);
    await dialog.getByLabel("เลขเริ่มต้น").fill("1");
    await dialog.getByLabel("เลขสิ้นสุด").fill(String(count));
    await dialog.getByRole("button", { name: "สร้าง", exact: true }).click();
    await expect(page.getByText(`สร้าง ${count} หน่วยย่อย`)).toBeVisible({ timeout: 15_000 });
  }
);

Then("ฉันจะเห็นรหัสย่อยใหม่ในรายการรหัสย่อยของ X", async ({ page, bdd }) => {
  await expect(page.getByText(`${bdd.batchPrefix}1`, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM sub_items WHERE "itemId" = $1`,
    [bdd.item.id]
  );
  expect(rows[0].n, "รหัสย่อยไม่ได้ลง DB").toBe(5);
});

Then("จำนวนชิ้นทั้งหมดของ X ต้องเป็น {int}", async ({ page, bdd }, expected: number) => {
  // ยอดบน items ไม่ใช่แค่ตัวเลขโชว์ — dispense/self-borrow อ่านตัวนี้ตัดสินว่าเบิกได้ไหม
  const { rows } = await pool.query(
    `SELECT "totalQty", "availableQty" FROM items WHERE id = $1`,
    [bdd.item.id]
  );
  expect(rows[0].totalQty, "totalQty ไม่ตามชิ้นที่เพิ่ม").toBe(expected);
  expect(rows[0].availableQty, "availableQty ไม่ตามชิ้นที่เพิ่ม").toBe(expected);
  await page.goto(`/items/${bdd.item.code}`);
  await expect(page.getByText(String(expected)).first()).toBeVisible({ timeout: 15_000 });
});
