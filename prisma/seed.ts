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

// Map Thai condition → ItemCondition enum
function mapCondition(th: string): string {
  const t = (th || "").trim();
  if (t === "ใหม่" || t === "ปกติ") return "NEW";
  if (t === "ปานกลาง") return "FAIR";
  if (t === "เก่า") return "OLD";
  if (t === "ใช้งานได้") return "USABLE";
  if (t === "ใช้งานไม่ได้") return "UNUSABLE";
  if (t === "ชำรุด") return "DAMAGED";
  return "USABLE";
}

// Map Thai condition → ItemStatus enum
function mapStatus(th: string): string {
  const t = (th || "").trim();
  if (t === "ชำรุด" || t === "ใช้งานไม่ได้") return "DAMAGED";
  if (t === "ส่งซ่อม") return "UNDER_REPAIR";
  if (t === "สูญหาย") return "LOST";
  if (t === "แทงจำหน่าย") return "DISPOSED";
  return "AVAILABLE";
}

// Parse "อาคาร 2 ชั้น 5" → { building, floor }
function parseBuildingFloor(raw: string): { building: string; floor: string } {
  const t = (raw || "").trim();
  const bMatch = t.match(/อาคาร\s*\d+/);
  const fMatch = t.match(/ชั้น\s*\d+/);
  return {
    building: bMatch ? bMatch[0] : "อาคาร 2",
    floor: fMatch ? fMatch[0] : "ชั้น 4",
  };
}

function parsePrice(raw: string): number | null {
  if (!raw || !raw.trim()) return null;
  const cleaned = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// Extract NLU code prefix for grouping
// "NLU-KRU-001-001" → "NLU-KRU-001"
// "NLU-BOOK-001-001-S02-C01" → "NLU-BOOK-001-001"
// "NLU-TOY-014-061-S02-C01" → "NLU-TOY-014-061"
function extractItemCode(fullCode: string, prefix: string): string {
  // For KRU/ELE: NLU-PREFIX-NNN-NNN → base = NLU-PREFIX-NNN
  if (prefix === "KRU" || prefix === "ELE") {
    const match = fullCode.match(/^(NLU-[A-Z]+-\d{3})-\d{3}/);
    return match ? match[1] : fullCode;
  }
  // For BOOK/TOY: strip -S## and -C## suffixes to get base
  return fullCode.replace(/-S\d+-C\d+$/, "").replace(/-C\d+$/, "");
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  // Clean all tables (order matters for FK)
  const stripTrailingNum = (s: string) => s.replace(/\s*\(\d+\)\s*$/, "");
  await prisma.itemStatusLog.deleteMany();
  await prisma.maintenanceRecord.deleteMany();
  await prisma.stockAdjustment.deleteMany();
  await prisma.dispenseRecord.deleteMany();
  await prisma.receiveRecord.deleteMany();
  await prisma.lot.deleteMany();
  await prisma.subItem.deleteMany();
  await prisma.kitComponent.deleteMany();
  await prisma.item.deleteMany();
  await prisma.location.deleteMany();
  await prisma.categoryType.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.user.deleteMany();

  // ============================================================
  // Users
  // ============================================================
  const admin = await prisma.user.create({ data: { email: "admin@nlu.ac.th", name: "Admin User", role: "ADMIN" } });
  await prisma.user.create({ data: { email: "staff@nlu.ac.th", name: "Staff User", role: "STAFF" } });
  await prisma.user.create({ data: { email: "instructor@nlu.ac.th", name: "Instructor User", role: "INSTRUCTOR" } });

  // ============================================================
  // Units — collect unique units from CSVs + ชีต8
  // ============================================================
  const unitNames = [
    "กล่อง", "ถุง", "ชิ้น", "set", "ชุด", "ห่อ", "เครื่อง", "อัน", "แผง",
    "กระปุก", "กรัม", "เม็ด", "ซีซี", "ใบ", "แผ่น", "เส้น", "ขวด", "คู่",
    "เล่ม", "ม้วน", "ตัว", "ผืน", "ก้อน", "หลอด", "ท่อน", "มิลลิลิตร", "ขวดใหญ่",
  ];
  const unitMap = new Map<string, string>();
  for (const name of unitNames) {
    const u = await prisma.unit.create({ data: { name } });
    unitMap.set(name, u.id);
  }
  const unitId = (name: string) => unitMap.get(name) || unitMap.get("ชิ้น")!;

  function parseUnit(raw: string): string {
    const t = (raw || "").trim().split("/")[0].split("(")[0].trim().toLowerCase();
    // normalize
    if (["อัน", "ตัว", "ใบ", "ชิ้น"].includes(t)) return "ชิ้น";
    if (t === "set") return "set";
    if (t === "ชุด") return "ชุด";
    return unitMap.get(t) ? t : "ชิ้น";
  }

  // ============================================================
  // CategoryTypes — 8 categories, 1:1 with enum
  // ============================================================
  const catKru = await prisma.categoryType.create({ data: { name: "ครุภัณฑ์", category: "KRU", sortOrder: 1 } });
  const catEle = await prisma.categoryType.create({ data: { name: "อุปกรณ์อิเล็กทรอนิกส์", category: "ELE", sortOrder: 2 } });
  const catBook = await prisma.categoryType.create({ data: { name: "หนังสือ", category: "BOOK", sortOrder: 3 } });
  const catToy = await prisma.categoryType.create({ data: { name: "ของเล่น", category: "TOY", sortOrder: 4 } });
  const catDur = await prisma.categoryType.create({ data: { name: "วัสดุคงทน", category: "DUR", sortOrder: 5 } });
  const catCon = await prisma.categoryType.create({ data: { name: "วัสดุสิ้นเปลือง", category: "CON", sortOrder: 6 } });
  const catMed = await prisma.categoryType.create({ data: { name: "ยา", category: "MED", sortOrder: 7 } });
  const catKit = await prisma.categoryType.create({ data: { name: "อุปกรณ์ประกอบวิชา", category: "KIT", sortOrder: 8 } });

  // ============================================================
  // Locations — from CSV data
  // ============================================================
  const locCache = new Map<string, string>();

  async function getOrCreateLocation(building: string, floor: string, room: string, detail?: string | null) {
    const key = `${building}|${floor}|${room}|${detail || ""}`;
    if (locCache.has(key)) return locCache.get(key)!;
    const loc = await prisma.location.create({ data: { building, floor, room, detail: detail || null } });
    locCache.set(key, loc.id);
    return loc.id;
  }

  const defaultLocId = await getOrCreateLocation("อาคาร 2", "ชั้น 4", "402");

  // ============================================================
  // Helper: parse name "ถาด (Tray)" → { name, nameEn }
  // ============================================================
  function parseName(raw: string): { name: string; nameEn: string | null } {
    const m = raw.match(/^(.+?)\s*\((.+?)\)\s*$/);
    return m ? { name: m[1].trim(), nameEn: m[2].trim() } : { name: raw.trim(), nameEn: null };
  }

  // ============================================================
  // 1. Import ครุภัณฑ์ (KRU) — trackIndividually=true, grouped
  // ============================================================
  console.log("Importing ครุภัณฑ์ (KRU)...");
  const kruRows = readCsv("ข้อมูลทรัพย์สิน NLU - ครุภัณฑ์.csv");
  // Headers: row[0]=title, row[1]=header
  // Data cols: 0=ลำดับ, 1=รหัส NLU, 2=(empty), 3=หมายเลขครุภัณฑ์, 4=ชื่อไทย, 5=ชื่ออังกฤษ, 6=ประเภท, 7=ยี่ห้อ, 8=อาคาร/ชั้น, 9=ห้อง, 10=สภาพ, 11=วันรับ, 12=การรับประกัน, 13=บริษัท, 14=ตัวแทน, 15=เบอร์, 16=แหล่งที่มา, 17=ราคา, 18=หมายเหตุ

  // Group by base code: NLU-KRU-001 → all SubItems
  const kruGroups = new Map<string, {
    nluCode: string;
    nameTh: string; nameEn: string;
    subCategory: string;
    subItems: {
      nluCode: string; serialNo: string; condition: string;
      brandModel: string; buildingFloor: string; room: string;
      company: string; contact: string; phone: string; priceStr: string;
      warrantyStr: string; notes: string;
    }[];
  }>();

  for (let i = 2; i < kruRows.length; i++) {
    const row = kruRows[i];
    if (!row || row.length < 11) continue;
    const nameTh = (row[4] || "").trim();
    const nluCode = (row[1] || "").trim();
    if (!nameTh || !nluCode) continue;

    const baseCode = extractItemCode(nluCode, "KRU");
    if (!kruGroups.has(baseCode)) {
      kruGroups.set(baseCode, {
        nluCode: baseCode, nameTh, nameEn: (row[5] || "").trim(),
        subCategory: (row[6] || "").trim(),
        subItems: [],
      });
    }
    kruGroups.get(baseCode)!.subItems.push({
      nluCode,
      serialNo: (row[3] || "").trim(),
      condition: (row[10] || "").trim(),
      brandModel: (row[7] || "").trim(),
      buildingFloor: (row[8] || "").trim(),
      room: (row[9] || "").trim(),
      company: (row[13] || "").trim(),
      contact: (row[14] || "").trim(),
      phone: (row[15] || "").trim(),
      priceStr: (row[17] || "").trim(),
      warrantyStr: (row[12] || "").trim(),
      notes: (row[18] || "").trim(),
    });
  }

  let kruItemCount = 0, kruSubCount = 0;
  for (const [, group] of kruGroups) {
    const first = group.subItems[0];
    const { building, floor } = parseBuildingFloor(first.buildingFloor);
    const locId = first.room ? await getOrCreateLocation(building, floor, first.room) : defaultLocId;

    const model = group.subItems.find(r => r.brandModel)?.brandModel || null;
    const price = group.subItems.reduce<number | null>((best, r) => best ?? parsePrice(r.priceStr), null);
    const vendorCompany = group.subItems.find(r => r.company)?.company || null;
    const vendorContact = group.subItems.find(r => r.contact)?.contact || null;
    const vendorPhone = group.subItems.find(r => r.phone)?.phone || null;
    const warrantyMatch = group.subItems.find(r => r.warrantyStr)?.warrantyStr?.match(/(\d+)/);
    const warrantyMonths = warrantyMatch ? parseInt(warrantyMatch[1]) * 12 : 0;
    const availableCount = group.subItems.filter(r => mapStatus(r.condition) === "AVAILABLE").length;

    const item = await prisma.item.create({
      data: {
        code: group.nluCode,
        name: stripTrailingNum(group.nameTh),
        nameEn: group.nameEn || null,
        categoryId: catKru.id,
        trackIndividually: true,
        issueUnitId: unitId("เครื่อง"), subUnitId: unitId("เครื่อง"), conversionFactor: 1,
        minThreshold: 1, locationId: locId,
        totalQty: group.subItems.length, availableQty: availableCount,
        model, purchasePrice: price,
        vendorCompany, vendorContact, vendorPhone,
        warrantyMonths, description: group.subCategory || null,
      },
    });

    for (let si = 0; si < group.subItems.length; si++) {
      const sub = group.subItems[si];
      await prisma.subItem.create({
        data: {
          itemId: item.id,
          subCode: sub.nluCode,
          name: group.subItems.length > 1 ? `${stripTrailingNum(group.nameTh)} (${si + 1})` : group.nameTh,
          status: mapStatus(sub.condition) as any,
          condition: mapCondition(sub.condition) as any,
          serialNumber: sub.serialNo && sub.serialNo !== "N/A" && sub.serialNo !== "รอเลขจากพัสดุ" ? sub.serialNo : null,
          notes: sub.notes || null,
        },
      });
      kruSubCount++;
    }
    kruItemCount++;
  }
  console.log(`  ${kruItemCount} items, ${kruSubCount} sub-items`);

  // ============================================================
  // 2. Import อุปกรณ์อิเล็กทรอนิกส์ (ELE) — trackIndividually=true, grouped
  // ============================================================
  console.log("Importing อุปกรณ์อิเล็กทรอนิกส์ (ELE)...");
  const eleRows = readCsv("ข้อมูลทรัพย์สิน NLU - วัสดุอุปกรณ์อิเล็กทรอนิกส์.csv");
  // Headers: row[0]=title, row[1]=header
  // Data cols: 0=ลำดับ, 1=รหัส NLU, 2=รหัสเก่า, 3=หมายเลขครุภัณฑ์, 4=รายการ, 5=ประเภท, 6=ยี่ห้อ, 7=รุ่น, 8=Serial No, 9=รูป, 10=อาคาร/ชั้น, 11=ห้อง, 12=สภาพ, 13=วันรับ, 14=การรับประกัน, 15=บริษัท, 16=ตัวแทน, 17=เบอร์, 18=แหล่งที่มา, 19=ราคา, 20=หมายเหตุ

  const eleGroups = new Map<string, {
    nluCode: string; nameTh: string; subCategory: string;
    subItems: {
      nluCode: string; serialNo: string; condition: string;
      brandModel: string; modelDetail: string; buildingFloor: string; room: string;
      company: string; contact: string; phone: string; priceStr: string;
      warrantyStr: string; notes: string;
    }[];
  }>();

  for (let i = 2; i < eleRows.length; i++) {
    const row = eleRows[i];
    if (!row || row.length < 13) continue;
    const nameTh = (row[4] || "").trim();
    const nluCode = (row[1] || "").trim();
    if (!nameTh || !nluCode) continue;

    const baseCode = extractItemCode(nluCode, "ELE");
    if (!eleGroups.has(baseCode)) {
      eleGroups.set(baseCode, {
        nluCode: baseCode, nameTh, subCategory: (row[5] || "").trim(),
        subItems: [],
      });
    }
    eleGroups.get(baseCode)!.subItems.push({
      nluCode,
      serialNo: (row[8] || "").trim(),
      condition: (row[12] || "").trim(),
      brandModel: (row[6] || "").trim(),
      modelDetail: (row[7] || "").trim(),
      buildingFloor: (row[10] || "").trim(),
      room: (row[11] || "").trim(),
      company: (row[15] || "").trim(),
      contact: (row[16] || "").trim(),
      phone: (row[17] || "").trim(),
      priceStr: (row[19] || "").trim(),
      warrantyStr: (row[14] || "").trim(),
      notes: (row[20] || "").trim(),
    });
  }

  let eleItemCount = 0, eleSubCount = 0;
  for (const [, group] of eleGroups) {
    const first = group.subItems[0];
    const { building, floor } = parseBuildingFloor(first.buildingFloor);
    const locId = first.room ? await getOrCreateLocation(building, floor, first.room) : defaultLocId;

    const model = [group.subItems.find(r => r.brandModel)?.brandModel, group.subItems.find(r => r.modelDetail)?.modelDetail].filter(Boolean).join(" ") || null;
    const price = group.subItems.reduce<number | null>((best, r) => best ?? parsePrice(r.priceStr), null);
    const vendorCompany = group.subItems.find(r => r.company)?.company || null;
    const vendorContact = group.subItems.find(r => r.contact)?.contact || null;
    const vendorPhone = group.subItems.find(r => r.phone)?.phone || null;
    const warrantyMatch = group.subItems.find(r => r.warrantyStr)?.warrantyStr?.match(/(\d+)/);
    const warrantyMonths = warrantyMatch ? parseInt(warrantyMatch[1]) * 12 : 0;
    const availableCount = group.subItems.filter(r => mapStatus(r.condition) === "AVAILABLE").length;

    const item = await prisma.item.create({
      data: {
        code: group.nluCode,
        name: stripTrailingNum(group.nameTh),
        categoryId: catEle.id,
        trackIndividually: true,
        issueUnitId: unitId("เครื่อง"), subUnitId: unitId("เครื่อง"), conversionFactor: 1,
        minThreshold: 1, locationId: locId,
        totalQty: group.subItems.length, availableQty: availableCount,
        model, purchasePrice: price,
        vendorCompany, vendorContact, vendorPhone,
        warrantyMonths, description: group.subCategory || null,
      },
    });

    for (let si = 0; si < group.subItems.length; si++) {
      const sub = group.subItems[si];
      await prisma.subItem.create({
        data: {
          itemId: item.id,
          subCode: sub.nluCode,
          name: group.subItems.length > 1 ? `${stripTrailingNum(group.nameTh)} (${si + 1})` : group.nameTh,
          status: mapStatus(sub.condition) as any,
          condition: mapCondition(sub.condition) as any,
          serialNumber: sub.serialNo && sub.serialNo !== "N/A" ? sub.serialNo : null,
          notes: sub.notes || null,
        },
      });
      eleSubCount++;
    }
    eleItemCount++;
  }
  console.log(`  ${eleItemCount} items, ${eleSubCount} sub-items`);

  // ============================================================
  // 3. Import หนังสือ (BOOK) — trackIndividually=true, grouped by base code
  // ============================================================
  console.log("Importing หนังสือ (BOOK)...");
  const bookRows = readCsv("ข้อมูลทรัพย์สิน NLU - หนังสือ.csv");
  // Headers: row[0]=title, row[1]=header, row[2]=(blank spacer)
  // Data cols: 0=ลำดับ, 1=รหัส, 2=เลขรหัสเก่า, 3=หมวด, 4=ชื่อหนังสือ, 5=ประจำที่, 6=รูป, 7=คำชี้แจง, 8=หมายเหตุ

  const bookGroups = new Map<string, { bookName: string; room: string; category: string; codes: string[] }>();
  for (let i = 3; i < bookRows.length; i++) {
    const row = bookRows[i];
    if (!row || row.length < 5) continue;
    const code = (row[1] || "").trim();
    const bookName = (row[4] || "").trim();
    const room = (row[5] || "").trim();
    const category = (row[3] || "").trim();
    if (!bookName || !code) continue;

    const baseCode = extractItemCode(code, "BOOK");
    if (!bookGroups.has(baseCode)) {
      bookGroups.set(baseCode, { bookName, room, category, codes: [] });
    }
    bookGroups.get(baseCode)!.codes.push(code);
  }

  let bookItemCount = 0, bookSubCount = 0;
  for (const [, group] of bookGroups) {
    const locId = group.room ? await getOrCreateLocation("อาคาร 2", "ชั้น 4", group.room) : defaultLocId;
    const qty = group.codes.length;

    const item = await prisma.item.create({
      data: {
        code: `NLU-BOOK-${String(bookItemCount + 1).padStart(3, "0")}`,
        name: stripTrailingNum(group.bookName),
        categoryId: catBook.id,
        trackIndividually: true,
        issueUnitId: unitId("เล่ม"), subUnitId: unitId("เล่ม"), conversionFactor: 1,
        minThreshold: 0, locationId: locId,
        totalQty: qty, availableQty: qty,
        description: group.category || null,
      },
    });

    for (let ci = 0; ci < group.codes.length; ci++) {
      await prisma.subItem.create({
        data: {
          itemId: item.id,
          subCode: group.codes[ci],
          name: group.codes.length > 1 ? `${stripTrailingNum(group.bookName)} (${ci + 1})` : group.bookName,
          status: "AVAILABLE",
          condition: "NEW",
        },
      });
      bookSubCount++;
    }
    bookItemCount++;
  }
  console.log(`  ${bookItemCount} items, ${bookSubCount} sub-items`);

  // ============================================================
  // 4. Import ของเล่น (TOY) — trackIndividually=true, grouped by base code
  // ============================================================
  console.log("Importing ของเล่น (TOY)...");
  const toyRows = readCsv("ข้อมูลทรัพย์สิน NLU - ของเล่น.csv");
  // Headers: row[0]=title, row[1]=header, row[2]=(blank spacer)
  // Data cols: 0=ลำดับ, 1=รหัสใหม่, 2=เลขรหัส, 3=หมวด, 4=รายการ, 5=ประจำที่, 6=รูป, 7=คำชี้แจง, 8=หมายเหตุ

  const toyGroups = new Map<string, { toyName: string; room: string; category: string; codes: string[] }>();
  for (let i = 3; i < toyRows.length; i++) {
    const row = toyRows[i];
    if (!row || row.length < 5) continue;
    const code = (row[1] || "").trim();
    const toyName = (row[4] || "").trim();
    const room = (row[5] || "").trim();
    const category = (row[3] || "").trim();
    if (!toyName || !code) continue;

    const baseCode = extractItemCode(code, "TOY");
    if (!toyGroups.has(baseCode)) {
      toyGroups.set(baseCode, { toyName, room, category, codes: [] });
    }
    toyGroups.get(baseCode)!.codes.push(code);
  }

  let toyItemCount = 0, toySubCount = 0;
  for (const [, group] of toyGroups) {
    const locId = group.room ? await getOrCreateLocation("อาคาร 2", "ชั้น 4", group.room) : defaultLocId;
    const qty = group.codes.length;

    const item = await prisma.item.create({
      data: {
        code: `NLU-TOY-${String(toyItemCount + 1).padStart(3, "0")}`,
        name: stripTrailingNum(group.toyName),
        categoryId: catToy.id,
        trackIndividually: true,
        issueUnitId: unitId("ชิ้น"), subUnitId: unitId("ชิ้น"), conversionFactor: 1,
        minThreshold: 0, locationId: locId,
        totalQty: qty, availableQty: qty,
        description: group.category || null,
      },
    });

    for (let ci = 0; ci < group.codes.length; ci++) {
      await prisma.subItem.create({
        data: {
          itemId: item.id,
          subCode: group.codes[ci],
          name: group.codes.length > 1 ? `${stripTrailingNum(group.toyName)} (${ci + 1})` : group.toyName,
          status: "AVAILABLE",
          condition: "NEW",
        },
      });
      toySubCount++;
    }
    toyItemCount++;
  }
  console.log(`  ${toyItemCount} items, ${toySubCount} sub-items`);

  // ============================================================
  // 5. Import บัญชีวัสดุคงทน (DUR) — trackIndividually=false, flat
  // ============================================================
  console.log("Importing บัญชีวัสดุคงทน (DUR)...");
  const durRows = readCsv("ข้อมูลทรัพย์สิน NLU - บัญชีวัสดุคงทน.csv");
  let durCount = 0;
  for (let i = 2; i < durRows.length; i++) {
    const row = durRows[i];
    if (!row || row.length < 5) continue;
    const nameRaw = (row[2] || "").trim();
    const qtyStr = (row[3] || "").trim();
    const unitRaw = (row[4] || "").trim();
    const priceStr = (row[5] || "").trim();
    const dateStr = (row[6] || "").trim();
    const notes = (row[7] || "").trim();
    if (!nameRaw) continue;

    const { name, nameEn } = parseName(nameRaw);
    const qty = parseInt(qtyStr) || 0;
    const unitName = parseUnit(unitRaw);
    const code = (row[1] || "").trim() || `NLU-DUR-${String(durCount + 1).padStart(3, "0")}`;

    await prisma.item.create({
      data: {
        code, name, nameEn,
        categoryId: catDur.id,
        trackIndividually: false,
        issueUnitId: unitId(unitName), subUnitId: unitId(unitName), conversionFactor: 1,
        minThreshold: 0, locationId: defaultLocId,
        totalQty: qty, availableQty: qty,
        purchasePrice: parsePrice(priceStr),
        description: notes || null,
      },
    });
    durCount++;
  }
  console.log(`  ${durCount} items`);

  // ============================================================
  // 6. Import วัสดุสิ้นเปลือง (CON) — trackIndividually=false, flat with stock from last period
  // ============================================================
  console.log("Importing วัสดุสิ้นเปลือง (CON)...");
  const conRows = readCsv("ข้อมูลทรัพย์สิน NLU - วัสดุสิ้นเปลือง.csv");
  let conCount = 0;
  for (let i = 3; i < conRows.length; i++) {
    const row = conRows[i];
    if (!row || row.length < 4) continue;
    const code = (row[1] || "").trim();
    const nameRaw = (row[2] || "").trim();
    const room = (row[3] || "").trim();
    if (!nameRaw || !code) continue;

    // Stock = last คงเหลือ column (col 22 = มี.ค.-69)
    // Fallback chain: col 22 → col 16 → col 10 → col 4
    const qty = parseInt((row[22] || "").trim()) || parseInt((row[16] || "").trim()) || parseInt((row[10] || "").trim()) || parseInt((row[4] || "").trim()) || 0;
    const unitRaw = (row[5] || row[23] || "").trim();
    const unitName = parseUnit(unitRaw);

    const locId = room ? await getOrCreateLocation("อาคาร 2", "ชั้น 5", String(room)) : defaultLocId;

    await prisma.item.create({
      data: {
        code, name: nameRaw,
        categoryId: catCon.id,
        trackIndividually: false,
        issueUnitId: unitId(unitName), subUnitId: unitId(unitName), conversionFactor: 1,
        minThreshold: 0, locationId: locId,
        totalQty: qty, availableQty: qty,
      },
    });
    conCount++;
  }
  console.log(`  ${conCount} items`);

  // ============================================================
  // 7. Import อุปกรณ์นักศึกษายืมประกอบวิชา (KIT) — with KitComponent
  // ============================================================
  console.log("Importing อุปกรณ์ประกอบวิชา (KIT)...");
  const kitRows = readCsv("ข้อมูลทรัพย์สิน NLU - อุปกรณ์นักศึกษายืมประกอบวิชา.csv");
  // Nested structure: parent rows have col[0]=number, sub-rows have col[0]=""
  // Parent: 0=ลำดับ, 1=รายการ, 2=จำนวน, 3=หน่วย, 4=หมายเหตุ
  // Sub:    0="", 1="", 2="", 3="", 4=ลำดับ, 5=ชื่อ, 6=จำนวน, 7=หน่วย, 8=หมายเหตุ

  let kitCount = 0;
  let currentKitId: string | null = null;

  for (let i = 2; i < kitRows.length; i++) {
    const row = kitRows[i];
    if (!row || row.length < 2) continue;
    const seq = (row[0] || "").trim();

    if (seq) {
      // Parent row
      const nameRaw = (row[1] || "").trim();
      const qtyStr = (row[2] || "").trim();
      const unitRaw = (row[3] || "").trim();
      const notes = (row[8] || row[4] || "").trim();
      if (!nameRaw) continue;

      const qty = parseInt(qtyStr) || 1;
      const unitName = parseUnit(unitRaw);
      const code = `NLU-KIT-${String(kitCount + 1).padStart(3, "0")}`;

      const item = await prisma.item.create({
        data: {
          code, name: nameRaw,
          categoryId: catKit.id,
          trackIndividually: false,
          issueUnitId: unitId(unitName), subUnitId: unitId(unitName), conversionFactor: 1,
          minThreshold: 0, locationId: defaultLocId,
          totalQty: qty, availableQty: qty,
          description: notes || null,
        },
      });
      currentKitId = item.id;
      kitCount++;
    } else if (currentKitId) {
      // Sub-item row (component)
      const compName = (row[5] || "").trim();
      const compQty = parseInt((row[6] || "").trim()) || 1;
      const compUnit = (row[7] || "").trim() || "ชิ้น";
      if (!compName) continue;

      // Check if this component name matches an existing stock item
      const matchingItem = await prisma.item.findFirst({
        where: { name: { contains: compName }, isActive: true },
      });

      await prisma.kitComponent.create({
        data: {
          kitId: currentKitId,
          itemId: matchingItem?.id || null,
          name: compName,
          quantity: compQty,
          unit: compUnit,
          isStockItem: !!matchingItem,
        },
      });
    }
  }
  console.log(`  ${kitCount} kit items with components`);

  // ============================================================
  // Demo data for dashboard
  // ============================================================
  console.log("Creating demo transactions...");
  const now = new Date();
  const day = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  const demoConsumables = await prisma.item.findMany({
    where: { category: { category: "CON" } },
    take: 5,
  });

  for (const item of demoConsumables) {
    const lot = await prisma.lot.create({
      data: {
        itemId: item.id, lotNumber: `LOT-${item.code}`,
        quantity: item.totalQty,
        expiryDate: new Date(now.getTime() + (Math.random() * 365 + 30) * 24 * 60 * 60 * 1000),
        receivedDate: day(60),
      },
    });

    await prisma.receiveRecord.create({
      data: { itemId: item.id, lotId: lot.id, quantity: item.totalQty, receivedBy: admin.id, receivedAt: day(60) },
    });

    const dispenseCount = Math.floor(Math.random() * 3) + 1;
    for (let j = 0; j < dispenseCount; j++) {
      const qty = Math.floor(Math.random() * 10) + 1;
      await prisma.dispenseRecord.create({
        data: {
          itemId: item.id, lotId: lot.id,
          quantity: qty, quantitySub: 0,
          usageType: ["COURSE", "ACTIVITY", "OTHER"][j % 3] as any,
          staffId: admin.id, dispensedAt: day(j * 3 + 1),
        },
      });
    }
  }

  // ============================================================
  // Rich mock dispense data for this month (dashboard charts)
  // ============================================================
  console.log("Creating rich mock dispense data for dashboard charts...");

  const allItems = await prisma.item.findMany({
    select: { id: true, code: true, name: true, category: true },
    take: 30,
  });

  // Pick up to 10 items to be "top dispensed" with varied quantities
  const topItems = allItems.slice(0, Math.min(10, allItems.length));
  const usageTypes = ["COURSE", "ACTIVITY", "OTHER"] as const;

  const mockDispenses: Array<{ itemId: string; qty: number; usageType: typeof usageTypes[number]; daysAgo: number }> = [
    { itemId: topItems[0]?.id, qty: 42, usageType: "COURSE",   daysAgo: 1 },
    { itemId: topItems[0]?.id, qty: 18, usageType: "ACTIVITY", daysAgo: 3 },
    { itemId: topItems[1]?.id, qty: 35, usageType: "COURSE",   daysAgo: 2 },
    { itemId: topItems[1]?.id, qty: 10, usageType: "OTHER",    daysAgo: 4 },
    { itemId: topItems[2]?.id, qty: 28, usageType: "ACTIVITY", daysAgo: 1 },
    { itemId: topItems[3]?.id, qty: 25, usageType: "COURSE",   daysAgo: 2 },
    { itemId: topItems[3]?.id, qty: 8,  usageType: "OTHER",    daysAgo: 5 },
    { itemId: topItems[4]?.id, qty: 22, usageType: "COURSE",   daysAgo: 3 },
    { itemId: topItems[5]?.id, qty: 19, usageType: "ACTIVITY", daysAgo: 1 },
    { itemId: topItems[5]?.id, qty: 6,  usageType: "COURSE",   daysAgo: 4 },
    { itemId: topItems[6]?.id, qty: 16, usageType: "OTHER",    daysAgo: 2 },
    { itemId: topItems[7]?.id, qty: 14, usageType: "COURSE",   daysAgo: 3 },
    { itemId: topItems[7]?.id, qty: 9,  usageType: "ACTIVITY", daysAgo: 1 },
    { itemId: topItems[8]?.id, qty: 12, usageType: "ACTIVITY", daysAgo: 2 },
    { itemId: topItems[8]?.id, qty: 5,  usageType: "OTHER",    daysAgo: 4 },
    { itemId: topItems[9]?.id, qty: 11, usageType: "COURSE",   daysAgo: 1 },
    // Extra ACTIVITY / OTHER to make usage-by-type chart interesting
    { itemId: topItems[2]?.id, qty: 20, usageType: "ACTIVITY", daysAgo: 5 },
    { itemId: topItems[4]?.id, qty: 15, usageType: "OTHER",    daysAgo: 2 },
    { itemId: topItems[6]?.id, qty: 13, usageType: "COURSE",   daysAgo: 3 },
    { itemId: topItems[9]?.id, qty: 17, usageType: "ACTIVITY", daysAgo: 4 },
  ];

  for (const m of mockDispenses) {
    if (!m.itemId) continue;
    await prisma.dispenseRecord.create({
      data: {
        itemId: m.itemId,
        quantity: m.qty,
        quantitySub: 0,
        usageType: m.usageType,
        staffId: admin.id,
        dispensedAt: day(m.daysAgo),
      },
    });
  }
  console.log(`  ${mockDispenses.filter((m) => m.itemId).length} mock dispense records created`);

  // Near-expiry lot alert
  if (demoConsumables[0]) {
    await prisma.lot.create({
      data: {
        itemId: demoConsumables[0].id, lotNumber: "LOT-EXPIRE",
        quantity: 5,
        expiryDate: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000),
        receivedDate: day(120),
      },
    });
  }

  // Low-stock alert
  const lowStockItem = await prisma.item.findFirst({
    where: { category: { category: "CON" }, totalQty: { gt: 0 } },
    orderBy: { totalQty: "asc" },
  });
  if (lowStockItem) {
    await prisma.item.update({
      where: { id: lowStockItem.id },
      data: { minThreshold: lowStockItem.totalQty + 10 },
    });
  }

  // ============================================================
  // Stats
  // ============================================================
  const totalItems = await prisma.item.count();
  const totalSubItems = await prisma.subItem.count();
  const totalKitComps = await prisma.kitComponent.count();
  const totalCategories = await prisma.categoryType.count();
  const totalLocations = await prisma.location.count();

  console.log("\n✅ Seed completed!");
  console.log({
    users: 3,
    categories: totalCategories,
    locations: totalLocations,
    items: totalItems,
    subItems: totalSubItems,
    kitComponents: totalKitComps,
  });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
