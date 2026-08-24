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


/** id → "อาคาร / ชั้น / ห้อง / รายละเอียด", for the two groupers that bucket by room. */
async function locationNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const locations = await prisma.location.findMany({
    where: { id: { in: unique } },
    select: { id: true, building: true, floor: true, room: true, detail: true },
  });
  return new Map(locations.map((l) => [l.id, locationLabel(l)]));
}

/**
 * นำไปใช้งาน ไม่มีวิชาให้จัดกลุ่ม — station-in-room-dialog ถามแค่ห้อง และ validators/dispense
 * ยกเว้น usageType ให้ INUSE โดยตั้งใจ (ห้องคือเหตุผลอยู่แล้ว). แกนที่แยกแถวพวกนี้ออกจากกันได้
 * จริงจึงเป็นสถานที่ ไม่ใช่ usageType — จัดกลุ่มด้วย usageType จะได้แท่งเดียวที่ไม่บอกอะไร.
 *
 * รูปแถวเหมือน UsageBySubjectRow ทุกช่อง เพื่อให้ตาราง กราฟ และไฟล์ export ตัวเดียวกันรับได้
 * ทั้งสามส่วนโดยไม่ต้องมีโค้ดคนละชุด.
 */
export async function groupInUseByLocation(where: Record<string, unknown>): Promise<UsageBySubjectRow[]> {
  // itemId อยู่ในคีย์เพื่อจะนับชนิดพัสดุต่อห้องเท่านั้น แล้วยุบกลับเป็นห้องละแถวข้างล่าง
  const groups = await prisma.dispenseRecord.groupBy({
    by: ["locationId", "itemId"],
    where,
    _sum: { quantity: true },
    _count: { _all: true },
  });

  const nameOf = await locationNames(groups.map((g) => g.locationId));

  const merged = new Map<string, UsageBySubjectRow & { items: Set<string> }>();
  for (const g of groups) {
    const key = g.locationId ?? "";
    // แถวเก่าที่เขียนก่อน locationId ถูกบังคับ ยังต้องเห็นได้ ไม่งั้นยอดรวมไม่ตรงกับจำนวนที่นำออกจริง
    const label = (g.locationId && nameOf.get(g.locationId)) || "ไม่ระบุสถานที่";
    const row = merged.get(key) ?? {
      key, usageType: null, courseCode: null, label,
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
 * เดือน → กลุ่ม → วิชา/กิจกรรม/ห้อง → พัสดุ.
 *
 * mode = "location" คือ นำไปใช้งาน ซึ่งไม่มี usageType (validators/dispense ยกเว้นให้โดยตั้งใจ)
 * — กลุ่มจึงเหลือกลุ่มเดียวและห้องไปเป็นแถวข้างใน แทนที่จะเป็นซีรีส์ในกราฟห้องละสี ซึ่งพอมี
 * สิบห้องก็อ่านไม่ออกแล้ว.
 *
 * ponytail: อ่านแถวดิบมานับใน JS ไม่ใช่ GROUP BY date_trunc ใน SQL — คลังนี้มีราวสามพันแถวต่อปี
 * และการนับใน JS ใช้ `where` ก้อนเดียวกับที่ทุกส่วนของ report นี้ใช้ จึงไม่มีทางนับคนละชุดกับ
 * ตารางที่อยู่ข้างๆ. ถ้าตารางนี้โตถึงหลักแสนแถวค่อยย้ายไป date_trunc.
 */
export async function groupUsageByMonth(
  where: Record<string, unknown>,
  mode: "usage" | "location",
): Promise<UsageMonth[]> {
  const records = await prisma.dispenseRecord.findMany({
    where,
    select: {
      dispensedAt: true,
      quantity: true,
      usageType: true,
      courseCode: true,
      usageNote: true,
      notes: true,
      locationId: true,
      item: { select: { id: true, code: true, name: true, issueUnit: { select: { name: true } } } },
    },
  });

  const nameOf = mode === "location"
    ? await locationNames(records.map((r) => r.locationId))
    : new Map<string, string>();

  const months = new Map<string, MonthAcc>();

  for (const r of records) {
    const item = r.item as ItemLite;
    const month = months.get(monthKey(r.dispensedAt)) ?? {
      month: monthKey(r.dispensedAt), records: 0, totalQuantity: 0, groups: new Map(),
    };
    months.set(month.month, month);
    bump(month, r.quantity);

    const [groupKey, rowKey, rowLabel] = mode === "location"
      ? ["INUSE", r.locationId ?? "", (r.locationId && nameOf.get(r.locationId)) || "ไม่ระบุสถานที่"]
      : (() => {
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
