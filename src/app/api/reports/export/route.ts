import { NextRequest } from "next/server";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { toCsv, toXlsx, toPdf } from "@/lib/export-utils";
import { format } from "date-fns";
import { ItemStatus } from "@/generated/prisma/enums";
import { USAGE_TYPE_LABELS } from "@/lib/constants";

type ReportType =
  | "stock-summary"
  | "dispense-history"
  | "usage-by-subject"
  | "near-expiry-low-stock"
  | "annual-cost"
  | "damaged-assets"
  | "maintenance-schedule"
  | "maintenance-history";

const REPORT_TYPES: ReportType[] = [
  "stock-summary",
  "dispense-history",
  "usage-by-subject",
  "near-expiry-low-stock",
  "annual-cost",
  "damaged-assets",
  "maintenance-schedule",
  "maintenance-history",
];

async function fetchReportData(type: ReportType, params: URLSearchParams) {
  switch (type) {
    case "stock-summary": {
      const where: Record<string, unknown> = { isActive: true };
      const categoryId = params.get("categoryId");
      if (categoryId) where.categoryId = categoryId;

      const groups = await prisma.item.groupBy({
        by: ["categoryId"],
        where,
        _sum: { totalQty: true, availableQty: true },
        _count: true,
      });
      const categories = await prisma.categoryType.findMany({
        where: { id: { in: groups.map((g) => g.categoryId) } },
        select: { id: true, name: true },
      });
      const catMap = new Map(categories.map((c) => [c.id, c.name]));
      return groups.map((g) => ({
        Category: catMap.get(g.categoryId) ?? "Unknown",
        "Total Items": g._count,
        "Total Qty": g._sum.totalQty ?? 0,
        "Available Qty": g._sum.availableQty ?? 0,
      }));
    }

    case "dispense-history": {
      const where: Record<string, unknown> = {};
      const dateFrom = params.get("dateFrom");
      const dateTo = params.get("dateTo");
      if (dateFrom || dateTo) {
        where.dispensedAt = {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
        };
      }
      const itemId = params.get("itemId");
      if (itemId) where.itemId = itemId;
      const staffId = params.get("staffId");
      if (staffId) where.staffId = staffId;
      const usageType = params.get("usageType");
      if (usageType) where.usageType = usageType;

      const records = await prisma.dispenseRecord.findMany({
        where,
        include: {
          item: { select: { code: true, name: true } },
          staff: { select: { name: true } },
        },
        orderBy: { dispensedAt: "desc" },
        take: 10000,
      });

      return records.map((r) => ({
        Date: format(r.dispensedAt, "yyyy-MM-dd HH:mm"),
        "Item Code": r.item.code,
        "Item Name": r.item.name,
        Quantity: r.quantity,
        Staff: r.staff.name,
        Usage: r.usageType ? (USAGE_TYPE_LABELS[r.usageType] ?? r.usageType) : "—",
        Notes: r.notes ?? "",
      }));
    }

    case "usage-by-subject": {
      const where: Record<string, unknown> = {};
      const dateFrom = params.get("dateFrom");
      const dateTo = params.get("dateTo");
      if (dateFrom || dateTo) {
        where.dispensedAt = {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
        };
      }
      const categoryId = params.get("categoryId");
      if (categoryId) where.item = { categoryId };

      const groups = await prisma.dispenseRecord.groupBy({
        by: ["usageType"],
        where: { ...where, usageType: { not: null } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
      });

      return groups.map((g) => {
        return {
          "Usage Type": USAGE_TYPE_LABELS[g.usageType ?? ""] ?? g.usageType ?? "Unknown",
          "Total Quantity": g._sum.quantity ?? 0,
        };
      });
    }

    case "near-expiry-low-stock": {
      const categoryId = params.get("categoryId");
      const itemWhere: Record<string, unknown> = { isActive: true };
      if (categoryId) itemWhere.categoryId = categoryId;

      const lowStock = await prisma.item.findMany({
        where: { ...itemWhere, availableQty: { lt: prisma.item.fields.minThreshold } },
        include: { category: { select: { name: true } } },
        take: 10000,
      });

      const now = new Date();
      const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

      const nearExpiry = await prisma.lot.findMany({
        where: {
          expiryDate: { gte: now, lte: in90Days },
          item: { isActive: true, ...(categoryId ? { categoryId } : {}) },
        },
        include: { item: { select: { code: true, name: true } } },
        take: 10000,
      });

      const lowRows = lowStock.map((i) => ({
        Type: "Low Stock",
        Code: i.code,
        Name: i.name,
        Category: i.category.name,
        "Available Qty": i.availableQty,
        "Min Threshold": i.minThreshold,
        "Expiry Date": "",
      }));

      const expiryRows = nearExpiry.map((l) => ({
        Type: "Near Expiry",
        Code: l.item.code,
        Name: l.item.name,
        Category: "",
        "Available Qty": l.quantity,
        "Min Threshold": "",
        "Expiry Date": l.expiryDate ? format(l.expiryDate, "yyyy-MM-dd") : "",
      }));

      return [...lowRows, ...expiryRows];
    }

    case "annual-cost": {
      const year = Number(params.get("year") || new Date().getFullYear());
      const categoryId = params.get("categoryId");
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year, 11, 31, 23, 59, 59);

      const itemWhere: Record<string, unknown> = {
        purchaseDate: { gte: startOfYear, lte: endOfYear },
        purchasePrice: { not: null },
      };
      if (categoryId) itemWhere.categoryId = categoryId;

      const purchases = await prisma.item.findMany({
        where: itemWhere,
        select: { code: true, name: true, purchasePrice: true, purchaseDate: true, category: { select: { name: true } } },
        take: 10000,
      });

      const maintWhere: Record<string, unknown> = {
        performedAt: { gte: startOfYear, lte: endOfYear },
        cost: { not: null },
      };
      if (categoryId) maintWhere.item = { categoryId };

      const repairs = await prisma.maintenanceRecord.findMany({
        where: maintWhere,
        include: { item: { select: { code: true, name: true } }, performer: { select: { name: true } } },
        take: 10000,
      });

      const purchaseRows = purchases.map((p) => ({
        Type: "Purchase",
        Code: p.code,
        Name: p.name,
        Category: p.category.name,
        Cost: p.purchasePrice ?? 0,
        Date: format(p.purchaseDate!, "yyyy-MM-dd"),
        By: "",
      }));

      const repairRows = repairs.map((r) => ({
        Type: "Repair",
        Code: r.item.code,
        Name: r.item.name,
        Category: "",
        Cost: r.cost ?? 0,
        Date: format(r.performedAt, "yyyy-MM-dd"),
        By: r.performer.name,
      }));

      return [...purchaseRows, ...repairRows];
    }

    case "damaged-assets": {
      const status = params.get("status");
      const statuses: ItemStatus[] = status ? [status as ItemStatus] : [ItemStatus.DAMAGED, ItemStatus.UNDER_REPAIR, ItemStatus.DISPOSED, ItemStatus.LOST];

      const items = await prisma.item.findMany({
        where: { isActive: true, status: { in: statuses } },
        include: {
          category: { select: { name: true } },
          location: { select: { building: true, floor: true, room: true, detail: true } },
        },
        take: 10000,
      });

      return items.map((i) => ({
        Code: i.code,
        Name: i.name,
        Status: i.status,
        Category: i.category.name,
        Location: [i.location?.building, i.location?.floor, i.location?.room, i.location?.detail].filter(Boolean).join(" / "),
      }));
    }

    case "maintenance-schedule": {
      const locationId = params.get("locationId");
      const dateFrom = params.get("dateFrom");
      const dateTo = params.get("dateTo");

      const where: Record<string, unknown> = { isActive: true, nextMaintenanceDate: { not: null } };
      if (dateFrom || dateTo) {
        const dateFilter: Record<string, unknown> = { not: null };
        if (dateFrom) dateFilter.gte = new Date(dateFrom);
        if (dateTo) dateFilter.lte = new Date(dateTo + "T23:59:59");
        where.nextMaintenanceDate = dateFilter;
      }
      if (locationId) where.locationId = locationId;

      const items = await prisma.item.findMany({
        where,
        include: {
          category: { select: { name: true } },
          location: { select: { building: true, floor: true, room: true, detail: true } },
        },
        orderBy: { nextMaintenanceDate: "asc" },
        take: 10000,
      });

      return items.map((i) => ({
        Code: i.code,
        Name: i.name,
        Category: i.category.name,
        Location: [i.location?.building, i.location?.floor, i.location?.room, i.location?.detail].filter(Boolean).join(" / "),
        "Next Maintenance": i.nextMaintenanceDate ? format(i.nextMaintenanceDate, "yyyy-MM-dd") : "",
        "Cycle (months)": i.maintenanceCycleMonths,
        "Last Maintenance": i.lastMaintenanceDate ? format(i.lastMaintenanceDate, "yyyy-MM-dd") : "",
      }));
    }

    case "maintenance-history": {
      const where: Record<string, unknown> = {};
      const dateFrom = params.get("dateFrom");
      const dateTo = params.get("dateTo");
      if (dateFrom || dateTo) {
        where.performedAt = {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
        };
      }
      const maintType = params.get("maintenanceType");
      if (maintType) where.type = maintType;
      const itemId = params.get("itemId");
      if (itemId) where.itemId = itemId;

      const records = await prisma.maintenanceRecord.findMany({
        where,
        include: {
          item: { select: { code: true, name: true } },
          performer: { select: { name: true } },
        },
        orderBy: { performedAt: "desc" },
        take: 10000,
      });

      return records.map((r) => ({
        Date: format(r.performedAt, "yyyy-MM-dd"),
        "Item Code": r.item.code,
        "Item Name": r.item.name,
        Type: r.type,
        Result: r.result,
        Issue: r.issue ?? "",
        Cost: r.cost ?? 0,
        Performer: r.performer.name,
      }));
    }
  }
}

function getColumns(data: Record<string, unknown>[]): { key: string; header: string; width: number }[] {
  if (data.length === 0) return [];
  return Object.keys(data[0]).map((key) => ({
    key,
    header: key,
    width: Math.max(80, key.length * 10 + 20),
  }));
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const type = params.get("type") as ReportType | null;
  const format = params.get("format") as "csv" | "xlsx" | "pdf" | null;

  if (!type || !REPORT_TYPES.includes(type)) {
    return json({ error: "Invalid report type" }, 400);
  }
  if (!format || !["csv", "xlsx", "pdf"].includes(format)) {
    return json({ error: "Invalid format" }, 400);
  }

  const data = await fetchReportData(type, params);
  const filename = `${type}-${new Date().toISOString().slice(0, 10)}`;

  if (format === "csv") return toCsv(data, filename);
  if (format === "xlsx") return toXlsx(data, filename, type);
  return await toPdf(getColumns(data), data, filename, type.replace(/-/g, " ").toUpperCase());
}
