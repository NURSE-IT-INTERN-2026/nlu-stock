import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import { ItemStatus } from "@/generated/prisma/enums";
import type { UsageType } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { USAGE_TYPE_LABELS, STATUS_LABELS, MAINT_TYPE_LABELS, MAINT_RESULT_LABELS, labelFor, effectiveCode, locationLabel, recipientLabel } from "@/lib/constants";
import { parseDispenseKind, DISPENSE_KIND_LABELS } from "@/lib/dispense-kind";
import { kindWhere } from "@/lib/dispense-kind-where";
import { groupUsageBySubject, groupInUseByLocation } from "@/lib/usage-by-subject";

/** เหตุผล search — the four columns recipientLabel can render from. Always nested under
 *  AND: both callers' `where` already owns `OR` for the NULL-safe loanType pair. */
function recipientOr(q: string): Prisma.DispenseRecordWhereInput {
  const like = { contains: q, mode: "insensitive" as const };
  return { OR: [{ recipient: like }, { courseCode: like }, { usageNote: like }, { notes: like }] };
}

// ponytail: inlined from lib/export-utils — this route is the sole consumer. Report-specific Response builders.
//
// CSV was dropped: it wrote UTF-8 without a BOM, so every Thai name opened as mojibake in
// Excel on Windows — the one place these files actually get opened. xlsx carries its encoding
// inside the file and needs no such ceremony.

// pdfkit's built-in Helvetica is WinAnsi and has no Thai glyphs at all, so every ชื่อพัสดุ,
// ชื่อคน and เหตุผล came out blank. Sarabun is the same face the UI uses. Read once per
// lambda; `new URL(..., import.meta.url)` is what makes Next trace the files into the bundle.
const SARABUN = readFileSync(new URL("./Sarabun-Regular.ttf", import.meta.url));
const SARABUN_BOLD = readFileSync(new URL("./Sarabun-Bold.ttf", import.meta.url));

/** Column widths measured in the real font instead of guessed from character count. Thai runs
 *  far narrower per character than the old `len * 10` assumed, and a header like "ประเภทซ่อม"
 *  is 10 characters of which four are zero-width marks — the guess reserved a column twice the
 *  width it needed while clipping "รายการพัสดุ" values that were genuinely long.
 *  ponytail: samples the first 200 rows, not all of them. */
function measureColumns(data: Record<string, unknown>[]) {
  if (data.length === 0) return [];
  const m = new PDFDocument({ autoFirstPage: false });
  m.registerFont("th", SARABUN);
  m.registerFont("th-bold", SARABUN_BOLD);
  const sample = data.slice(0, 200);

  return Object.keys(data[0]).map((key) => {
    const headerW = m.font("th-bold").fontSize(9).widthOfString(key);
    let bodyW = 0;
    m.font("th").fontSize(8);
    for (const row of sample) {
      const v = row[key];
      if (v === null || v === undefined) continue;
      const w = m.widthOfString(String(v));
      if (w > bodyW) bodyW = w;
    }
    // +12 padding, floored at 50 so a column of "—" is still readable, capped at 220 so one
    // long เหตุผล cannot push the page out to a metre wide.
    return { key, header: key, width: Math.min(220, Math.max(50, Math.ceil(Math.max(headerW, bodyW)) + 12)) };
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
  data: Record<string, unknown>[],
  filename: string,
  title: string,
): Promise<Response> {
  const columns = measureColumns(data);
  const totalWidth = columns.reduce((a, c) => a + c.width, 0);
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

    doc.registerFont("th", SARABUN);
    doc.registerFont("th-bold", SARABUN_BOLD);

    doc.fontSize(16).font("th-bold").text(title, margin, y, {
      width: pageWidth - margin * 2,
      align: "center",
    });
    y += 30;

    function drawHeader() {
      doc.rect(margin, y, pageWidth - margin * 2, headerHeight)
        .fill("#f0f0f0")
        .stroke();
      let x = margin + 4;
      doc.fontSize(9).font("th-bold").fillColor("#333");
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
      doc.fontSize(8).font("th").fillColor("#555");
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

// หัวเรื่องบนไฟล์ PDF — เดิมเป็น type.toUpperCase() ("DISPENSE HISTORY") ซึ่งไม่ตรงกับชื่อ tab
// ที่คนกดปุ่มเห็นอยู่ตรงหน้า.
const REPORT_TITLES: Record<ReportType, string> = {
  "stock-balance": "มูลค่าคงคลัง",
  "dispense-history": "ออกจากคลัง",
  "outstanding-loans": "รายการค้างคืน",
  "receive-history": "เข้าคลัง — นำเข้าคลัง",
  "status-log": "เข้าคลัง — คืนเข้าคลัง",
  "usage-by-subject": "สถิติการใช้งาน",
  "annual-cost": "ค่าใช้จ่ายรายปี",
  "damaged-assets": "ชำรุด & ส่งซ่อม",
  "maintenance-schedule": "ตารางบำรุงรักษา",
  "maintenance-history": "ประวัติบำรุงรักษา",
};

/** ชื่อส่วนของ tab ชำรุด & ส่งซ่อม — slug ลงชื่อไฟล์ (ห้ามมีจุลภาค), label ลงหัวเรื่อง PDF */
const DAMAGE_SEGMENTS: Record<string, { slug: string; label: string }> = {
  DAMAGED: { slug: "damaged", label: "ชำรุด" },
  UNDER_REPAIR: { slug: "under-repair", label: "กำลังซ่อม" },
  "DISPOSED,LOST": { slug: "write-off", label: "ตัดจำหน่าย" },
};

const SIDE_LABELS: Record<string, string> = {
  consumable: "สิ้นเปลือง",
  durable: "คงทน + ครุภัณฑ์",
};

async function fetchReportData(type: ReportType, params: URLSearchParams) {
  switch (type) {
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

      // หน้าจอแยกสิ้นเปลืองกับคงทนคนละฝั่ง ไฟล์จึงต้องแยกตาม — ไม่งั้นกด export จากฝั่งหนึ่ง
      // แล้วได้ทั้งคลัง ซึ่งยอดรวมท้ายไฟล์ไม่ตรงกับการ์ดที่คนกดปุ่มเพิ่งอ่าน.
      const side = params.get("side");
      const scoped = side
        ? items.filter((it) => (it.category.profile?.dispenseType === "CONSUMABLE") === (side === "consumable"))
        : items;

      return scoped.map((it) => {
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

    // One sheet per ชนิดการออกจากคลัง, matching the segment on screen column for column —
    // an export of เบิกใช้ used to carry a สถานะ column reading "เบิกแล้ว" on every row
    // forever, and one of นำไปใช้งาน never said which room the stock went to.
    case "dispense-history": {
      const kind = parseDispenseKind(params.get("kind"));
      const where: Prisma.DispenseRecordWhereInput = { ...kindWhere(kind) };
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
      if (usageType) where.usageType = usageType as UsageType;
      // Mirrors the เหตุผล search box on the tab. Missing here, an Excel exported under a
      // recipient filter would quietly hold every row on screen plus the ones filtered out.
      // Same four columns as api/reports/dispense-history — เหตุผล is derived from the usage.
      const recipient = params.get("recipient")?.trim();
      if (recipient) where.AND = [recipientOr(recipient)];
      // นำไปใช้งาน + "ยังอยู่ข้างนอก" — the only loanStatus this case honours; ยืม + ค้างคืน
      // goes to outstanding-loans instead (see the tab's exportType).
      if (params.get("loanStatus")) where.returnedAt = null;

      const records = await prisma.dispenseRecord.findMany({
        where,
        include: {
          item: { select: { code: true, name: true } },
          staff: { select: { name: true } },
          location: { select: { building: true, floor: true, room: true, detail: true } },
        },
        orderBy: { dispensedAt: "desc" },
        take: 10000,
      });

      return records.map((r) => {
        const head = {
          วันที่: fmtDate(r.dispensedAt, "yyyy-MM-dd HH:mm"),
          รหัสพัสดุ: r.item.code,
          รายการพัสดุ: r.item.name,
          จำนวน: r.quantity,
        };
        // การใช้งาน then เหตุผล, in the order the tab shows them — an Excel whose columns run
        // differently from the screen it was exported from cannot be checked against it.
        // หมายเหตุ is gone: เหตุผล already renders notes for every row that is not a รายวิชา
        // (lib/constants recipientLabel), so the two columns printed one text twice.
        const usageLabel = r.usageType ? (USAGE_TYPE_LABELS[r.usageType] ?? r.usageType) : "—";
        if (kind === "consume") {
          return {
            ...head,
            การใช้งาน: usageLabel,
            เหตุผล: recipientLabel(r) ?? "",
            ผู้เบิก: r.staff.name,
          };
        }
        if (kind === "inuse") {
          return {
            ...head,
            สถานที่: r.location ? locationLabel(r.location) : "ไม่ระบุที่ตั้ง",
            เหตุผล: recipientLabel(r) ?? "",
            ผู้เบิก: r.staff.name,
            สถานะ: r.returnedAt ? "กลับเข้าคลังแล้ว" : "อยู่ที่ห้อง",
          };
        }
        const cond =
          r.returnCondition === "AVAILABLE" ? "คืน-ปกติ"
          : r.returnCondition === "DAMAGED" ? "คืน-ชำรุด"
          : r.returnCondition === "LOST" ? "คืน-สูญหาย"
          : r.returnedAt ? "คืนแล้ว"
          : "ยังไม่คืน";
        return {
          ...head,
          การใช้งาน: usageLabel,
          เหตุผล: recipientLabel(r) ?? "",
          ผู้เบิก: r.staff.name,
          ครบกำหนด: r.dueAt ? fmtDate(r.dueAt, "yyyy-MM-dd") : "",
          สถานะ: cond,
        };
      });
    }

    case "outstanding-loans": {
      const where: Record<string, unknown> = {
        returnedAt: null,
        item: { category: { profile: { dispenseType: { in: ["COUNT", "ITEM"] } } } },
        // Mirrors api/reports/outstanding-loans: only ยืม is owed back — นำไปใช้งาน is
        // stationed indefinitely and เบิกใช้ never comes back at all.
        loanType: "BORROW",
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
      // Same เหตุผล search as the tab — see the note on the dispense-history case.
      const recipient = params.get("recipient")?.trim();
      if (recipient) where.AND = [recipientOr(recipient)];

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

      // The ออกจากคลัง tab sends whichever status it is showing. Without this the sheet
      // exported under "เกินกำหนดคืน" quietly contained every open loan instead.
      const loanStatus = params.get("loanStatus");
      const groups = loanStatus === "overdue"
        ? [...map.values()].filter((recs) => recs.some((r) => r.dueAt && r.dueAt < new Date()))
        : [...map.values()];

      return groups.map((recs) => {
        const head = recs[0];
        const outstanding = recs.reduce((s, r) => s + (r.quantity - r.resolvedQty), 0);
        const due = head.dueAt ? fmtDate(head.dueAt, "yyyy-MM-dd") : "";
        const status = !head.dueAt
          ? "ยังไม่คืน"
          : new Date(head.dueAt) < new Date()
            ? "เกินกำหนด"
            : "ใกล้ครบกำหนด";
        return {
          วันที่: fmtDate(head.dispensedAt, "yyyy-MM-dd HH:mm"),
          เหตุผล: recipientLabel(head) ?? "",
          ผู้เบิก: head.staff.name,
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
        วันที่: fmtDate(r.receivedAt, "yyyy-MM-dd HH:mm"),
        รหัสพัสดุ: r.item.code,
        รายการพัสดุ: r.item.name,
        หมวดหมู่: r.item.category?.name ?? "—",
        ล็อต: r.lot?.lotNumber ?? "—",
        จำนวน: r.quantity,
        // ว่าง = ยังไม่ได้กรอกราคา ไม่ใช่ 0 บาท — ค่าใช้จ่ายรายปีก็ไม่นับใบพวกนี้เหมือนกัน
        "ราคา/หน่วย": r.unitCost ?? "",
        เป็นเงิน: r.unitCost != null ? r.quantity * r.unitCost : "",
        วันหมดอายุ: r.lot?.expiryDate ? fmtDate(r.lot.expiryDate, "yyyy-MM-dd") : "",
        ผู้รับเข้า: r.receiver.name,
        หมายเหตุ: r.notes ?? "",
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
        วันที่: fmtDate(r.changedAt, "yyyy-MM-dd HH:mm"),
        รหัสพัสดุ: r.item.code,
        รายการพัสดุ: r.item.name,
        หมวดหมู่: r.item.category?.name ?? "—",
        "Sub-code": r.subItem?.subCode ?? "",
        จากสถานะ: STATUS_LABELS[r.previousStatus] ?? r.previousStatus,
        เป็นสถานะ: STATUS_LABELS[r.newStatus] ?? r.newStatus,
        เหตุผล: r.reason ?? "",
        ผู้บันทึก: r.changer.name,
      }));
    }

    case "usage-by-subject": {
      // ไฟล์ต้องเป็นชนิดเดียวกับ segment ที่คนกดปุ่มเห็นอยู่ — ไม่กรอง kind แล้วยอด "รายวิชา"
      // จะเป็นเบิกใช้บวกยืมรวมกัน ซึ่งไม่ตรงกับตัวเลขบนจอ (เหตุผลเต็มที่ api/reports/usage-by-subject)
      const kind = parseDispenseKind(params.get("kind"));
      const filters: Record<string, unknown>[] = [kindWhere(kind)];
      const dateFrom = params.get("dateFrom");
      const dateTo = params.get("dateTo");
      if (dateFrom || dateTo) {
        filters.push({
          dispensedAt: {
            ...(dateFrom && { gte: new Date(dateFrom) }),
            ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
          },
        });
      }
      const categoryId = params.get("categoryId");
      // AND, ไม่ใช่ where.item = — kindWhere ถือคีย์ item ของตัวเองอยู่ การเขียนทับจะลบเงื่อนไข
      // dispenseType ของ kind ทิ้งเงียบๆ
      if (categoryId) filters.push({ item: { categoryId } });
      const where = { AND: filters };

      // นำไปใช้งานจัดกลุ่มตามห้อง ไม่ใช่ตามวิชา — หัวคอลัมน์จึงต้องเปลี่ยนตาม ไม่งั้นไฟล์จะพิมพ์
      // ชื่อห้องไว้ใต้หัวข้อ "วิชา / กิจกรรม"
      if (kind === "inuse") {
        const rows = await groupInUseByLocation(where);
        return rows.map((r) => ({
          สถานที่: r.label,
          จำนวนครั้ง: r.records,
          จำนวนหน่วย: r.totalQuantity,
          ชนิดพัสดุ: r.itemCount,
        }));
      }

      const rows = await groupUsageBySubject(where);

      return rows.map((r) => ({
        ประเภทการใช้งาน: USAGE_TYPE_LABELS[r.usageType ?? ""] ?? r.usageType ?? "ไม่ระบุ",
        // Kept as its own column so a spreadsheet can pivot on the code, not just read it
        // out of the combined label.
        รหัสวิชา: r.courseCode ?? "",
        "วิชา / กิจกรรม": r.label,
        จำนวนครั้ง: r.records,
        จำนวนหน่วย: r.totalQuantity,
        ชนิดพัสดุ: r.itemCount,
      }));
    }

    case "annual-cost": {
      const year = Number(params.get("year") || new Date().getFullYear());
      const categoryId = params.get("categoryId");
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year, 11, 31, 23, 59, 59);

      // Mirrors api/reports/annual-cost: one row per receipt, whatever kind of พัสดุ it was.
      // The sheet has to agree with the screen it was exported from, so it reads the same
      // source — not Item.purchasePrice, which holds one price for a thing bought many times.
      const receipts = await prisma.receiveRecord.findMany({
        where: {
          receivedAt: { gte: startOfYear, lte: endOfYear },
          unitCost: { not: null },
          item: { isActive: true, ...(categoryId ? { categoryId } : {}) },
        },
        select: {
          quantity: true, unitCost: true, receivedAt: true,
          lot: { select: { lotNumber: true } },
          item: {
            select: {
              code: true, name: true,
              category: { select: { name: true, profile: { select: { dispenseType: true } } } },
            },
          },
        },
        take: 10000,
      });

      const maintWhere: Record<string, unknown> = {
        performedAt: { gte: startOfYear, lte: endOfYear },
        cost: { not: null },
      };
      if (categoryId) maintWhere.item = { categoryId };

      const repairs = await prisma.maintenanceRecord.findMany({
        where: maintWhere,
        include: { item: { select: { code: true, name: true, category: { select: { name: true } } } }, performer: { select: { name: true } } },
        take: 10000,
      });

      const purchaseRows = receipts.map((r) => ({
        ประเภท:
          r.item.category.profile?.dispenseType === "CONSUMABLE"
            ? "จัดซื้อ — วัสดุสิ้นเปลือง"
            : "จัดซื้อ — ครุภัณฑ์/คงทน",
        รหัสพัสดุ: r.item.code,
        รายการพัสดุ: r.item.name,
        หมวดหมู่: r.item.category.name,
        ล็อต: r.lot?.lotNumber ?? "",
        จำนวน: r.quantity,
        เป็นเงิน: r.quantity * (r.unitCost ?? 0),
        วันที่: fmtDate(r.receivedAt, "yyyy-MM-dd"),
        ผู้ดำเนินการ: "",
      }));

      const repairRows = repairs.map((r) => ({
        ประเภท: "ซ่อมบำรุง",
        รหัสพัสดุ: r.item.code,
        รายการพัสดุ: r.item.name,
        หมวดหมู่: r.item.category.name,
        ล็อต: "",
        จำนวน: 1,
        เป็นเงิน: r.cost ?? 0,
        วันที่: fmtDate(r.performedAt, "yyyy-MM-dd"),
        ผู้ดำเนินการ: r.performer.name,
      }));

      return [...purchaseRows, ...repairRows].sort((a, b) => b.วันที่.localeCompare(a.วันที่));
    }

    case "damaged-assets": {
      const all: ItemStatus[] = [ItemStatus.DAMAGED, ItemStatus.UNDER_REPAIR, ItemStatus.DISPOSED, ItemStatus.LOST];
      // หน้าจอส่งมาเป็นรายการคั่นด้วยจุลภาค ("DISPOSED,LOST") — ไฟล์ต้องได้ชุดเดียวกับที่เห็นอยู่
      const asked = (params.get("status") ?? "").split(",").filter((s) => all.includes(s as ItemStatus)) as ItemStatus[];
      const statuses: ItemStatus[] = asked.length > 0 ? asked : all;
      // มูลค่าประมาณการมีความหมายเฉพาะของที่ตัดออกถาวร ส่วนของที่ยังพังอยู่ยังไม่ได้เสียไปไหน
      const wantsValue = statuses.every((s) => s === ItemStatus.DISPOSED || s === ItemStatus.LOST);

      // เดิม export ไม่อ่านช่วงวันที่เลย ทั้งที่หน้าจอกรองอยู่ — ไฟล์จึงมีแถวที่คนกดปุ่มไม่เห็น
      const dfrom = params.get("dateFrom");
      const dto = params.get("dateTo");
      const dateWhere = dfrom || dto
        ? {
            statusLogs: {
              some: {
                newStatus: { in: statuses },
                changedAt: {
                  ...(dfrom && { gte: new Date(dfrom) }),
                  ...(dto && { lte: new Date(dto + "T23:59:59") }),
                },
              },
            },
          }
        : {};

      // Mirrors api/reports/damaged-assets: match written-off pieces too, one row each.
      const items = await prisma.item.findMany({
        where: {
          isActive: true,
          OR: [{ status: { in: statuses } }, { subItems: { some: { status: { in: statuses } } } }],
          ...dateWhere,
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
          รายการพัสดุ: i.name,
          หมวดหมู่: i.category.name,
          สถานที่: [i.location?.building, i.location?.floor, i.location?.room, i.location?.detail].filter(Boolean).join(" / "),
        };
        // ราคาเก็บที่ระดับรายการ ไม่ใช่รายชิ้น จึงเป็นประมาณการ — ชื่อคอลัมน์บอกไว้ตรงๆ
        const value = wantsValue ? { "มูลค่าประมาณการ": i.purchasePrice ?? "" } : {};
        if (i.subItems.length > 0) {
          return i.subItems.map((s) => ({
            รหัสพัสดุ: effectiveCode(i.code, s.subCode, i._count.subItems),
            รายการพัสดุ: base.รายการพัสดุ,
            สถานะ: STATUS_LABELS[s.status] ?? s.status,
            หมวดหมู่: base.หมวดหมู่,
            สถานที่: base.สถานที่,
            ...value,
          }));
        }
        return [{
          รหัสพัสดุ: i.code,
          รายการพัสดุ: base.รายการพัสดุ,
          สถานะ: STATUS_LABELS[i.status] ?? i.status,
          หมวดหมู่: base.หมวดหมู่,
          สถานที่: base.สถานที่,
          ...value,
        }];
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
        รหัสพัสดุ: i.code,
        รายการพัสดุ: i.name,
        หมวดหมู่: i.category.name,
        สถานที่: [i.location?.building, i.location?.floor, i.location?.room, i.location?.detail].filter(Boolean).join(" / "),
        กำหนดบำรุงครั้งถัดไป: i.nextMaintenanceDate ? fmtDate(i.nextMaintenanceDate, "yyyy-MM-dd") : "",
        "รอบ (เดือน)": i.maintenanceCycleMonths,
        บำรุงครั้งล่าสุด: i.lastMaintenanceDate ? fmtDate(i.lastMaintenanceDate, "yyyy-MM-dd") : "",
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
        วันที่: fmtDate(r.performedAt, "yyyy-MM-dd"),
        รหัสพัสดุ: r.item.code,
        รายการพัสดุ: r.item.name,
        ประเภท: labelFor(MAINT_TYPE_LABELS, r.type),
        ผลการดำเนินการ: labelFor(MAINT_RESULT_LABELS, r.result),
        "อาการ / สิ่งที่ทำ": r.issue ?? "",
        ค่าใช้จ่าย: r.cost ?? 0,
        ผู้ดำเนินการ: r.performer.name,
      }));
    }
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const type = params.get("type") as ReportType | null;
  const format = params.get("format") as "xlsx" | "pdf" | null;

  if (!type || !REPORT_TYPES.includes(type)) {
    return json({ error: "Invalid report type" }, 400);
  }
  if (!format || !["xlsx", "pdf"].includes(format)) {
    return json({ error: "Invalid format" }, 400);
  }

  const data = await fetchReportData(type, params);
  // ออกจากคลัง ships three different sheets under one type, so the kind has to reach the
  // filename and the PDF heading — otherwise all three download as the same name and read
  // as the same report.
  // สองรายงานนี้ส่งออกได้ชนิดละไฟล์ — ถ้าไม่ติดชื่อชนิดไว้ ทั้งสามไฟล์จะโหลดมาชื่อเดียวกันและ
  // อ่านเป็นรายงานเดียวกัน
  const kind = type === "dispense-history" || type === "usage-by-subject"
    ? parseDispenseKind(params.get("kind"))
    : null;
  // เหตุผลเดียวกันกับ kind: มูลค่าคงคลังส่งออกได้สองฝั่ง ชื่อไฟล์กับหัวเรื่องต้องบอกว่าฝั่งไหน
  const side = type === "stock-balance" ? SIDE_LABELS[params.get("side") ?? ""] ?? null : null;
  const segment = type === "damaged-assets" ? DAMAGE_SEGMENTS[params.get("status") ?? ""] ?? null : null;
  const suffix = kind ? `-${kind}` : side ? `-${params.get("side")}` : segment ? `-${segment.slug}` : "";
  const filename = `${type}${suffix}-${new Date().toISOString().slice(0, 10)}`;
  const title = REPORT_TITLES[type]
    + (kind ? ` — ${DISPENSE_KIND_LABELS[kind]}` : side ? ` — ${side}` : segment ? ` — ${segment.label}` : "");

  if (format === "xlsx") return toXlsx(data, filename, type);
  return await toPdf(data, filename, title);
}
