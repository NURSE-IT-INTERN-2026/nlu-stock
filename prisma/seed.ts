import "dotenv/config";
import { randomUUID } from "crypto";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { join } from "path";
import { ItemStatus, ItemCondition, UsageType } from "../src/generated/prisma/enums";

const CSV_DIR = join(process.cwd(), "CSV");

// Deterministic PRNG (mulberry32, fixed seed) so demo data — and the e2e visual
// snapshots that read it — are byte-stable across reseeds. Replaces Math.random.
let _rngState = 0x9e3779b9;
function rng() {
  _rngState = (_rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function readCsv(filename: string) {
  const raw = readFileSync(join(CSV_DIR, filename), "utf-8");
  return parse(raw, {
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    bom: true,
  }) as string[][];
}

// ── Profile spec (synced with scripts/migrate-profiles.ts) ──
type ProfileSpec = {
  code: string; name: string; dispenseType: "CONSUMABLE" | "COUNT" | "ITEM";
  assetTracking: boolean;
  icon: string; color: string;
};
const PROFILE_SPEC: ProfileSpec[] = [
  { code: "CON", name: "วัสดุสิ้นเปลือง", dispenseType: "CONSUMABLE", assetTracking: false, icon: "Package", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  { code: "KIT", name: "อุปกรณ์ประกอบวิชา", dispenseType: "ITEM", assetTracking: false, icon: "Beaker", color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200" },
  { code: "DUR", name: "วัสดุคงทน", dispenseType: "COUNT", assetTracking: false, icon: "Hammer", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  { code: "KRU", name: "ครุภัณฑ์", dispenseType: "ITEM", assetTracking: true, icon: "Building2", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  { code: "BAT", name: "หนังสือและของเล่น", dispenseType: "ITEM", assetTracking: false, icon: "BookOpen", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
];

// Legacy enum codes that CSV imports still reference → map to current profile codes.
const PROFILE_ALIASES: Record<string, string> = { ELE: "KRU", BOOK: "BAT", TOY: "BAT" };

// Map Thai condition → ItemCondition enum. The source sheets still carry the six older
// words (ใหม่/เก่า/ใช้งานได้/…) — they fold into the three the app now shows.
function mapCondition(th: string): ItemCondition {
  const t = (th || "").trim();
  if (t === "ใหม่" || t === "ปกติ" || t === "ดี" || t === "ใช้งานได้") return "GOOD";
  if (t === "ปานกลาง" || t === "เก่า") return "FAIR";
  if (t === "ใช้งานไม่ได้" || t === "ชำรุด") return "DAMAGED";
  return "GOOD";
}

// A piece that arrives already lost/damaged still needs an audit trail: ประวัติสูญหาย and
// the status history read ItemStatusLog, not SubItem.status, so a status set straight on
// create is invisible there. Seed one opening entry per non-AVAILABLE starting status.
async function logInitialStatus(
  db: (typeof import("../src/lib/prisma"))["prisma"],
  sub: { id: string; itemId: string; status: ItemStatus },
  adminId: string,
) {
  if (sub.status === "AVAILABLE") return;
  await db.itemStatusLog.create({
    data: {
      itemId: sub.itemId,
      subItemId: sub.id,
      previousStatus: ItemStatus.AVAILABLE,
      newStatus: sub.status,
      reason: "สถานะเริ่มต้นจากข้อมูลนำเข้า",
      changedBy: adminId,
    },
  });
}

// Map Thai condition → ItemStatus enum
function mapStatus(th: string): ItemStatus {
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

// Uniform code generator (ADR-0001): NLU-{PREFIX}-{NNN}[-S{NN}].
// Per-prefix running counter.
const prefixCounters: Record<string, number> = {};
function nextCode(prefix: string): string {
  const p = PROFILE_ALIASES[prefix] ?? prefix;
  prefixCounters[p] = (prefixCounters[p] ?? 0) + 1;
  const nnn = String(prefixCounters[p]).padStart(3, "0");
  return `NLU-${p}-${nnn}`;
}

// Extract set size from an old-format code (NLU-BOOK-013-001-S06 → 6), else 1.
// Extract NLU code prefix for grouping
// "NLU-KRU-001-001" → "NLU-KRU-001"
// "NLU-BOOK-001-001-S02-C01" → "NLU-BOOK-001-001-S02" (keep set, strip copy)
// "NLU-BOOK-005-008-S03" → "NLU-BOOK-005-008-S03" (keep set)
function extractItemCode(fullCode: string, prefix: string): string {
  // For KRU/ELE: NLU-PREFIX-NNN-NNN → base = NLU-PREFIX-NNN
  if (prefix === "KRU" || prefix === "ELE") {
    const match = fullCode.match(/^(NLU-[A-Z]+-\d{3})-\d{3}/);
    return match ? match[1] : fullCode;
  }
  // For BOOK/TOY: strip only -C## (copy) suffix, keep -S## (set)
  return fullCode.replace(/-C\d+$/, "");
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  // Clean all tables (order matters for FK)
  const stripTrailingNum = (s: string) => s.replace(/\s*\(\d+\)\s*$/, "");
  // ประวัติการแนบ/ลบหลักฐาน อ้าง User และไม่มีใครลบให้ — ตกหล่นไป reseed จะตายที่ user.deleteMany()
  await prisma.attachmentLog.deleteMany();
  await prisma.itemStatusLog.deleteMany();
  await prisma.locationChangeLog.deleteMany();
  await prisma.maintenanceRecord.deleteMany();
  await prisma.stockAdjustment.deleteMany();
  await prisma.returnRecord.deleteMany();
  await prisma.dispenseRecord.deleteMany();
  await prisma.dispenseTemplateLine.deleteMany();
  await prisma.dispenseTemplate.deleteMany();
  await prisma.course.deleteMany();
  await prisma.kitBom.deleteMany();
  await prisma.receiveRecord.deleteMany();
  await prisma.lot.deleteMany();
  await prisma.subItem.deleteMany();
  await prisma.item.deleteMany();
  await prisma.location.deleteMany();
  await prisma.categoryType.deleteMany();
  await prisma.categoryProfile.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.user.deleteMany();

  // ============================================================
  // Users
  // ============================================================
  // Roles are not stored here — these emails must appear in the matching
  // *_EMAILS env list (see .env.example) or they cannot sign in.
  const admin = await prisma.user.create({ data: { email: "superadmin@nlu.ac.th", name: "Super Admin" } });
  await prisma.user.create({ data: { email: "admin@nlu.ac.th", name: "Admin User" } });
  await prisma.user.create({ data: { email: "executive@nlu.ac.th", name: "Executive User" } });
  // นศ. ตัวอย่างของปุ่มลัด "ผู้ยืม (นศ.)" บนหน้า login. isBorrower คือสิ่งที่การล็อกอินประทับไว้
  // ตอน claims บอกว่าเป็นคนในคณะ — เขียนตรงเข้า DB โดยไม่ใส่ = แถวที่ล็อกอินได้จริงแต่ /settings
  // อ่านว่า "เข้าระบบไม่ได้"
  await prisma.user.create({
    data: { email: "student@cmu.ac.th", name: "student", isBorrower: true },
  });

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
  // CategoryProfiles (ประเภท) + CategoryTypes (หมวด)
  // ============================================================
  const profileByCode: Record<string, string> = {};
  for (let i = 0; i < PROFILE_SPEC.length; i++) {
    const spec = PROFILE_SPEC[i];
    const p = await prisma.categoryProfile.create({ data: { ...spec, sortOrder: i } });
    profileByCode[spec.code] = p.id;
  }

  const catKru = await prisma.categoryType.create({ data: { name: "ครุภัณฑ์", profileId: profileByCode.KRU, sortOrder: 1 } });
  const catEle = await prisma.categoryType.create({ data: { name: "อุปกรณ์อิเล็กทรอนิกส์", profileId: profileByCode.KRU, sortOrder: 2 } });
  const catBook = await prisma.categoryType.create({ data: { name: "หนังสือ", profileId: profileByCode.BAT, sortOrder: 3 } });
  const catToy = await prisma.categoryType.create({ data: { name: "ของเล่น", profileId: profileByCode.BAT, sortOrder: 4 } });
  const catDur = await prisma.categoryType.create({ data: { name: "วัสดุคงทน", profileId: profileByCode.DUR, sortOrder: 5 } });
  const catCon = await prisma.categoryType.create({ data: { name: "วัสดุสิ้นเปลือง", profileId: profileByCode.CON, sortOrder: 6 } });
  const catKit = await prisma.categoryType.create({ data: { name: "อุปกรณ์ประกอบวิชา", profileId: profileByCode.KIT, sortOrder: 7 } });

  // Granular หมวดย่อย. Legacy CSV codes ELE/BOOK/TOY alias to KRU/BAT (see PROFILE_ALIASES).
  const subCatCache = new Map<string, string>();
  let subSort = 100;
  async function ensureSubCategory(profileCode: string, name: string): Promise<string> {
    const resolved = PROFILE_ALIASES[profileCode] ?? profileCode;
    const key = `${resolved}|${name}`;
    const cached = subCatCache.get(key);
    if (cached) return cached;
    const profileId = profileByCode[resolved];
    if (!profileId) throw new Error(`No profile for code ${resolved}`);
    const row = await prisma.categoryType.create({
      data: { name, profileId, sortOrder: subSort++ },
    });
    subCatCache.set(key, row.id);
    return row.id;
  }

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
        code: nextCode("KRU"),
        name: stripTrailingNum(group.nameTh),
        nameEn: group.nameEn || null,
        categoryId: group.subCategory ? await ensureSubCategory("KRU", group.subCategory) : catKru.id,
        trackIndividually: true,
        issueUnitId: unitId("เครื่อง"),
        minThreshold: 1, locationId: locId,
        totalQty: group.subItems.length, availableQty: availableCount,
        model, purchasePrice: price,
        vendorCompany, vendorContact, vendorPhone,
        warrantyMonths, description: group.subCategory || null,
      },
    });

    for (let si = 0; si < group.subItems.length; si++) {
      const sub = group.subItems[si];
      const created = await prisma.subItem.create({
        data: {
          itemId: item.id,
          subCode: `C${String(si + 1).padStart(2, "0")}`,
          name: group.subItems.length > 1 ? `${stripTrailingNum(group.nameTh)} (${si + 1})` : group.nameTh,
          status: mapStatus(sub.condition),
          condition: mapCondition(sub.condition),
          serialNumber: sub.serialNo && sub.serialNo !== "N/A" && sub.serialNo !== "รอเลขจากพัสดุ" ? sub.serialNo : null,
          notes: sub.notes || null,
        },
      });
      await logInitialStatus(prisma, created, admin.id);
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
        code: nextCode("ELE"),
        name: stripTrailingNum(group.nameTh),
        categoryId: catEle.id,
        trackIndividually: true,
        issueUnitId: unitId("เครื่อง"),
        minThreshold: 1, locationId: locId,
        totalQty: group.subItems.length, availableQty: availableCount,
        model, purchasePrice: price,
        vendorCompany, vendorContact, vendorPhone,
        warrantyMonths, description: group.subCategory || null,
      },
    });

    for (let si = 0; si < group.subItems.length; si++) {
      const sub = group.subItems[si];
      const created = await prisma.subItem.create({
        data: {
          itemId: item.id,
          subCode: `C${String(si + 1).padStart(2, "0")}`,
          name: group.subItems.length > 1 ? `${stripTrailingNum(group.nameTh)} (${si + 1})` : group.nameTh,
          status: mapStatus(sub.condition),
          condition: mapCondition(sub.condition),
          serialNumber: sub.serialNo && sub.serialNo !== "N/A" ? sub.serialNo : null,
          notes: sub.notes || null,
        },
      });
      await logInitialStatus(prisma, created, admin.id);
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
        code: nextCode("BOOK"),
        name: stripTrailingNum(group.bookName),
        categoryId: catBook.id,
        trackIndividually: true,
        issueUnitId: unitId("เล่ม"),
        minThreshold: 0, locationId: locId,
        totalQty: qty, availableQty: qty,
        description: group.category || null,
      },
    });

    for (let ci = 0; ci < group.codes.length; ci++) {
      await prisma.subItem.create({
        data: {
          itemId: item.id,
          subCode: `C${String(ci + 1).padStart(2, "0")}`,
          name: group.codes.length > 1 ? `${stripTrailingNum(group.bookName)} (${ci + 1})` : group.bookName,
          status: "AVAILABLE",
          condition: "GOOD",
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
        code: nextCode("TOY"),
        name: stripTrailingNum(group.toyName),
        categoryId: catToy.id,
        trackIndividually: true,
        issueUnitId: unitId("ชิ้น"),
        minThreshold: 0, locationId: locId,
        totalQty: qty, availableQty: qty,
        description: group.category || null,
      },
    });

    for (let ci = 0; ci < group.codes.length; ci++) {
      await prisma.subItem.create({
        data: {
          itemId: item.id,
          subCode: `C${String(ci + 1).padStart(2, "0")}`,
          name: group.codes.length > 1 ? `${stripTrailingNum(group.toyName)} (${ci + 1})` : group.toyName,
          status: "AVAILABLE",
          condition: "GOOD",
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
    const code = nextCode("DUR");

    await prisma.item.create({
      data: {
        code, name, nameEn,
        categoryId: catDur.id,
        trackIndividually: false,
        issueUnitId: unitId(unitName),
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
    const code = nextCode("CON");
    const nameRaw = (row[2] || "").trim();
    const room = (row[3] || "").trim();
    if (!nameRaw) continue;

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
        issueUnitId: unitId(unitName),
        minThreshold: 0, locationId: locId,
        totalQty: qty, availableQty: qty,
      },
    });
    conCount++;
  }
  console.log(`  ${conCount} items`);

  // ============================================================
  // 7. Import อุปกรณ์นักศึกษายืมประกอบวิชา (KIT) — recipes only, no stock.
  // A KIT Item is the recipe; a physically assembled set is a SubItem of it, created by
  // ประกอบชุด. The CSV's จำนวน column counted sets that existed on paper under the old
  // consumable model — importing it as stock would invent sets nobody assembled.
  // ============================================================
  console.log("Importing อุปกรณ์ประกอบวิชา (KIT)...");
  const kitRows = readCsv("ข้อมูลทรัพย์สิน NLU - อุปกรณ์นักศึกษายืมประกอบวิชา.csv");
  // Nested structure: parent rows have col[0]=number, sub-rows have col[0]=""
  // Parent: 0=ลำดับ, 1=รายการ, 2=จำนวน, 3=หน่วย, 4=หมายเหตุ
  // Sub:    0="", 1="", 2="", 3="", 4=ลำดับ, 5=ชื่อ, 6=จำนวน, 7=หน่วย, 8=หมายเหตุ

  let kitCount = 0;

  for (let i = 2; i < kitRows.length; i++) {
    const row = kitRows[i];
    if (!row || row.length < 2) continue;
    const seq = (row[0] || "").trim();

    if (seq) {
      // Parent row → kit Item
      const nameRaw = (row[1] || "").trim();
      const unitRaw = (row[3] || "").trim();
      const notes = (row[8] || row[4] || "").trim();
      if (!nameRaw) continue;

      const unitName = parseUnit(unitRaw);
      const code = nextCode("KIT");

      await prisma.item.create({
        data: {
          code, name: nameRaw,
          categoryId: catKit.id,
          trackIndividually: true,
          issueUnitId: unitId(unitName),
          minThreshold: 0, locationId: defaultLocId,
          totalQty: 0, availableQty: 0,
          description: notes || null,
        },
      });
      kitCount++;
      continue;
    }

    // Sub-rows are skipped. They are component names typed in a spreadsheet, and matching one
    // to a real Item needs a human — the imported row could only ever be a caption, so it was
    // dropped along with the nullable componentItemId. Recipes are built in แก้ส่วนประกอบ.
  }
  console.log(`  ${kitCount} kit items (recipes are linked by hand)`);

  // ============================================================
  // Demo data for dashboard
  // ============================================================
  // ponytail: SEED_DEMO=0 stops here — master data only, every history table empty,
  // so a manual end-to-end test run reads its own rows and nothing else.
  if (process.env.SEED_DEMO === "0") {
    console.log("SEED_DEMO=0 — skipping demo transactions");
    await prisma.$disconnect();
    return;
  }
  console.log("Creating demo transactions...");
  const now = new Date();
  const day = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  const demoConsumables = await prisma.item.findMany({
    where: { category: { profile: { code: "CON" } } },
    take: 5,
  });

  for (const item of demoConsumables) {
    const lot = await prisma.lot.create({
      data: {
        itemId: item.id, lotNumber: `LOT-${item.code}`,
        receivedQty: item.totalQty, remainingQty: item.totalQty,
        expiryDate: new Date(now.getTime() + (rng() * 365 + 30) * 24 * 60 * 60 * 1000),
        receivedDate: day(60),
      },
    });

    await prisma.receiveRecord.create({
      data: { itemId: item.id, lotId: lot.id, quantity: item.totalQty, receivedBy: admin.id, receivedAt: day(60) },
    });

    const dispenseCount = Math.floor(rng() * 3) + 1;
    for (let j = 0; j < dispenseCount; j++) {
      const qty = Math.floor(rng() * 10) + 1;
      await prisma.dispenseRecord.create({
        data: {
          itemId: item.id, lotId: lot.id,
          quantity: qty,
          usageType: ([UsageType.COURSE, UsageType.ACTIVITY, UsageType.OTHER] as const)[j % 3],
          staffId: admin.id, dispensedAt: day(j * 3 + 1),
          loanType: "BORROW",
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
    const rec = await prisma.dispenseRecord.create({
      data: {
        itemId: m.itemId,
        quantity: m.qty,
        usageType: m.usageType,
        staffId: admin.id,
        dispensedAt: day(m.daysAgo),
        loanType: "BORROW",
        // Closed so these chart-only records don't pollute the รับคืน open-loan list.
        resolvedQty: m.qty,
        returnedAt: day(m.daysAgo),
      },
    });
    // Every path in lib/returns that sets returnedAt also writes one of these, so a closed
    // loan without one is data the app cannot produce. The dashboard reads the two sides
    // from different tables — /tab-summary counts open rows, /flow-monthly walks the return
    // ledger — and a seed that closes a loan silently made those two disagree by 351 ชิ้น.
    await prisma.returnRecord.create({
      data: {
        itemId: m.itemId,
        dispenseRecordId: rec.id,
        quantity: m.qty,
        condition: "AVAILABLE",
        returnedBy: admin.id,
        returnedAt: day(m.daysAgo),
      },
    });
  }
  console.log(`  ${mockDispenses.filter((m) => m.itemId).length} mock dispense records created`);

  // Near-expiry lot alert
  if (demoConsumables[0]) {
    await prisma.lot.create({
      data: {
        itemId: demoConsumables[0].id, lotNumber: "LOT-EXPIRE",
        receivedQty: 5, remainingQty: 5,
        expiryDate: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000),
        receivedDate: day(120),
      },
    });
    // ล็อตของสิ้นเปลืองคือแหล่งความจริงของยอด — สร้างล็อตแล้วไม่ขยับยอดของ item ด้วย
    // ฐานจะออกมาผิดตั้งแต่วินาทีแรก (availableQty 0 ทั้งที่ในล็อตมีของ 5) ซึ่งเป็น drift
    // ที่ recomputeItemCounts จะไม่มีวันแก้ให้ เพราะไม่มีใครเรียกมันกับของชิ้นนี้อีก
    const lotSum = await prisma.lot.aggregate({
      where: { itemId: demoConsumables[0].id },
      _sum: { remainingQty: true },
    });
    const available = lotSum._sum.remainingQty ?? 0;
    await prisma.item.update({
      where: { id: demoConsumables[0].id },
      data: { availableQty: available, totalQty: { set: Math.max(demoConsumables[0].totalQty, available) } },
    });
  }

  // Low-stock alert
  const lowStockItem = await prisma.item.findFirst({
    where: { category: { profile: { code: "CON" } }, totalQty: { gt: 0 } },
    orderBy: { totalQty: "asc" },
  });
  if (lowStockItem) {
    await prisma.item.update({
      where: { id: lowStockItem.id },
      data: { minThreshold: lowStockItem.totalQty + 10 },
    });
  }

  // ============================================================
  // Maintenance demo data
  // ============================================================
  console.log("Creating maintenance demo data...");

  const maintItems = await prisma.item.findMany({
    where: { trackIndividually: true, isActive: true },
    select: { id: true, code: true, name: true, subItems: { select: { id: true } } },
    take: 20,
  });

  // The maintenance schedule for tracked items lives per copy on the SubItem
  // (cycle length stays on the Item). Stamp every copy so each shows on the schedule.
  const setSchedule = async (
    itemId: string,
    subIds: string[],
    dates: { next: Date; last: Date },
    cycle: number,
  ) => {
    await prisma.item.update({ where: { id: itemId }, data: { maintenanceCycleMonths: cycle } });
    await prisma.subItem.updateMany({
      where: { id: { in: subIds } },
      data: { nextMaintenanceDate: dates.next, lastMaintenanceDate: dates.last },
    });
  };

  // 3 overdue (past dates)
  for (let i = 0; i < Math.min(3, maintItems.length); i++) {
    await setSchedule(maintItems[i].id, maintItems[i].subItems.map((s) => s.id),
      { next: day((i + 1) * 5), last: day(180 + i * 30) }, 6);
  }

  // 4 due-soon (within 30 days)
  for (let i = 3; i < Math.min(7, maintItems.length); i++) {
    await setSchedule(maintItems[i].id, maintItems[i].subItems.map((s) => s.id),
      { next: new Date(now.getTime() + (i - 2) * 5 * 24 * 60 * 60 * 1000), last: day(200) }, 12);
  }

  // 5 normal (far future)
  for (let i = 7; i < Math.min(12, maintItems.length); i++) {
    await setSchedule(maintItems[i].id, maintItems[i].subItems.map((s) => s.id),
      { next: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), last: day(30) }, 12);
  }

  // --- Maintenance history records ---
  const maintTypes = ["PREVENTIVE", "CORRECTIVE"] as const;
  const maintResults = ["AVAILABLE", "AVAILABLE", "AVAILABLE", "NEEDS_MORE_REPAIR", "DISPOSED"] as const;

  for (let i = 0; i < Math.min(8, maintItems.length); i++) {
    await prisma.maintenanceRecord.create({
      data: {
        itemId: maintItems[i].id,
        // Attach to the first copy so demo history shows which piece (per-copy).
        subItemId: maintItems[i].subItems[0]?.id,
        type: maintTypes[i % 2],
        result: maintResults[i % maintResults.length],
        performedAt: day((i + 1) * 7),
        performedBy: admin.id,
        issue: [
          "ตรวจสอบสภาพปกติ บำรุงรักษาตามรอบ",
          "สวิตช์เสีย เปลี่ยนใหม่",
          "ทำความสะอาดตามรอบ",
          "สายไฟขาด ซ่อมเสร็จ",
          "เปลี่ยนถ่านสำรอง",
          "จอภาพจาง ปรับแล้วใช้ได้",
          "ตัวเครื่องมีรอด ทาสีใหม่",
          "เสียงผิดปกติ ต้องเปลี่ยน motor",
        ][i],
        cost: [0, 500, 0, 1200, 150, 3500, 800, 4500][i],
      },
    });
  }

  console.log(`  ${Math.min(12, maintItems.length)} items with maintenance schedule`);
  console.log(`  ${Math.min(8, maintItems.length)} maintenance records`);

  // ============================================================
  // Demo open loans for the รับคืน screen (loanGroupId + dueAt + recipient)
  // 3 borrow events: overdue / near-due / no-due; mix of tracked SubItems + count qty.
  // ============================================================
  console.log("Creating demo open loans (รับคืน)...");
  const { recomputeItemCounts } = await import("../src/lib/stock");

  // Find a tracked item with at least N AVAILABLE sub-items.
  async function findTrackedWith(minAvail: number, exclude: string[] = []) {
    const subs = await prisma.subItem.findMany({
      where: { status: "AVAILABLE", item: { trackIndividually: true, isActive: true, id: { notIn: exclude } } },
      select: { id: true, itemId: true },
    });
    const counts = new Map<string, string[]>();
    for (const s of subs) {
      const arr = counts.get(s.itemId) ?? [];
      arr.push(s.id);
      counts.set(s.itemId, arr);
    }
    for (const [itemId, ids] of counts) if (ids.length >= minAvail) return { itemId, subIds: ids };
    return null;
  }

  const used = new Set<string>();
  const pick = (n: number) => findTrackedWith(n, [...used]);
  const loanA = await pick(2);
  if (loanA) used.add(loanA.itemId);
  const loanB = await pick(3);
  if (loanB) used.add(loanB.itemId);
  const loanC = await pick(1);
  if (loanC) used.add(loanC.itemId);
  const loanD = await pick(4);
  if (loanD) used.add(loanD.itemId);
  const loanE = await pick(1);
  if (loanE) used.add(loanE.itemId);
  const loanF = await pick(1);
  if (loanF) used.add(loanF.itemId);
  const countItem = await prisma.item.findFirst({
    where: { trackIndividually: false, category: { profile: { code: "DUR" } }, availableQty: { gte: 5 }, isActive: true },
  });
  const countItem2 = await prisma.item.findFirst({
    where: { trackIndividually: false, category: { profile: { code: "DUR" } }, availableQty: { gte: 10 }, isActive: true, id: { not: countItem?.id } },
  });

  const affectedTracked = new Set<string>();
  let loanRecCount = 0;
  let loanEventCount = 0;

  type LoanOpts = { loanGroupId: string; recipient: string; at: Date; due: Date | null; usage: "COURSE" | "ACTIVITY" | "OTHER" };
  async function loanTracked(subId: string, itemId: string, opts: LoanOpts) {
    await prisma.subItem.update({ where: { id: subId }, data: { status: "ON_LOAN" } });
    await prisma.dispenseRecord.create({
      data: {
        itemId, subItemId: subId, quantity: 1, resolvedQty: 0,
        staffId: admin.id, dispensedAt: opts.at,
        loanGroupId: opts.loanGroupId, dueAt: opts.due,
        recipient: opts.recipient, usageType: opts.usage,
        loanType: "BORROW",
      },
    });
    affectedTracked.add(itemId);
    loanRecCount++;
  }
  // Already-returned tracked SubItem (partial-return scenario): SubItem back to AVAILABLE, record closed.
  async function loanTrackedReturned(subId: string, itemId: string, opts: LoanOpts) {
    await prisma.subItem.update({ where: { id: subId }, data: { status: "AVAILABLE" } });
    const returnedAt = new Date(opts.at.getTime() + 2 * 86400000);
    const rec = await prisma.dispenseRecord.create({
      data: {
        itemId, subItemId: subId, quantity: 1, resolvedQty: 1,
        staffId: admin.id, dispensedAt: opts.at,
        loanGroupId: opts.loanGroupId, dueAt: opts.due,
        recipient: opts.recipient, usageType: opts.usage,
        loanType: "BORROW",
        returnedAt,
      },
    });
    // See the mockDispenses loop: closing a loan without its ReturnRecord is unreachable
    // through the app and puts the dashboard's two ค้าง numbers out of step.
    await prisma.returnRecord.create({
      data: {
        itemId, subItemId: subId, dispenseRecordId: rec.id,
        quantity: 1, condition: "AVAILABLE", returnedBy: admin.id, returnedAt,
      },
    });
    affectedTracked.add(itemId);
    loanRecCount++;
  }
  async function loanCountQty(itemId: string, qty: number, opts: LoanOpts) {
    await prisma.item.update({ where: { id: itemId, availableQty: { gte: qty } }, data: { availableQty: { decrement: qty } } });
    await prisma.dispenseRecord.create({
      data: {
        itemId, quantity: qty, resolvedQty: 0,
        staffId: admin.id, dispensedAt: opts.at,
        loanGroupId: opts.loanGroupId, dueAt: opts.due,
        recipient: opts.recipient, usageType: opts.usage,
        loanType: "BORROW",
      },
    });
    loanRecCount++;
  }
  // Partially-returned count loan: `resolved` units already back. Net available drop = qty - resolved.
  async function loanCountPartial(itemId: string, qty: number, resolved: number, opts: LoanOpts) {
    await prisma.item.update({ where: { id: itemId, availableQty: { gte: qty - resolved } }, data: { availableQty: { decrement: qty - resolved } } });
    const rec = await prisma.dispenseRecord.create({
      data: {
        itemId, quantity: qty, resolvedQty: resolved,
        staffId: admin.id, dispensedAt: opts.at,
        loanGroupId: opts.loanGroupId, dueAt: opts.due,
        recipient: opts.recipient, usageType: opts.usage,
        loanType: "BORROW",
      },
    });
    // The part that already came home needs its ReturnRecord too — this is the case the
    // return ledger exists for, since the dispense row stays open and carries no date for it.
    await prisma.returnRecord.create({
      data: {
        itemId, dispenseRecordId: rec.id, quantity: resolved,
        condition: "AVAILABLE", returnedBy: admin.id,
        returnedAt: new Date(opts.at.getTime() + 86400000),
      },
    });
    loanRecCount++;
  }
  const bump = () => loanEventCount++;

  // Loan 1 — ครูสมชาย, overdue: 2 tracked + 5 count (7/7)
  if (loanA) {
    bump();
    const gid = randomUUID();
    const o: LoanOpts = { loanGroupId: gid, recipient: "ครูสมชาย ใจดี", at: day(8), due: day(3), usage: "COURSE" };
    await loanTracked(loanA.subIds[0], loanA.itemId, o);
    await loanTracked(loanA.subIds[1], loanA.itemId, o);
    if (countItem) await loanCountQty(countItem.id, 5, o);
  }
  // Loan 2 — ครูอารีย์, near-due: 3 tracked (3/3)
  if (loanB) {
    bump();
    const gid = randomUUID();
    const o: LoanOpts = { loanGroupId: gid, recipient: "ครูอารีย์ สายสมร", at: day(4), due: day(-2), usage: "ACTIVITY" };
    for (let i = 0; i < 3; i++) await loanTracked(loanB.subIds[i], loanB.itemId, o);
  }
  // Loan 3 — นักเรียน ม.4/1, no due: 1 tracked (1/1)
  if (loanC) {
    bump();
    const gid = randomUUID();
    await loanTracked(loanC.subIds[0], loanC.itemId, { loanGroupId: gid, recipient: "นักเรียน ม.4/1", at: day(1), due: null, usage: "OTHER" });
  }
  // Loan 4 — ครูวิภา, overdue: 4 tracked, 2 already returned (ค้าง 2/4)
  if (loanD) {
    bump();
    const gid = randomUUID();
    const o: LoanOpts = { loanGroupId: gid, recipient: "ครูวิภา พรหม", at: day(10), due: day(5), usage: "COURSE" };
    await loanTracked(loanD.subIds[0], loanD.itemId, o);
    await loanTracked(loanD.subIds[1], loanD.itemId, o);
    await loanTrackedReturned(loanD.subIds[2], loanD.itemId, o);
    await loanTrackedReturned(loanD.subIds[3], loanD.itemId, o);
  }
  // Loan 5 — ห้องสมุด, near-due: count qty 10, 4 already returned (ค้าง 6/10)
  if (countItem2) {
    bump();
    const gid = randomUUID();
    await loanCountPartial(countItem2.id, 10, 4, { loanGroupId: gid, recipient: "ห้องสมุด NLU", at: day(6), due: day(-1), usage: "ACTIVITY" });
  }
  // Loan 6 — ครูทดสอบ, no due: 2 tracked from 2 different items (detail shows 2 item cards, 2/2)
  if (loanE && loanF) {
    bump();
    const gid = randomUUID();
    const o: LoanOpts = { loanGroupId: gid, recipient: "ครูทดสอบ ระบบ", at: day(2), due: null, usage: "OTHER" };
    await loanTracked(loanE.subIds[0], loanE.itemId, o);
    await loanTracked(loanF.subIds[0], loanF.itemId, o);
  }

  for (const iid of affectedTracked) await recomputeItemCounts(prisma, iid);
  console.log(`  ${loanRecCount} open loan records across ${loanEventCount} borrow events`);

  // ============================================================
  // ตรวจนับ (stock count) due dates
  // ============================================================
  // ทั้ง 7 จุดที่ create item ข้างบนไม่ได้ stamp nextCountDate — path สร้างของจริง (settings/items,
  // items/quick-create) stamp ให้ แต่ seed แทรกตรงเข้า DB. lib/alerts ถือว่า null = ไม่เคยตรวจนับ
  // = ถึงกำหนดแล้ว ปล่อยไว้ chip ถึงรอบตรวจนับ จึงติดทั้ง 918 แถวและ badge อ่านได้ 979.
  // Alert ที่ดังกับทุกอย่างไม่ได้บอกอะไรเลย.
  //
  // ทำเป็น statement เดียวท้าย seed แทนที่จะไปแก้ทั้ง 7 จุด: จุดที่ 8 ที่ใครเพิ่มวันหลังก็โดนคลุมด้วย.
  //   * เฉพาะ nextCountDate. lastCountDate ปล่อย null ไว้ตั้งใจ — stamp ลงไปคือกุว่ามีคนตรวจนับ
  //     ทั้งที่ไม่มี และ audit trail คือสิ่งเดียวที่ห้ามแต่ง. null อ่านว่า "ไม่เคยตรวจนับ" ซึ่งจริง
  //   * กระจายทั่ว cycle ไม่ใช่ now()+cycle. แปะวันเดียวกันหมดคือเลื่อนปัญหาไปหนึ่ง cycle แล้ว
  //     badge เด้งกลับ 979 ในคืนเดียว. กระจายแล้วถึงกำหนดสัปดาห์ละไม่กี่ชิ้น ซึ่งคือความหมายของ
  //     ตารางตรวจนับ
  //   * ออฟเซ็ตมาจาก md5(code) ไม่ใช่ random(): code มาจาก CSV จึงคงที่ข้าม reseed. seed ทั้งไฟล์
  //     เดินด้วย PRNG ที่ fix seed ไว้เพื่อให้ e2e snapshot นิ่ง — random() ตรงนี้จะพังข้อตกลงนั้น
  //   * cycle จาก profile (CONSUMABLE 3 เดือน, ทนถาวร 12) พร้อม override รายชิ้น — กติกาเดียวกับ
  //     lib/stock-count countCycleFor
  //
  // scripts/backfill-next-count-date.sql ทำเรื่องเดียวกันกับ DB ที่ seed ไปแล้วก่อนมีบล็อกนี้.
  const counted = await prisma.$executeRaw`
    UPDATE items i
    SET "nextCountDate" = now() + (
      (('x' || substr(md5(i.code), 1, 4))::bit(16)::int) / 65536.0 * COALESCE(
        i."countCycleMonths",
        CASE p."dispenseType" WHEN 'CONSUMABLE' THEN 3 ELSE 12 END
      )
    ) * interval '1 month'
    FROM categories c, category_profiles p
    WHERE c.id = i."categoryId"
      AND p.id = c."profileId"
      AND i."isActive" = true
      AND i."nextCountDate" IS NULL
  `;
  console.log(`  ${counted} items given a first ตรวจนับ due date`);

  // ============================================================
  // Stats
  // ============================================================
  const totalItems = await prisma.item.count();
  const totalSubItems = await prisma.subItem.count();
  const totalCategories = await prisma.categoryType.count();
  const totalLocations = await prisma.location.count();

  console.log("\n✅ Seed completed!");
  console.log({
    users: 3,
    categories: totalCategories,
    locations: totalLocations,
    items: totalItems,
    subItems: totalSubItems,
  });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
