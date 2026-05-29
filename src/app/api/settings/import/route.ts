import { prisma } from "@/lib/prisma";
import { requireAdmin, json, error } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { ItemCondition } from "@/generated/prisma/enums";
import { forcedTrackIndividually } from "@/lib/validators/item";

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

async function importItems(rows: ImportRow[]): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, errors: [] };
  const categories = await prisma.categoryType.findMany();
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

    const issueUnitName = row.issueUnit || "ชิ้น";
    const issueUnit = units.find((u) => u.name === issueUnitName);
    if (!issueUnit) {
      result.errors.push({ row: i + 1, message: `Unit "${issueUnitName}" not found` });
      continue;
    }

    const subUnitName = row.subUnit || issueUnitName;
    const subUnit = units.find((u) => u.name === subUnitName);
    if (!subUnit) {
      result.errors.push({ row: i + 1, message: `Unit "${subUnitName}" not found` });
      continue;
    }

    validRows.push({
      index: i,
      data: {
        code: row.code,
        name: row.name,
        nameEn: row.nameEn || null,
        category: { connect: { id: category.id } },
        trackIndividually: (() => {
          const forced = forcedTrackIndividually(category.category);
          if (forced !== undefined) return forced;
          return row.trackIndividually === "true";
        })(),
        issueUnit: { connect: { id: issueUnit.id } },
        subUnit: { connect: { id: subUnit.id } },
        conversionFactor: parseInt(row.conversionFactor) || 1,
        minThreshold: parseInt(row.minThreshold) || 0,
        location: location ? { connect: { id: location.id } } : undefined,
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
  const validCategories = ["KRU", "ELE", "BOOK", "TOY", "DUR", "CON", "MED", "KIT"];

  const validRows: Prisma.CategoryTypeCreateInput[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (!row.name) {
      result.errors.push({ row: i + 1, message: "Name is required" });
      continue;
    }
    if (!validCategories.includes(row.category)) {
      result.errors.push({ row: i + 1, message: `Invalid category "${row.category}"` });
      continue;
    }

    validRows.push({
      name: row.name,
      category: row.category as "KRU" | "ELE" | "BOOK" | "TOY" | "DUR" | "CON" | "MED" | "KIT",
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
      condition: (row.condition as ItemCondition | null) || null,
      notes: row.notes || null,
    });
  }

  if (validRows.length > 0) {
    await prisma.$transaction(
      validRows.map((data) => prisma.subItem.create({ data }))
    );
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

    let result: ImportResult;
    switch (type) {
      case "items":
        result = await importItems(rows);
        break;
      case "categories":
        result = await importCategories(rows);
        break;
      case "locations":
        result = await importLocations(rows);
        break;
      case "sub-items":
        result = await importSubItems(rows);
        break;
      default:
        return error(`Unknown import type: ${type}`);
    }

    return json(result);
  } catch {
    return error("Invalid request body");
  }
}

const TEMPLATES: Record<string, { headers: string[]; example: string[] }> = {
  items: {
    headers: ["code", "name", "nameEn", "category", "trackIndividually", "issueUnit", "subUnit", "conversionFactor", "minThreshold", "building", "floor", "room", "detail", "description"],
    example: ["NLU-CON-001", "Pen", "Ballpoint Pen", "CON", "false", "ชิ้น", "", "1", "10", "อาคาร A", "ชั้น 1", "ห้อง 101", "ตู้ 1", ""],
  },
  categories: {
    headers: ["name", "category", "description", "sortOrder"],
    example: ["วัสดุสิ้นเปลือง", "CON", "", "1"],
  },
  locations: {
    headers: ["building", "floor", "room", "detail"],
    example: ["อาคาร A", "ชั้น 1", "ห้อง 101", "ตู้ 1"],
  },
  "sub-items": {
    headers: ["itemCode", "subCode", "condition", "notes"],
    example: ["ITM001", "ITM001-01", "Good", ""],
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
