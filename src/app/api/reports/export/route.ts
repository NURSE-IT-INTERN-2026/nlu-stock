import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import { ItemStatus } from "@/generated/prisma/enums";
import { USAGE_TYPE_LABELS, STATUS_LABELS, effectiveCode } from "@/lib/constants";

// ponytail: inlined from lib/export-utils — this route is the sole consumer. Report-specific Response builders.
function toCsv(data: Record<string, unknown>[], filename: string): Response {
  if (data.length === 0) {
    return new Response("", {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          const str = val === null || val === undefined ? "" : String(val);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(","),
    ),
  ];

  return new Response(csvRows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}

function toXlsx(data: Record<string, unknown>[], filename: string, sheetName = "Report"): Response {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
    },
  });
}

async function toPdf(
  columns: { key: string; header: string; width: number }[],
  data: Record<string, unknown>[],
  filename: string,
  title: string,
): Promise<Response> {
  const colWidths = columns.map((c) => c.width);
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const pageWidth = Math.max(totalWidth + 40, 595);
  const margin = 20;

  const pdfBuffer = await new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: [pageWidth, 842],
      margins: { top: margin, bottom: margin, left: margin, right: margin },
      bufferPages: true,
    });

    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const rowHeight = 22;
    const headerHeight = 26;
    let y = margin;

    doc.fontSize(16).font("Helvetica-Bold").text(title, margin, y, {
      width: pageWidth - margin * 2,
      align: "center",
    });
    y += 30;

    function drawHeader() {
      doc.rect(margin, y, pageWidth - margin * 2, headerHeight)
        .fill("#f0f0f0")
        .stroke();
      let x = margin + 4;
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#333");
      for (const col of columns) {
        doc.text(col.header, x, y + 6, { width: col.width - 8, lineBreak: false });
        x += col.width;
      }
      y += headerHeight;
    }

    drawHeader();

    for (const row of data) {
      if (y + rowHeight > 820) {
        doc.addPage();
        y = margin;
        drawHeader();
      }
      let x = margin + 4;
      doc.fontSize(8).font("Helvetica").fillColor("#555");
      for (const col of columns) {
        const val = row[col.key];
        const str = val === null || val === undefined ? "" : String(val);
        doc.text(str, x, y + 5, { width: col.width - 8, lineBreak: false });
        x += col.width;
      }
      y += rowHeight;
    }

    doc.end();
  });

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
    },
  });
}

type ReportType =
  | "stock-summary"
  | "stock-balance"
  | "dispense-history"
  | "outstanding-loans"
  | "receive-history"
  | "status-log"
  | "usage-by-subject"
  | "annual-cost"
  | "damaged-assets"
  | "maintenance-schedule"
  | "maintenance-history";

const REPORT_TYPES: ReportType[] = [
  "stock-summary",
  "stock-balance",
  "dispense-history",
  "outstanding-loans",
  "receive-history",
  "status-log",
  "usage-by-subject",
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
      const profileId = params.get("profileId");
      if (categoryId) where.categoryId = categoryId;
      else if (profileId) where.category = { profileId };

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

    case "stock-balance": {
      const where: Record<string, unknown> = { isActive: true };
      const categoryId = params.get("categoryId");
      const profileId = params.get("profileId");
      if (categoryId) where.categoryId = categoryId;
      else if (profileId) where.category = { profileId };

      const items = await prisma.item.findMany({
        where,
        include: {
          lots: { select: { remainingQty: true, unitCost: true } },
          category: { include: { profile: { select: { dispenseType: true } } } },
          issueUnit: { select: { name: true } },
        },
        orderBy: { code: "asc" },
      });

      return items.map((it) => {
        const isConsumable = it.category.profile?.dispenseType === "CONSUMABLE";
        let value = 0;
        let unitCost: number | null = null;
        if (isConsumable) {
          let totalRemaining = 0;
          for (const lot of it.lots) {
            totalRemaining += lot.remainingQty;
            value += lot.remainingQty * (lot.unitCost ?? 0);
          }
          if (totalRemaining > 0 && value > 0) unitCost = value / totalRemaining;
        } else {
          unitCost = it.purchasePrice ?? null;
          value = it.availableQty * (it.purchasePrice ?? 0);
        }
        return {
          รหัส: it.code,
          ชื่อ: it.name,
          หมวด: it.category.name,
          "คงเหลือ": it.availableQty,
          หน่วย: it.issueUnit.name,
          "ราคา/หน่วย": unitCost ?? "",
          "มูลค่ารวม": value,
        };
      });
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

      return records.map((r) => {
        const cond =
          r.returnCondition === "AVAILABLE" ? "คืน-ปกติ"
          : r.returnCondition === "DAMAGED" ? "คืน-ชำรุด"
          : r.returnCondition === "LOST" ? "คืน-สูญหาย"
          : r.returnedAt ? "คืนแล้ว"
          : "Dispensed";
        return {
          Date: fmtDate(r.dispensedAt, "yyyy-MM-dd HH:mm"),
          "Item Code": r.item.code,
          "Item Name": r.item.name,
          Quantity: r.quantity,
          Staff: r.staff.name,
          Usage: r.usageType ? (USAGE_TYPE_LABELS[r.usageType] ?? r.usageType) : "—",
          "Return Condition": cond,
          Notes: r.notes ?? "",
        };
      });
    }

    case "outstanding-loans": {
      const where: Record<string, unknown> = {
        returnedAt: null,
        item: { category: { profile: { dispenseType: { in: ["COUNT", "ITEM"] } } } },
        // Exclude only per-unit (trackIndividually) INUSE — returned via คืนเข้าพัสดุ.
        // COUNT-type INUSE returns numerically through this screen, keep visible.
        OR: [
          { loanType: null },
          { loanType: "BORROW" },
          { AND: [{ loanType: "INUSE" }, { item: { trackIndividually: false } }] },
        ],
      };
      const dateFrom = params.get("dateFrom");
      const dateTo = params.get("dateTo");
      if (dateFrom || dateTo) {
        where.dispensedAt = {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
        };
      }
      const staffId = params.get("staffId");
      if (staffId) where.staffId = staffId;

      const records = await prisma.dispenseRecord.findMany({
        where,
        include: {
          item: { select: { code: true, name: true } },
          staff: { select: { name: true } },
        },
        orderBy: { dispensedAt: "desc" },
      });

      // Group by loanGroupId (legacy null → each its own) → one row per outstanding loan event.
      const map = new Map<string, typeof records>();
      for (const r of records) {
        const key = r.loanGroupId ?? r.id;
        const g = map.get(key);
        if (g) g.push(r);
        else map.set(key, [r]);
      }

      return [...map.values()].map((recs) => {
        const head = recs[0];
        const outstanding = recs.reduce((s, r) => s + (r.quantity - r.resolvedQty), 0);
        const due = head.dueAt ? fmtDate(head.dueAt, "yyyy-MM-dd") : "";
        const status = !head.dueAt
          ? "ยังไม่คืน"
          : new Date(head.dueAt) < new Date()
            ? "เกินกำหนด"
            : "ใกล้ครบกำหนด";
        return {
          Date: fmtDate(head.dispensedAt, "yyyy-MM-dd HH:mm"),
          ผู้ยืม: head.recipient ?? "",
          Staff: head.staff.name,
          รายการ: recs.length,
          ค้างคืน: outstanding,
          ครบกำหนด: due,
          สถานะ: status,
        };
      });
    }

    case "receive-history": {
      const where: Record<string, unknown> = {};
      const dateFrom = params.get("dateFrom");
      const dateTo = params.get("dateTo");
      if (dateFrom || dateTo) {
        where.receivedAt = {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
        };
      }
      const categoryId = params.get("categoryId");
      if (categoryId) where.item = { categoryId };
      const staffId = params.get("staffId");
      if (staffId) where.receivedBy = staffId;

      const records = await prisma.receiveRecord.findMany({
        where,
        include: {
          item: { select: { code: true, name: true, category: { select: { name: true } } } },
          receiver: { select: { name: true } },
          lot: { select: { lotNumber: true, expiryDate: true } },
        },
        orderBy: { receivedAt: "desc" },
        take: 10000,
      });

      return records.map((r) => ({
        Date: fmtDate(r.receivedAt, "yyyy-MM-dd HH:mm"),
        "Item Code": r.item.code,
        "Item Name": r.item.name,
        Category: r.item.category?.name ?? "—",
        Lot: r.lot?.lotNumber ?? "—",
        Quantity: r.quantity,
        "Expiry Date": r.lot?.expiryDate ? fmtDate(r.lot.expiryDate, "yyyy-MM-dd") : "",
        Receiver: r.receiver.name,
        Notes: r.notes ?? "",
      }));
    }

    case "status-log": {
      const where: Record<string, unknown> = {};
      const from = params.get("from");
      const to = params.get("to");
      if (from) where.previousStatus = from;
      if (to) where.newStatus = to;
      const dateFrom = params.get("dateFrom");
      const dateTo = params.get("dateTo");
      if (dateFrom || dateTo) {
        where.changedAt = {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
        };
      }
      const categoryId = params.get("categoryId");
      if (categoryId) where.item = { categoryId };
      const staffId = params.get("staffId");
      if (staffId) where.changedBy = staffId;

      const records = await prisma.itemStatusLog.findMany({
        where,
        include: {
          item: { select: { code: true, name: true, category: { select: { name: true } } } },
          subItem: { select: { subCode: true } },
          changer: { select: { name: true } },
        },
        orderBy: { changedAt: "desc" },
        take: 10000,
      });

      return records.map((r) => ({
        Date: fmtDate(r.changedAt, "yyyy-MM-dd HH:mm"),
        "Item Code": r.item.code,
        "Item Name": r.item.name,
        Category: r.item.category?.name ?? "—",
        "Sub-code": r.subItem?.subCode ?? "",
        From: STATUS_LABELS[r.previousStatus] ?? r.previousStatus,
        To: STATUS_LABELS[r.newStatus] ?? r.newStatus,
        Reason: r.reason ?? "",
        Changer: r.changer.name,
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
        Date: fmtDate(p.purchaseDate!, "yyyy-MM-dd"),
        By: "",
      }));

      const repairRows = repairs.map((r) => ({
        Type: "Repair",
        Code: r.item.code,
        Name: r.item.name,
        Category: "",
        Cost: r.cost ?? 0,
        Date: fmtDate(r.performedAt, "yyyy-MM-dd"),
        By: r.performer.name,
      }));

      return [...purchaseRows, ...repairRows];
    }

    case "damaged-assets": {
      const status = params.get("status");
      const statuses: ItemStatus[] = status ? [status as ItemStatus] : [ItemStatus.DAMAGED, ItemStatus.UNDER_REPAIR, ItemStatus.DISPOSED, ItemStatus.LOST];

      // Mirrors api/reports/damaged-assets: match written-off pieces too, one row each.
      const items = await prisma.item.findMany({
        where: {
          isActive: true,
          OR: [{ status: { in: statuses } }, { subItems: { some: { status: { in: statuses } } } }],
        },
        include: {
          category: { select: { name: true } },
          location: { select: { building: true, floor: true, room: true, detail: true } },
          _count: { select: { subItems: true } },
          subItems: { where: { status: { in: statuses } }, select: { subCode: true, status: true }, orderBy: { subCode: "asc" } },
        },
        take: 10000,
      });

      return items.flatMap((i) => {
        const base = {
          Name: i.name,
          Category: i.category.name,
          Location: [i.location?.building, i.location?.floor, i.location?.room, i.location?.detail].filter(Boolean).join(" / "),
        };
        if (i.subItems.length > 0) {
          return i.subItems.map((s) => ({
            Code: effectiveCode(i.code, s.subCode, i._count.subItems),
            Name: base.Name,
            Status: s.status,
            Category: base.Category,
            Location: base.Location,
          }));
        }
        return [{ Code: i.code, Name: base.Name, Status: i.status, Category: base.Category, Location: base.Location }];
      });
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
        "Next Maintenance": i.nextMaintenanceDate ? fmtDate(i.nextMaintenanceDate, "yyyy-MM-dd") : "",
        "Cycle (months)": i.maintenanceCycleMonths,
        "Last Maintenance": i.lastMaintenanceDate ? fmtDate(i.lastMaintenanceDate, "yyyy-MM-dd") : "",
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
        Date: fmtDate(r.performedAt, "yyyy-MM-dd"),
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
