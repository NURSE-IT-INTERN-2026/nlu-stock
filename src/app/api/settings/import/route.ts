import { prisma } from "@/lib/prisma";
import { requireAdmin, json, error } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { ItemCondition } from "@/generated/prisma/enums";
import { isItemTracked } from "@/lib/category-profile";

interface ImportRow {
  [key: string]: string;
}

interface ImportResult {
  imported: number;
  errors: { row: number; message: string }[];
}

function safeErrorMessage(e: unknown): string {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return "Duplicate entry already exists";
    if (e.code === "P2003") return "Referenced record not found";
    return "Database error";
  }
  return "Failed to import row";
}

function parseOptionalInt(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v);
  return Number.isNaN(n) ? null : n;
}

function parseOptionalFloat(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

function parseOptionalDate(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function importItems(rows: ImportRow[]): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, errors: [] };
  const categories = await prisma.categoryType.findMany({ include: { profile: true } });
  const locations = await prisma.location.findMany();
  const units = await prisma.unit.findMany();

  const validRows: { index: number; data: Prisma.ItemCreateInput }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (!row.code || !row.name) {
      result.errors.push({ row: i + 1, message: "Code and name are required" });
      continue;
    }

    const category = categories.find(
      (c) => c.name === row.category || c.id === row.categoryId
    );
    if (!category) {
      result.errors.push({ row: i + 1, message: `Category "${row.category}" not found` });
      continue;
    }

    const location = locations.find(
      (l) =>
        (l.building ?? "") === (row.building ?? "") &&
        (l.floor ?? "") === (row.floor ?? "") &&
        l.room === row.room &&
        (l.detail ?? "") === (row.detail ?? "")
    );

    const issueUnitName = row.unit || "ชิ้น";
    const issueUnit = units.find((u) => u.name === issueUnitName);
    if (!issueUnit) {
      result.errors.push({ row: i + 1, message: `Unit "${issueUnitName}" not found` });
      continue;
    }

    const trackIndividually = category.profile
      ? isItemTracked(category.profile)
      : row.trackIndividually === "true";
    const qty = parseOptionalInt(row.qty) ?? 0; // ignored when trackIndividually (sub-items drive counts)

    validRows.push({
      index: i,
      data: {
        code: row.code,
        name: row.name,
        nameEn: row.nameEn || null,
        category: { connect: { id: category.id } },
        trackIndividually,
        issueUnit: { connect: { id: issueUnit.id } },
        minThreshold: parseInt(row.minThreshold) || 0,
        location: location ? { connect: { id: location.id } } : undefined,
        // Stock: count/consumable types (DUR/CON/KIT) take qty from the row;
        // item-types (KRU/ELE/BAT) stay 0 — sub-items import reconciles them.
        totalQty: trackIndividually ? 0 : qty,
        availableQty: trackIndividually ? 0 : qty,
        setSize: parseOptionalInt(row.setSize) ?? 1,
        // Asset fields (KRU/ELE) — nullable, ignored for other profiles
        model: row.model || null,
        purchaseDate: parseOptionalDate(row.purchaseDate),
        purchasePrice: parseOptionalFloat(row.purchasePrice),
        vendorCompany: row.vendorCompany || null,
        vendorContact: row.vendorContact || null,
        vendorPhone: row.vendorPhone || null,
        warrantyMonths: parseOptionalInt(row.warrantyMonths) ?? 0,
        description: row.description || null,
      },
    });
  }

  if (validRows.length > 0) {
    await prisma.$transaction(
      validRows.map((r) => prisma.item.create({ data: r.data }))
    );
    result.imported = validRows.length;
  }

  return result;
}

async function importCategories(rows: ImportRow[]): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, errors: [] };
  const profiles = await prisma.categoryProfile.findMany();
  const profileByCode = new Map(profiles.map((p) => [p.code, p]));

  const validRows: Prisma.CategoryTypeCreateInput[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (!row.name) {
      result.errors.push({ row: i + 1, message: "Name is required" });
      continue;
    }
    const profile = profileByCode.get((row.category || "").toUpperCase());
    if (!profile) {
      result.errors.push({ row: i + 1, message: `Invalid profile code "${row.category}"` });
      continue;
    }

    validRows.push({
      name: row.name,
      profile: { connect: { id: profile.id } },
      description: row.description || null,
      sortOrder: parseInt(row.sortOrder) || 0,
    });
  }

  if (validRows.length > 0) {
    await prisma.$transaction(
      validRows.map((data) => prisma.categoryType.create({ data }))
    );
    result.imported = validRows.length;
  }

  return result;
}

async function importLocations(rows: ImportRow[]): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, errors: [] };

  const validRows: Prisma.LocationCreateInput[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (!row.building || !row.floor || !row.room) {
      result.errors.push({ row: i + 1, message: "Building, floor, and room are required" });
      continue;
    }

    validRows.push({
      building: row.building,
      floor: row.floor,
      room: row.room,
      detail: row.detail || null,
    });
  }

  if (validRows.length > 0) {
    await prisma.$transaction(
      validRows.map((data) => prisma.location.create({ data }))
    );
    result.imported = validRows.length;
  }

  return result;
}

async function importSubItems(rows: ImportRow[]): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, errors: [] };

  const itemCache = new Map<string, { id: string; trackIndividually: boolean }>();

  const validRows: Prisma.SubItemCreateInput[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (!row.itemCode || !row.subCode) {
      result.errors.push({ row: i + 1, message: "itemCode and subCode are required" });
      continue;
    }

    let item = itemCache.get(row.itemCode);
    if (!item) {
      const found = await prisma.item.findFirst({ where: { code: row.itemCode } });
      if (!found) {
        result.errors.push({ row: i + 1, message: `Item "${row.itemCode}" not found` });
        continue;
      }
      if (!found.trackIndividually) {
        result.errors.push({ row: i + 1, message: `Item "${row.itemCode}" does not track individually` });
        continue;
      }
      item = { id: found.id, trackIndividually: found.trackIndividually };
      itemCache.set(row.itemCode, item);
    }

    validRows.push({
      item: { connect: { id: item.id } },
      subCode: row.subCode,
      serialNumber: row.serialNumber || null,
      condition: (row.condition as ItemCondition | null) || null,
      notes: row.notes || null,
    });
  }

  if (validRows.length > 0) {
    // Count new sub-items per parent to reconcile Item counters.
    // Imported sub-items are AVAILABLE by default, so both totalQty and availableQty increment.
    const countsByItem = new Map<string, number>();
    for (const r of validRows) {
      const itemId = (r.item as { connect: { id: string } }).connect.id;
      countsByItem.set(itemId, (countsByItem.get(itemId) ?? 0) + 1);
    }

    await prisma.$transaction([
      ...validRows.map((data) => prisma.subItem.create({ data })),
      ...Array.from(countsByItem.entries()).map(([itemId, count]) =>
        prisma.item.update({
          where: { id: itemId },
          data: { totalQty: { increment: count }, availableQty: { increment: count } },
        }),
      ),
    ]);
    result.imported = validRows.length;
  }

  return result;
}

// KIT "ภายในชุดประกอบด้วย" — component rows for a kit item. Component is free text,
// not a tracked Item (matches the real Excel BOM structure). Units must pre-exist.
async function importKitBom(rows: ImportRow[]): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, errors: [] };

  const units = await prisma.unit.findMany();
  const unitByName = new Map(units.map((u) => [u.name, u]));
  const itemCache = new Map<string, string>(); // kitCode -> itemId

  const validRows: Prisma.KitBomCreateInput[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (!row.kitCode || !row.name) {
      result.errors.push({ row: i + 1, message: "kitCode and name are required" });
      continue;
    }

    let itemId = itemCache.get(row.kitCode);
    if (!itemId) {
      const found = await prisma.item.findFirst({ where: { code: row.kitCode } });
      if (!found) {
        result.errors.push({ row: i + 1, message: `Kit "${row.kitCode}" not found` });
        continue;
      }
      itemId = found.id;
      itemCache.set(row.kitCode, itemId);
    }

    const unitName = row.unit || "ชิ้น";
    const unit = unitByName.get(unitName);
    if (!unit) {
      result.errors.push({ row: i + 1, message: `Unit "${unitName}" not found` });
      continue;
    }

    validRows.push({
      kitItem: { connect: { id: itemId } },
      name: row.name,
      quantity: parseOptionalInt(row.qty) ?? 1,
      unit: { connect: { id: unit.id } },
      sortOrder: parseOptionalInt(row.sortOrder) ?? i,
    });
  }

  if (validRows.length > 0) {
    await prisma.$transaction(validRows.map((data) => prisma.kitBom.create({ data })));
    result.imported = validRows.length;
  }

  return result;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  try {
    const body = await request.json();
    const { type, rows } = body as { type: string; rows: ImportRow[] };

    if (!type || !rows || !Array.isArray(rows)) {
      return error("Missing type or rows");
    }

    // item variants (items-kru, items-bat, items-dur, items-con, items-kit) all share
    // importItems — it derives behavior from the row's category, so lean per-category
    // templates (each with only the relevant columns) all import through the one handler.
    let result: ImportResult;
    if (type === "categories") result = await importCategories(rows);
    else if (type === "locations") result = await importLocations(rows);
    else if (type === "sub-items") result = await importSubItems(rows);
    else if (type === "kit-bom") result = await importKitBom(rows);
    else if (type.startsWith("items")) result = await importItems(rows);
    else return error(`Unknown import type: ${type}`);

    return json(result);
  } catch {
    return error("Invalid request body");
  }
}

const TEMPLATES: Record<string, { headers: string[]; example: string[] }> = {
  "items-kru": {
    headers: ["code", "name", "nameEn", "category", "unit", "building", "floor", "room", "detail", "model", "purchasePrice", "purchaseDate", "vendorCompany", "vendorContact", "vendorPhone", "warrantyMonths", "description"],
    example: ["NLU-KRU-002-001", "iPad", "iPad Air", "อุปกรณ์อิเล็กทรอนิกส์", "เครื่อง", "อาคาร 2", "ชั้น 4", "402", "ตู้ 1", "iPad Air 11", "13500", "2024-01-15", "Apple Thailand", "คุณ ก.", "02-123-4567", "12", ""],
  },
  "items-bat": {
    headers: ["code", "name", "nameEn", "category", "unit", "building", "floor", "room", "detail", "setSize", "description"],
    example: ["NLU-BAT-013-001-S10-C01", "คู่มือพัฒนาการ", "", "หนังสือ", "เล่ม", "อาคาร 2", "ชั้น 4", "402", "ตู้ 1", "10", ""],
  },
  "items-dur": {
    headers: ["code", "name", "nameEn", "category", "unit", "qty", "building", "floor", "room", "detail", "description"],
    example: ["NLU-DUR-001", "ถาดพลาสติก", "Plastic tray", "วัสดุคงทน", "ใบ", "20", "อาคาร 2", "ชั้น 4", "402", "ตู้ 1", ""],
  },
  "items-con": {
    headers: ["code", "name", "nameEn", "category", "unit", "qty", "building", "floor", "room", "detail", "description"],
    example: ["NLU-CON-001", "เครื่องดื่มหัวปลีแบบผง", "", "วัสดุสิ้นเปลือง", "กล่อง", "504", "อาคาร 2", "ชั้น 4", "402", "ตู้ 1", ""],
  },
  "items-kit": {
    headers: ["code", "name", "nameEn", "category", "unit", "qty", "description"],
    example: ["NLU-KIT-001", "ชุดอุปกรณ์สอนดูแลเด็กทารกหลังคลอด", "", "อุปกรณ์ประกอบวิชา", "ชุด", "35", ""],
  },
  categories: {
    headers: ["name", "category", "description", "sortOrder"],
    example: ["วัสดุสิ้นเปลือง", "CON", "", "1"],
  },
  locations: {
    headers: ["building", "floor", "room", "detail"],
    example: ["อาคาร 2", "ชั้น 4", "402", "ตู้ 1"],
  },
  "sub-items": {
    headers: ["itemCode", "subCode", "serialNumber", "condition", "notes"],
    example: ["NLU-KRU-002-001", "NLU-KRU-002-001-C01", "SN-IPAD-001", "NEW", ""],
  },
  "kit-bom": {
    headers: ["kitCode", "name", "qty", "unit", "sortOrder"],
    example: ["NLU-KIT-001", "ตุ๊กตาทารก", "1", "ตัว", "1"],
  },
};

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const type = request.nextUrl.searchParams.get("type");
  if (!type || !TEMPLATES[type]) return error("Unknown template type");

  const template = TEMPLATES[type];
  const csv = [template.headers.join(","), template.example.join(",")].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}-template.csv"`,
    },
  });
}
