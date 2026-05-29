import "dotenv/config";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { join } from "path";

const CSV_DIR = join(process.cwd(), "CSV");

function readCsv(filename: string) {
  const raw = readFileSync(join(CSV_DIR, filename), "utf-8");
  return parse(raw, {
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    bom: true,
  }) as string[][];
}

// Map Thai condition to ItemCondition enum
function mapCondition(th: string): string {
  const t = (th || "").trim();
  if (t === "ปกติ") return "NEW";
  if (t === "ปานกลาง") return "USABLE";
  if (t === "เก่า") return "OLD";
  if (t === "ชำรุด") return "DAMAGED";
  return "USABLE";
}

// Map Thai condition to ItemStatus enum
function mapStatus(th: string): string {
  const t = (th || "").trim();
  if (t === "ปกติ") return "AVAILABLE";
  if (t === "ปานกลาง") return "AVAILABLE";
  if (t === "เก่า") return "AVAILABLE";
  if (t === "ชำรุด") return "DAMAGED";
  return "AVAILABLE";
}

// Parse "อาคาร 2 ชั้น 5" → { building: "อาคาร 2", floor: "ชั้น 5" }
function parseBuildingFloor(raw: string): { building: string; floor: string } {
  const t = (raw || "").trim();
  const bMatch = t.match(/อาคาร\s*\d+/);
  const fMatch = t.match(/ชั้น\s*\d+/);
  return {
    building: bMatch ? bMatch[0] : "อาคาร 2",
    floor: fMatch ? fMatch[0] : "ชั้น 4",
  };
}

// Parse Thai price "60,000.00" → number
function parsePrice(raw: string): number | null {
  if (!raw || !raw.trim()) return null;
  const cleaned = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  // Clean all tables
  await prisma.itemStatusLog.deleteMany();
  await prisma.maintenanceRecord.deleteMany();
  await prisma.stockAdjustment.deleteMany();
  await prisma.dispenseRecord.deleteMany();
  await prisma.receiveRecord.deleteMany();
  await prisma.lot.deleteMany();
  await prisma.subItem.deleteMany();
  await prisma.item.deleteMany();
  await prisma.location.deleteMany();
  await prisma.categoryType.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.user.deleteMany();

  // ============================================================
  // Users
  // ============================================================
  const admin = await prisma.user.create({ data: { email: "admin@dev", name: "Admin User", role: "ADMIN" } });
  const staff = await prisma.user.create({ data: { email: "staff@dev", name: "Staff User", role: "STAFF" } });
  const instructor = await prisma.user.create({ data: { email: "instructor@dev", name: "Instructor User", role: "INSTRUCTOR" } });

  // ============================================================
  // Units — collect all unique units from CSVs
  // ============================================================
  const unitNames = ["กล่อง", "ถุง", "ชิ้น", "set", "ชุด", "ห่อ", "เครื่อง", "อัน", "แผง", "กระปุก", "กรัม", "เม็ด", "ซีซี", "ใบ", "แผ่น", "เส้น", "ขวด", "คู่", "เล่ม", "ม้วน", "ตัว", "ผืน", "ก้อน", "หลอด", "ท่อน", "มิลลิลิตร", "เส้นยาว", "ครึ่ง"];
  const unitMap = new Map<string, string>();
  for (const name of unitNames) {
    const u = await prisma.unit.create({ data: { name } });
    unitMap.set(name, u.id);
  }
  const unitId = (name: string) => unitMap.get(name) || unitMap.get("ชิ้น")!;

  // Parse unit from Thai string like "ใบ/อัน" → first unit
  function parseUnit(raw: string): string {
    const t = (raw || "").trim().split("/")[0].trim();
    return unitMap.get(t) ? t : "ชิ้น";
  }

  // ============================================================
  // CategoryTypes — 8 simplified categories
  // ============================================================
  // FIXED_ASSET (1)
  const catKru = await prisma.categoryType.create({ data: { name: "ครุภัณฑ์", category: "FIXED_ASSET", sortOrder: 1 } });

  // DURABLE (4)
  const catDurable = await prisma.categoryType.create({ data: { name: "วัสดุคงทน", category: "DURABLE", sortOrder: 2 } });
  const catElec = await prisma.categoryType.create({ data: { name: "อุปกรณ์อิเล็กทรอนิกส์", category: "DURABLE", sortOrder: 3 } });
  const catToys = await prisma.categoryType.create({ data: { name: "ของเล่น", category: "DURABLE", sortOrder: 4 } });
  const catSubjectKit = await prisma.categoryType.create({ data: { name: "อุปกรณ์ประกอบวิชา", category: "DURABLE", sortOrder: 5 } });

  // CONSUMABLE (2)
  const catConsumable = await prisma.categoryType.create({ data: { name: "วัสดุสิ้นเปลือง", category: "CONSUMABLE", sortOrder: 6 } });
  const catMedicine = await prisma.categoryType.create({ data: { name: "ยา", category: "CONSUMABLE", sortOrder: 7 } });

  // BOOK (1)
  const catBook = await prisma.categoryType.create({ data: { name: "หนังสือ", category: "BOOK", sortOrder: 8 } });

  // ============================================================
  // Locations — extracted from CSV data
  // ============================================================
  const locCache = new Map<string, string>();

  async function getOrCreateLocation(building: string, floor: string, room: string, detail?: string | null) {
    const key = `${building}|${floor}|${room}|${detail || ""}`;
    if (locCache.has(key)) return locCache.get(key)!;
    const loc = await prisma.location.create({
      data: { building, floor, room, detail: detail || null },
    });
    locCache.set(key, loc.id);
    return loc.id;
  }

  // Pre-create known locations from CSV data
  const knownLocations = [
    { building: "อาคาร 2", floor: "ชั้น 3", rooms: ["SimBaby", "Simmom2", "Simman 1", "Simman 2"] },
    { building: "อาคาร 2", floor: "ชั้น 4", rooms: ["401", "402", "406"] },
    { building: "อาคาร 2", floor: "ชั้น 5", rooms: ["501", "502", "503", "504"] },
  ];
  for (const b of knownLocations) {
    for (const room of b.rooms) {
      await getOrCreateLocation(b.building, b.floor, room);
    }
  }

  const defaultLocId = await getOrCreateLocation("อาคาร 2", "ชั้น 4", "402");

  // ============================================================
  // Helper: strip trailing number from name for grouping
  // "Syringe Pump 1" → "Syringe Pump", "ชุดอุปกรณ์สอนดูแลเด็กทารกหลังคลอด 1" → "ชุดอุปกรณ์สอนดูแลเด็กทารกหลังคลอด"
  // ============================================================
  function stripTrailingNumber(name: string): string {
    return name.replace(/\s+\d+\s*$/, "").trim();
  }

  // Helper: group rows and create Items with SubItems
  type ParsedRow = {
    nameTh: string;
    nameEn: string;
    catId: string;
    brandModel: string;
    buildingFloor: string;
    room: string;
    condition: string;
    serialNo: string;
    warrantyStr: string;
    company: string;
    contact: string;
    phone: string;
    priceStr: string;
    notes: string;
    nluCode: string;
  };

  async function importGrouped(rows: ParsedRow[], codePrefix: string) {
    // Group by (stripped name + categoryId)
    const groups = new Map<string, ParsedRow[]>();
    for (const row of rows) {
      const baseName = stripTrailingNumber(row.nameTh);
      const key = `${baseName}|${row.catId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    let itemCount = 0;
    let subCount = 0;
    for (const [, group] of groups) {
      const first = group[0];
      const baseName = stripTrailingNumber(first.nameTh);
      const baseNameEn = stripTrailingNumber(first.nameEn || first.nameTh);

      const catId = first.catId;
      const { building, floor } = parseBuildingFloor(first.buildingFloor);
      const locId = first.room ? await getOrCreateLocation(building, floor, first.room) : defaultLocId;

      // Use first non-empty model/vendor/price across group
      const model = group.find(r => r.brandModel)?.brandModel || null;
      const vendorCompany = group.find(r => r.company)?.company || null;
      const vendorContact = group.find(r => r.contact)?.contact || null;
      const vendorPhone = group.find(r => r.phone)?.phone || null;
      const price = group.reduce<number | null>((best, r) => best ?? parsePrice(r.priceStr), null);
      const warrantyMatch = group.find(r => r.warrantyStr)?.warrantyStr?.match(/(\d+)/);
      const warrantyMonths = warrantyMatch ? parseInt(warrantyMatch[1]) * 12 : 0;

      const code = `NLU-${codePrefix}-${String(itemCount + 1).padStart(3, "0")}`;
      const unit = unitId("เครื่อง");

      // Count available sub-items for totals
      const availableCount = group.filter(r => mapStatus(r.condition) === "AVAILABLE").length;

      const item = await prisma.item.create({
        data: {
          code, name: baseName, nameEn: baseNameEn !== baseName ? baseNameEn : null,
          categoryId: catId, trackIndividually: true,
          issueUnitId: unit, subUnitId: unit, conversionFactor: 1,
          minThreshold: 1, locationId: locId,
          totalQty: group.length, availableQty: availableCount,
          status: "AVAILABLE" as any,
          model,
          purchasePrice: price,
          vendorCompany, vendorContact, vendorPhone,
          warrantyMonths,
        },
      });

      // Create SubItems for each row in the group
      for (let j = 0; j < group.length; j++) {
        const row = group[j];
        const status = mapStatus(row.condition);
        const cond = mapCondition(row.condition);
        const subCode = `NLU-${codePrefix}-${String(itemCount + 1).padStart(3, "0")}-${String(j + 1).padStart(3, "0")}`;

        await prisma.subItem.create({
          data: {
            itemId: item.id,
            subCode,
            status: status as any,
            condition: cond as any,
            serialNumber: row.serialNo && row.serialNo !== "N/A" && row.serialNo !== "รอเลขจากพัสดุ" ? row.serialNo : null,
            notes: row.notes || null,
          },
        });
        subCount++;
      }
      itemCount++;
    }
    return { itemCount, subCount };
  }

  // ============================================================
  // 1. Import ครุภัณฑ์ (FIXED_ASSET) — grouped
  // ============================================================
  console.log("Importing ครุภัณฑ์...");
  const kruRows = readCsv("ข้อมูลทรัพย์สิน NLU - ครุภัณฑ์.csv");
  const kruParsed: ParsedRow[] = [];
  for (let i = 2; i < kruRows.length; i++) {
    const row = kruRows[i];
    if (!row || row.length < 10) continue;
    const nameTh = (row[3] || "").trim();
    if (!nameTh) continue;
    kruParsed.push({
      nameTh,
      nameEn: (row[4] || "").trim(),
      catId: catKru.id,
      brandModel: (row[6] || "").trim(),
      buildingFloor: (row[7] || "").trim(),
      room: (row[8] || "").trim(),
      condition: (row[9] || "").trim(),
      serialNo: (row[2] || "").trim(),
      warrantyStr: (row[11] || "").trim(),
      company: (row[12] || "").trim(),
      contact: (row[13] || "").trim(),
      phone: (row[14] || "").trim(),
      priceStr: (row[16] || "").trim(),
      notes: (row[17] || "").trim(),
      nluCode: (row[1] || "").trim(),
    });
  }
  const kruResult = await importGrouped(kruParsed, "KRU");
  console.log(`  Imported ${kruResult.itemCount} items, ${kruResult.subCount} sub-items`);

  // ============================================================
  // 2. Import อุปกรณ์อิเล็กทรอนิกส์ (FIXED_ASSET) — grouped
  // ============================================================
  console.log("Importing อุปกรณ์อิเล็กทรอนิกส์...");
  const elecRows = readCsv("ข้อมูลทรัพย์สิน NLU - วัสดุอุปกรณ์อิเล็กทรอนิกส์.csv");
  const elecParsed: ParsedRow[] = [];
  for (let i = 2; i < elecRows.length; i++) {
    const row = elecRows[i];
    if (!row || row.length < 12) continue;
    const nameTh = (row[3] || "").trim();
    if (!nameTh) continue;
    elecParsed.push({
      nameTh,
      nameEn: "",
      catId: catElec.id,
      brandModel: (row[5] || "").trim(),
      buildingFloor: (row[9] || "").trim(),
      room: (row[10] || "").trim(),
      condition: (row[11] || "").trim(),
      serialNo: (row[2] || "").trim(),
      warrantyStr: (row[13] || "").trim(),
      company: (row[15] || "").trim(),
      contact: (row[16] || "").trim(),
      phone: (row[17] || "").trim(),
      priceStr: (row[19] || "").trim(),
      notes: (row[20] || "").trim(),
      nluCode: (row[1] || "").trim(),
    });
  }
  const elecResult = await importGrouped(elecParsed, "ELE");
  console.log(`  Imported ${elecResult.itemCount} items, ${elecResult.subCount} sub-items`);

  // ============================================================
  // 3. Import บัญชีวัสดุคงทน (DURABLE — quantity only)
  // ============================================================
  console.log("Importing บัญชีวัสดุคงทน...");
  const durRows = readCsv("ข้อมูลทรัพย์สิน NLU - บัญชีวัสดุคงทน.csv");
  let durCount = 0;
  for (let i = 2; i < durRows.length; i++) {
    const row = durRows[i];
    if (!row || row.length < 5) continue;
    const nameRaw = (row[2] || "").trim();
    const qtyStr = (row[3] || "").trim();
    const unitRaw = (row[4] || "").trim();
    const notes = (row[7] || "").trim();

    if (!nameRaw) continue;

    const code = `NLU-DUR-${String(durCount + 1).padStart(3, "0")}`;

    // Parse name — "ถาด (Tray)" → name="ถาด", nameEn="Tray"
    const parenMatch = nameRaw.match(/^(.+?)\s*\((.+?)\)\s*$/);
    const name = parenMatch ? parenMatch[1].trim() : nameRaw;
    const nameEn = parenMatch ? parenMatch[2].trim() : null;
    const qty = parseInt(qtyStr) || 0;
    const unitName = parseUnit(unitRaw);

    await prisma.item.create({
      data: {
        code, name, nameEn,
        categoryId: catDurable.id,
        issueUnitId: unitId(unitName), subUnitId: unitId(unitName), conversionFactor: 1,
        minThreshold: 0, locationId: defaultLocId,
        totalQty: qty, availableQty: qty,
        description: notes || null,
      },
    });

    durCount++;
  }
  console.log(`  Imported ${durCount} วัสดุคงทน items`);

  // ============================================================
  // 4. Import วัสดุสิ้นเปลือง (CONSUMABLE)
  // ============================================================
  console.log("Importing วัสดุสิ้นเปลือง...");
  const conRows = readCsv("ข้อมูลทรัพย์สิน NLU - วัสดุสิ้นเปลือง.csv");
  let conCount = 0;
  for (let i = 3; i < conRows.length; i++) {
    const row = conRows[i];
    if (!row || row.length < 4) continue;
    const nameRaw = (row[1] || "").trim();
    const room = (row[2] || "").trim();
    const qtyStr = (row[3] || "").trim();
    const unitRaw = (row[4] || "").trim();

    if (!nameRaw) continue;

    const code = `NLU-CON-${String(conCount + 1).padStart(3, "0")}`;
    const parenMatch = nameRaw.match(/^(.+?)\s*\((.+?)\)\s*$/);
    const name = parenMatch ? parenMatch[1].trim() : nameRaw;
    const nameEn = parenMatch ? parenMatch[2].trim() : null;
    const qty = parseInt(qtyStr) || 0;
    const unitName = parseUnit(unitRaw);

    const { building, floor } = parseBuildingFloor("");
    const locId = room ? await getOrCreateLocation("อาคาร 2", "ชั้น 5", room) : defaultLocId;

    await prisma.item.create({
      data: {
        code, name, nameEn,
        categoryId: catConsumable.id,
        issueUnitId: unitId(unitName), subUnitId: unitId(unitName), conversionFactor: 1,
        minThreshold: 0, locationId: locId,
        totalQty: qty, availableQty: qty,
      },
    });

    conCount++;
  }
  console.log(`  Imported ${conCount} วัสดุสิ้นเปลือง items`);

  // ============================================================
  // 5. Import หนังสือ (BOOK — trackIndividually, grouped by copy)
  // ============================================================
  console.log("Importing หนังสือ...");
  const bookRaw = readFileSync(join(CSV_DIR, "ข้อมูลทรัพย์สิน NLU - หนังสือ.csv"), "utf-8");
  const bookRecords = parse(bookRaw, {
    relax_column_count: true, skip_empty_lines: true, bom: true,
    columns: false, ltrim: true, rtrim: true,
  }) as string[][];

  // Group books by base code (strip -c1, -c2 suffix)
  const bookGroups = new Map<string, { code: string; bookName: string; room: string; copies: string[] }>();
  for (let i = 3; i < bookRecords.length; i++) {
    const row = bookRecords[i];
    if (!row || row.length < 4) continue;
    const code = (row[1] || "").trim();
    const bookName = (row[3] || "").trim();
    const room = (row[4] || "").trim();
    if (!bookName || !code) continue;

    // Strip -c1, -c2 suffix to get base code
    const baseCode = code.replace(/-c\d+$/, "");
    const copySuffix = code.match(/-c(\d+)$/);

    if (!bookGroups.has(baseCode)) {
      bookGroups.set(baseCode, { code: baseCode, bookName, room, copies: [] });
    }
    const group = bookGroups.get(baseCode)!;
    group.copies.push(copySuffix ? code : `${code}-c${group.copies.length + 1}`);
  }

  let bookItemCount = 0, bookSubCount = 0;
  for (const [, group] of bookGroups) {
    const { building, floor } = parseBuildingFloor("");
    const locId = group.room ? await getOrCreateLocation("อาคาร 2", "ชั้น 4", group.room) : defaultLocId;
    const hasMultiple = group.copies.length > 1;

    const item = await prisma.item.create({
      data: {
        code: `NLU-BOOK-${String(bookItemCount + 1).padStart(3, "0")}`,
        name: group.bookName, nameEn: null,
        categoryId: catBook.id, trackIndividually: hasMultiple,
        issueUnitId: unitId("เล่ม"), subUnitId: unitId("เล่ม"), conversionFactor: 1,
        minThreshold: 1, locationId: locId,
        totalQty: group.copies.length, availableQty: group.copies.length,
      },
    });

    if (hasMultiple) {
      for (let ci = 0; ci < group.copies.length; ci++) {
        await prisma.subItem.create({
          data: { itemId: item.id, subCode: `NLU-BOOK-${String(bookItemCount + 1).padStart(3, "0")}-${String(ci + 1).padStart(3, "0")}`, status: "AVAILABLE" },
        });
        bookSubCount++;
      }
    }
    bookItemCount++;
  }
  console.log(`  Imported ${bookItemCount} หนังสือ items, ${bookSubCount} sub-items`);

  // ============================================================
  // 6. Import ของเล่น (DURABLE — trackIndividually, grouped by copy)
  // ============================================================
  console.log("Importing ของเล่น...");
  const toyRaw = readFileSync(join(CSV_DIR, "ข้อมูลทรัพย์สิน NLU - ของเล่น.csv"), "utf-8");
  const toyRecords = parse(toyRaw, {
    relax_column_count: true, skip_empty_lines: true, bom: true,
    columns: false, ltrim: true, rtrim: true,
  }) as string[][];

  // Group toys by base code (strip -c1, -c2 suffix)
  const toyGroups = new Map<string, { toyName: string; room: string; copies: string[] }>();
  for (let i = 3; i < toyRecords.length; i++) {
    const row = toyRecords[i];
    if (!row || row.length < 4) continue;
    const code = (row[1] || "").trim();
    const toyName = (row[3] || "").trim();
    const room = (row[4] || "").trim();
    if (!toyName || !code) continue;

    const baseCode = code.replace(/-c\d+$/, "");
    const copySuffix = code.match(/-c(\d+)$/);

    if (!toyGroups.has(baseCode)) {
      toyGroups.set(baseCode, { toyName, room, copies: [] });
    }
    const group = toyGroups.get(baseCode)!;
    group.copies.push(copySuffix ? code : `${code}-c${group.copies.length + 1}`);
  }

  let toyItemCount = 0, toySubCount = 0;
  for (const [, group] of toyGroups) {
    const { building, floor } = parseBuildingFloor("");
    const locId = group.room ? await getOrCreateLocation("อาคาร 2", "ชั้น 4", group.room) : defaultLocId;
    const hasMultiple = group.copies.length > 1;

    const item = await prisma.item.create({
      data: {
        code: `NLU-TOY-${String(toyItemCount + 1).padStart(3, "0")}`,
        name: group.toyName, nameEn: null,
        categoryId: catToys.id, trackIndividually: hasMultiple,
        issueUnitId: unitId("ชิ้น"), subUnitId: unitId("ชิ้น"), conversionFactor: 1,
        minThreshold: 0, locationId: locId,
        totalQty: group.copies.length, availableQty: group.copies.length,
      },
    });

    if (hasMultiple) {
      for (let ci = 0; ci < group.copies.length; ci++) {
        await prisma.subItem.create({
          data: { itemId: item.id, subCode: `NLU-TOY-${String(toyItemCount + 1).padStart(3, "0")}-${String(ci + 1).padStart(3, "0")}`, status: "AVAILABLE" },
        });
        toySubCount++;
      }
    }
    toyItemCount++;
  }
  console.log(`  Imported ${toyItemCount} ของเล่น items, ${toySubCount} sub-items`);

  // ============================================================
  // 7. Import อุปกรณ์นักศึกษายืมประกอบวิชา (DURABLE — kits)
  // ============================================================
  console.log("Importing อุปกรณ์ประกอบวิชา...");
  const kitRows = readCsv("ข้อมูลทรัพย์สิน NLU - อุปกรณ์นักศึกษายืมประกอบวิชา.csv");
  let kitCount = 0;
  for (let i = 2; i < kitRows.length; i++) {
    const row = kitRows[i];
    if (!row || row.length < 4) continue;
    const seq = (row[0] || "").trim();
    const nameRaw = (row[1] || "").trim();
    const qtyStr = (row[2] || "").trim();
    const unitRaw = (row[3] || "").trim();

    if (!seq || !nameRaw) continue; // skip component sub-rows

    const code = `NLU-KIT-${String(kitCount + 1).padStart(3, "0")}`;
    const qty = parseInt(qtyStr) || 1;
    const unitName = parseUnit(unitRaw);

    await prisma.item.create({
      data: {
        code, name: nameRaw, nameEn: null,
        categoryId: catSubjectKit.id,
        issueUnitId: unitId(unitName), subUnitId: unitId(unitName), conversionFactor: 1,
        minThreshold: 0, locationId: defaultLocId,
        totalQty: qty, availableQty: qty,
      },
    });

    kitCount++;
  }
  console.log(`  Imported ${kitCount} อุปกรณ์ประกอบวิชา items`);

  // ============================================================
  // Demo transactions for dashboard testing
  // ============================================================
  console.log("Creating demo transactions...");
  const now = new Date();
  const day = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  // Get some consumable items for demo dispense records
  const demoConsumables = await prisma.item.findMany({
    where: { category: { category: "CONSUMABLE" } },
    take: 5,
  });

  // Create lots and dispense records for dashboard
  for (const item of demoConsumables) {
    const lot = await prisma.lot.create({
      data: {
        itemId: item.id, lotNumber: `LOT-${item.code}`,
        quantity: item.totalQty,
        expiryDate: new Date(now.getTime() + (Math.random() * 365 + 30) * 24 * 60 * 60 * 1000),
        receivedDate: day(60),
      },
    });

    // Create receive record
    await prisma.receiveRecord.create({
      data: { itemId: item.id, lotId: lot.id, quantity: item.totalQty, receivedBy: admin.id, receivedAt: day(60) },
    });

    // Create some dispense records
    const dispenseCount = Math.floor(Math.random() * 3) + 1;
    for (let j = 0; j < dispenseCount; j++) {
      const qty = Math.floor(Math.random() * 10) + 1;
      await prisma.dispenseRecord.create({
        data: {
          itemId: item.id, lotId: lot.id,
          quantity: qty, quantitySub: 0,
          usageType: ["COURSE", "ACTIVITY", "OTHER"][j % 3] as any,
          staffId: staff.id, dispensedAt: day(j * 3 + 1),
        },
      });
    }
  }

  // Create a near-expiry lot for alert testing
  const nearExpiryItem = demoConsumables[0];
  if (nearExpiryItem) {
    await prisma.lot.create({
      data: {
        itemId: nearExpiryItem.id, lotNumber: `LOT-EXPIRE`,
        quantity: 5,
        expiryDate: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000), // 15 days
        receivedDate: day(120),
      },
    });
  }

  // Create a low-stock item
  const lowStockItem = await prisma.item.findFirst({
    where: { category: { category: "CONSUMABLE" }, totalQty: { gt: 0 } },
    orderBy: { totalQty: "asc" },
  });
  if (lowStockItem) {
    await prisma.item.update({
      where: { id: lowStockItem.id },
      data: { minThreshold: lowStockItem.totalQty + 10 },
    });
  }

  // Stats
  const totalItems = await prisma.item.count();
  const totalSubItems = await prisma.subItem.count();
  const totalCategories = await prisma.categoryType.count();
  const totalLocations = await prisma.location.count();
  const totalDispenses = await prisma.dispenseRecord.count();

  console.log("\nSeed completed!");
  console.log({
    users: 3,
    categories: totalCategories,
    locations: totalLocations,
    items: totalItems,
    subItems: totalSubItems,
    dispenses: totalDispenses,
  });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
