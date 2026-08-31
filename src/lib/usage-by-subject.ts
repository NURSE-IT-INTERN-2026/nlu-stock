import { prisma } from "@/lib/prisma";
import { USAGE_TYPE_LABELS, stripLegacyRoomNote, locationLabel } from "@/lib/constants";
import { monthKey, monthRange } from "@/lib/format";
import {
  USAGE_GROUPS, USAGE_GROUP_LABELS,
  type UsageGroup, type UsageMonth, type UsageMonthGroup, type UsageMonthItem, type UsageMonthRow,
} from "@/lib/usage-groups";

export type UsageBySubjectRow = {
  /** identity เดียวกับ row ในต้นไม้รายเดือน (subjectIdentity / locationId) — หน้าจอใช้ค่านี้
   *  join ตารางเข้ากับรายละเอียดรายเดือน แทนที่จะเดาจากชื่อที่แสดงผล */
  key: string;
  usageType: string | null;
  courseCode: string | null;
  label: string;
  totalQuantity: number;
  /** how many times stock was drawn for this subject — a single 100-unit draw and a hundred
   *  1-unit draws look identical on quantity alone, and they mean very different things */
  records: number;
  /** distinct พัสดุ used, so a subject that burns one item heavily reads apart from one that
   *  touches the whole storeroom */
  itemCount: number;
};

type SubjectSource = {
  usageType: string | null;
  courseCode: string | null;
  usageNote: string | null;
  notes: string | null;
};

/** The identity of one subject/activity, derived in one place so the monthly breakdown and
 *  the whole-range table can never name (or split) the same subject differently.
 *
 *  A course is identified by its code — the name is a snapshot that can differ between two
 *  draws for the same subject; an activity has only its free-text line, so that line is the
 *  key. Legacy rows carry neither and keep their own "(ไม่ระบุ)" bucket rather than being
 *  dropped, or historical totals stop reconciling. */
function subjectIdentity(g: SubjectSource): { key: string; label: string } {
  const isCourse = g.usageType === "COURSE";
  const typeLabel = USAGE_TYPE_LABELS[g.usageType ?? ""] ?? g.usageType ?? "Unknown";
  const reason = g.usageNote?.trim() || stripLegacyRoomNote(g.notes) || "";
  const key = isCourse ? `COURSE:${g.courseCode ?? ""}` : `${g.usageType}:${reason}`;
  const label = isCourse
    ? g.courseCode
      ? [g.courseCode, g.usageNote].filter(Boolean).join(" — ")
      : `${typeLabel} (ไม่ระบุ)`
    : reason
      ? `${typeLabel} — ${reason}`
      : `${typeLabel} (ไม่ระบุ)`;
  return { key, label };
}

/** Usage totals split per subject — the whole point of the report is "which subject used
 *  what", which one lumped รายวิชา or กิจกรรม bucket cannot answer. usageNote carries the
 *  reason for every usage type: the course name as it read at dispense time for COURSE, the
 *  free-text line for ACTIVITY/OTHER.
 *
 *  Rows written before ACTIVITY/OTHER moved that line into usageNote are read out of notes
 *  instead of migrated, so they name their activity here exactly as the report's เหตุผล
 *  column does. Only rows that never carried a line at all fall into a "(ไม่ระบุ)" bucket.
 *
 *  Shared by the report route and the export route so the two cannot drift into disagreeing
 *  about the same numbers. */
export async function groupUsageBySubject(where: Record<string, unknown>): Promise<UsageBySubjectRow[]> {
  // itemId is in the grouping only so distinct items can be counted per subject; the rows are
  // merged back down to one per subject below.
  const groups = await prisma.dispenseRecord.groupBy({
    // notes is here for one reason: it is where ACTIVITY/OTHER used to write their line, and
    // the เหตุผล column on the report still falls back to it (lib/constants recipientLabel).
    // Without it those rows would read as a named activity in the table and as one anonymous
    // "กิจกรรม" lump here — the same draw described two ways in two tabs.
    by: ["usageType", "courseCode", "usageNote", "notes", "itemId"],
    where: { ...where, usageType: { not: null } },
    _sum: { quantity: true },
    _count: { _all: true },
  });

  // A course renamed between two dispenses lands in two groups under one code. Merge on the
  // key so the report shows one row per subject, and let the first snapshot name it.
  const merged = new Map<string, UsageBySubjectRow & { items: Set<string> }>();
  for (const g of groups) {
    const { key, label } = subjectIdentity(g);

    const row = merged.get(key) ?? {
      key, usageType: g.usageType, courseCode: g.courseCode, label,
      totalQuantity: 0, records: 0, itemCount: 0, items: new Set<string>(),
    };
    row.totalQuantity += g._sum.quantity ?? 0;
    row.records += g._count._all;
    row.items.add(g.itemId);
    merged.set(key, row);
  }

  return [...merged.values()]
    .map(({ items, ...r }) => ({ ...r, itemCount: items.size }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity);
}

/**
 * ต้นทุนของสิ้นเปลืองที่เบิกไป แยกตามวิชา/กิจกรรม — "ปีนี้วิชาไหนกินของไปเท่าไร".
 *
 * ค่าใช้จ่ายรายปีเดิมตอบได้แค่ว่าคลังจ่ายเงินซื้ออะไรเข้ามา ซึ่งเป็นคำถามของคนซื้อ ไม่ใช่ของคนที่
 * ต้องตั้งงบให้แต่ละวิชา. ของที่ซื้อเข้ามาปีนี้กับของที่ถูกใช้ไปปีนี้เป็นคนละก้อนเงินโดยสิ้นเชิง.
 *
 * ตีราคาแบบเดียวกับฝั่งสิ้นเปลืองของ stockValueRows: ล็อตที่เบิกออกไปจริงก่อน แล้วตกไปที่ราคา
 * เฉลี่ยของรายการ. หน่วยที่ไม่มีทั้งสองอย่างนับแยกไว้ที่ unpricedQty ไม่ใช่คิดเป็น 0 บาท —
 * ราคาที่ยังไม่มีใครกรอกไม่ใช่ของฟรี.
 */
export type SubjectCostRow = {
  key: string;
  label: string;
  courseCode: string | null;
  qty: number;
  value: number;
  /** จำนวนหน่วยที่ตีราคาไม่ได้เลย จึงไม่อยู่ใน value */
  unpricedQty: number;
  records: number;
  itemCount: number;
};

export async function consumableCostBySubject(
  where: Record<string, unknown>,
): Promise<SubjectCostRow[]> {
  const records = await prisma.dispenseRecord.findMany({
    where,
    select: {
      quantity: true,
      usageType: true,
      courseCode: true,
      usageNote: true,
      notes: true,
      itemId: true,
      lot: { select: { unitCost: true } },
      item: { select: { purchasePrice: true } },
    },
  });

  const merged = new Map<string, SubjectCostRow & { items: Set<string> }>();
  for (const r of records) {
    // แถวที่ไม่ได้เลือกการใช้งานต้องมีที่อยู่ ไม่งั้นยอดรวมของตารางไม่เท่ากับที่เบิกจริง
    const { key, label } = r.usageType
      ? subjectIdentity(r)
      : { key: "NONE", label: "ไม่ระบุการใช้งาน" };

    const row = merged.get(key) ?? {
      key, label, courseCode: r.usageType === "COURSE" ? r.courseCode : null,
      qty: 0, value: 0, unpricedQty: 0, records: 0, itemCount: 0, items: new Set<string>(),
    };
    const price = r.lot?.unitCost ?? r.item.purchasePrice;
    row.qty += r.quantity;
    if (price == null) row.unpricedQty += r.quantity;
    else row.value += r.quantity * price;
    row.records += 1;
    row.items.add(r.itemId);
    merged.set(key, row);
  }

  return [...merged.values()]
    .map(({ items, ...r }) => ({ ...r, itemCount: items.size }))
    .sort((a, b) => b.value - a.value || b.qty - a.qty);
}

/**
 * นำไปใช้งาน = ของที่ **ตั้งอยู่ตอนนี้** ไม่ใช่เหตุการณ์ที่เคยเกิด.
 *
 * segment นี้เคยนับใบตั้งตามช่วงเวลาเหมือนอีกสอง segment ซึ่งตอบคำถามผิดข้อ: ของที่ตั้งไว้ปีที่แล้ว
 * และยังอยู่ในห้องนั้นวันนี้หายไปจากรายงานทันทีที่ตัวกรองเป็น "ปีนี้" ทั้งที่มันคือของที่ยังไม่กลับคลัง.
 * คำถามจริงคือ "ตอนนี้ของอยู่ไหนบ้าง" — เป็นภาพนิ่ง ไม่มีแกนเวลา จึงไม่รับตัวกรองช่วงวันที่.
 *
 * นับเฉพาะใบที่ยังเปิด (returnedAt = null) และเหลือของจริง (quantity − resolvedQty > 0) —
 * เกณฑ์เดียวกับ lib/distribution.ts countedRows ที่หน้าพัสดุใช้แจกแจงที่ตั้ง.
 *
 * โครงเป็น อาคาร → ห้อง → พัสดุ ตามรูป UsageMonthGroup เป๊ะ เพื่อให้ UsageDetailDialog ตัวเดิม
 * รับได้โดยไม่ต้องมีกล่องรายละเอียดคนละใบ.
 */
export type InUseSnapshot = {
  /** หนึ่งแถวต่อห้อง — ตารางบนหน้าจอและไฟล์ export อ่านชุดนี้ */
  rows: UsageBySubjectRow[];
  /** อาคาร → ห้อง → พัสดุ — กราฟและกล่องรายละเอียดอ่านชุดนี้ */
  buildings: UsageMonthGroup[];
};

export async function groupInUseSnapshot(
  where: Record<string, unknown>,
): Promise<InUseSnapshot> {
  const records = await prisma.dispenseRecord.findMany({
    where: { ...where, returnedAt: null },
    select: {
      quantity: true,
      resolvedQty: true,
      locationId: true,
      item: { select: { id: true, code: true, name: true, issueUnit: { select: { name: true } } } },
    },
  });

  const ids = [...new Set(records.map((r) => r.locationId).filter((id): id is string => !!id))];
  const locations = ids.length
    ? await prisma.location.findMany({
        where: { id: { in: ids } },
        select: { id: true, building: true, floor: true, room: true, detail: true },
      })
    : [];
  const placeOf = new Map(locations.map((l) => [l.id, l]));

  type RoomAcc = Omit<UsageMonthRow, "items"> & { items: Map<string, UsageMonthItem> };
  type BuildingAcc = Omit<UsageMonthGroup, "rows"> & { rows: Map<string, RoomAcc> };
  const buildings = new Map<string, BuildingAcc>();

  for (const r of records) {
    const qty = r.quantity - r.resolvedQty;
    if (qty <= 0) continue;

    const place = r.locationId ? placeOf.get(r.locationId) : undefined;
    // แถวเก่าที่เขียนก่อนระบบบังคับให้เลือกห้องยังต้องเห็น ไม่งั้นยอดรวมไม่เท่ากับของที่ออกไปจริง
    const buildingKey = place ? `${place.building}|${place.floor}` : "";
    const buildingLabel = place
      ? [place.building, place.floor].filter(Boolean).join(" / ")
      : "ไม่ระบุสถานที่";
    const roomKey = r.locationId ?? "";
    const roomLabel = place ? locationLabel(place) : "ไม่ระบุสถานที่";

    const building = buildings.get(buildingKey) ?? {
      group: buildingKey, label: buildingLabel, records: 0, totalQuantity: 0, rows: new Map(),
    };
    buildings.set(buildingKey, building);
    building.records += 1;
    building.totalQuantity += qty;

    const room = building.rows.get(roomKey) ?? {
      key: roomKey, label: roomLabel, records: 0, totalQuantity: 0, items: new Map(),
    };
    building.rows.set(roomKey, room);
    room.records += 1;
    room.totalQuantity += qty;

    const entry = room.items.get(r.item.id) ?? {
      code: r.item.code, name: r.item.name, unit: r.item.issueUnit.name, quantity: 0, records: 0,
    };
    entry.quantity += qty;
    entry.records += 1;
    room.items.set(r.item.id, entry);
  }

  const grouped = [...buildings.values()]
    .map((b) => ({
      ...b,
      rows: [...b.rows.values()]
        .map((r) => ({ ...r, items: [...r.items.values()].sort((a, z) => z.quantity - a.quantity) }))
        .sort((a, z) => z.totalQuantity - a.totalQuantity),
    }))
    .sort((a, z) => z.totalQuantity - a.totalQuantity);

  // ตารางเป็นรายห้อง — itemCount คือ "ห้องนี้มีของกี่ชนิด" ตรงกับหัวคอลัมน์ที่ใช้ร่วมกับอีกสอง segment
  const rows: UsageBySubjectRow[] = grouped
    .flatMap((b) => b.rows)
    .map((r) => ({
      key: r.key,
      usageType: null,
      courseCode: null,
      label: r.label,
      totalQuantity: r.totalQuantity,
      records: r.records,
      itemCount: r.items.length,
    }))
    .sort((a, z) => z.totalQuantity - a.totalQuantity);

  return { rows, buildings: grouped };
}

// ─── Monthly breakdown ───────────────────────────────────────────────────────────────────
//
// "วิชาไหนใช้มากที่สุด" ตอบได้แล้วจากตารางข้างบน แต่คำถามที่รายงานจริงต้องตอบคือ "เดือนไหนใช้เยอะ
// และเดือนนั้นเป็นของวิชา กิจกรรม หรืออื่นๆ" — ยอดรวมทั้งช่วงกลบฤดูกาลของคลังทิ้งหมด (เปิดเทอม
// ใช้หนัก ปิดเทอมเงียบ) แล้วอ่านเป็นเส้นแบนเส้นเดียว.
//
// สามระดับ: เดือน → กลุ่มการใช้งาน (วิชา / กิจกรรม / อื่นๆ / ไม่ระบุ) → รายวิชาหรือกิจกรรม →
// รายการพัสดุ. ทั้งต้นไม้ส่งกลับไปในก้อนเดียว เพราะการกดดูรายละเอียดของเดือนต้องตอบทันที ไม่ใช่
// รอ fetch อีกรอบต่อหนึ่งเดือนที่กด.

type ItemLite = { id: string; code: string; name: string; issueUnit: { name: string } };

type RowAcc = Omit<UsageMonthRow, "items"> & { items: Map<string, UsageMonthItem> };
type GroupAcc = Omit<UsageMonthGroup, "rows"> & { rows: Map<string, RowAcc> };
type MonthAcc = Omit<UsageMonth, "groups"> & { groups: Map<string, GroupAcc> };

function bump(t: { records: number; totalQuantity: number }, qty: number) {
  t.records += 1;
  t.totalQuantity += qty;
}

/**
 * เดือน → กลุ่ม → วิชา/กิจกรรม → พัสดุ.
 *
 * เบิกใช้กับยืมเท่านั้น. นำไปใช้งานเคยเดินผ่านที่นี่ด้วย (mode = "location") แต่มันไม่ใช่บัญชี
 * เหตุการณ์รายเดือน — มันคือภาพนิ่งว่าตอนนี้ของอยู่ห้องไหน ซึ่งไปอยู่ที่ groupInUseSnapshot แล้ว.
 *
 * ponytail: อ่านแถวดิบมานับใน JS ไม่ใช่ GROUP BY date_trunc ใน SQL — คลังนี้มีราวสามพันแถวต่อปี
 * และการนับใน JS ใช้ `where` ก้อนเดียวกับที่ทุกส่วนของ report นี้ใช้ จึงไม่มีทางนับคนละชุดกับ
 * ตารางที่อยู่ข้างๆ. ถ้าตารางนี้โตถึงหลักแสนแถวค่อยย้ายไป date_trunc.
 */
export async function groupUsageByMonth(where: Record<string, unknown>): Promise<UsageMonth[]> {
  const records = await prisma.dispenseRecord.findMany({
    where,
    select: {
      dispensedAt: true,
      quantity: true,
      usageType: true,
      courseCode: true,
      usageNote: true,
      notes: true,
      item: { select: { id: true, code: true, name: true, issueUnit: { select: { name: true } } } },
    },
  });

  const months = new Map<string, MonthAcc>();

  for (const r of records) {
    const item = r.item as ItemLite;
    const month = months.get(monthKey(r.dispensedAt)) ?? {
      month: monthKey(r.dispensedAt), records: 0, totalQuantity: 0, groups: new Map(),
    };
    months.set(month.month, month);
    bump(month, r.quantity);

    const [groupKey, rowKey, rowLabel] = (() => {
      const g = r.usageType ?? "NONE";
      if (g === "NONE") return ["NONE", "NONE", "ไม่ระบุการใช้งาน"];
      const { key, label } = subjectIdentity(r);
      return [g, key, label];
    })();

    const group = month.groups.get(groupKey) ?? {
      group: groupKey, label: USAGE_GROUP_LABELS[groupKey] ?? groupKey,
      records: 0, totalQuantity: 0, rows: new Map(),
    };
    month.groups.set(groupKey, group);
    bump(group, r.quantity);

    const row = group.rows.get(rowKey) ?? {
      key: rowKey, label: rowLabel, records: 0, totalQuantity: 0, items: new Map(),
    };
    group.rows.set(rowKey, row);
    bump(row, r.quantity);

    const entry = row.items.get(item.id) ?? {
      code: item.code, name: item.name, unit: item.issueUnit.name, quantity: 0, records: 0,
    };
    entry.quantity += r.quantity;
    entry.records += 1;
    row.items.set(item.id, entry);
  }

  if (months.size === 0) return [];

  // เดือนที่ไม่มีการเบิกเลยต้องมีแท่งศูนย์ ไม่ใช่หายไปจากแกน — ช่องว่างบนแกนเวลาอ่านเป็น
  // "ยังไม่มีข้อมูล" ทั้งที่แปลว่า "เดือนนั้นไม่ได้ใช้ของ"
  const keys = [...months.keys()].sort();
  return monthRange(keys[0], keys[keys.length - 1]).map((month) => {
    const acc = months.get(month);
    if (!acc) return { month, records: 0, totalQuantity: 0, groups: [] };
    return {
      month: acc.month,
      records: acc.records,
      totalQuantity: acc.totalQuantity,
      groups: [...acc.groups.values()]
        // ลำดับคงที่ตาม USAGE_GROUPS ไม่ใช่ตามยอด — สีของซีรีส์ในกราฟต้องหมายถึงกลุ่มเดิม
        // ทุกเดือน ไม่งั้นแท่งเดือนหนึ่งกับอีกเดือนสีเดียวกันคนละความหมาย
        .sort((a, b) => USAGE_GROUPS.indexOf(a.group as UsageGroup) - USAGE_GROUPS.indexOf(b.group as UsageGroup))
        .map((g) => ({
          ...g,
          rows: [...g.rows.values()]
            .map((r) => ({
              ...r,
              items: [...r.items.values()].sort((a, b) => b.quantity - a.quantity),
            }))
            .sort((a, b) => b.totalQuantity - a.totalQuantity),
        })),
    };
  });
}
