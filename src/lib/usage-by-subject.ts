import { prisma } from "@/lib/prisma";
import { USAGE_TYPE_LABELS, stripLegacyRoomNote } from "@/lib/constants";

export type UsageBySubjectRow = {
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
    const isCourse = g.usageType === "COURSE";
    const typeLabel = USAGE_TYPE_LABELS[g.usageType ?? ""] ?? g.usageType ?? "Unknown";
    // A course is identified by its code (the name is a snapshot that can differ between two
    // draws for the same subject); an activity has only its line, so that line is the key.
    const reason = g.usageNote?.trim() || stripLegacyRoomNote(g.notes) || "";
    const key = isCourse ? `COURSE:${g.courseCode ?? ""}` : `${g.usageType}:${reason}`;
    // Legacy rows carry no code and no line — keep them visible in their own bucket rather
    // than dropping them, or historical totals stop reconciling.
    const label = isCourse
      ? g.courseCode
        ? [g.courseCode, g.usageNote].filter(Boolean).join(" — ")
        : `${typeLabel} (ไม่ระบุ)`
      : reason
        ? `${typeLabel} — ${reason}`
        : `${typeLabel} (ไม่ระบุ)`;

    const row = merged.get(key) ?? {
      usageType: g.usageType, courseCode: g.courseCode, label,
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

  const locationIds = [...new Set(groups.map((g) => g.locationId).filter((id): id is string => !!id))];
  const locations = await prisma.location.findMany({
    where: { id: { in: locationIds } },
    select: { id: true, building: true, floor: true, room: true, detail: true },
  });
  const nameOf = new Map(
    locations.map((l) => [l.id, [l.building, l.floor, l.room, l.detail].filter(Boolean).join(" / ")]),
  );

  const merged = new Map<string, UsageBySubjectRow & { items: Set<string> }>();
  for (const g of groups) {
    const key = g.locationId ?? "";
    // แถวเก่าที่เขียนก่อน locationId ถูกบังคับ ยังต้องเห็นได้ ไม่งั้นยอดรวมไม่ตรงกับจำนวนที่นำออกจริง
    const label = (g.locationId && nameOf.get(g.locationId)) || "ไม่ระบุสถานที่";
    const row = merged.get(key) ?? {
      usageType: null, courseCode: null, label,
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
