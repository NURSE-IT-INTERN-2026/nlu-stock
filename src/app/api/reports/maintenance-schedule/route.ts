import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams, paginate } from "@/lib/api-utils";
import { effectiveCode } from "@/lib/constants";
import { NextRequest } from "next/server";

// Written-off copies drop off the schedule — a disposed/lost piece has no next round.
const WRITTEN_OFF = ["DISPOSED", "LOST"] as const;

function locationLabel(loc: { building: string | null; floor: string | null; room: string | null; detail: string | null } | null): string {
  return [loc?.building, loc?.floor, loc?.room, loc?.detail].filter(Boolean).join(" / ");
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const { page, perPage, skip, take } = paginate(params);

  const dateFrom = params.get("dateFrom") || undefined;
  const dateTo = params.get("dateTo") || undefined;
  // cascade อาคาร/ชั้น/ห้อง/จุด — ชุดเดียวกับ /api/items เพราะปุ่มที่ส่งมาคือปุ่มตัวเดียวกัน
  const building = params.get("building") || undefined;
  const floor = params.get("floor") || undefined;
  const room = params.get("room") || undefined;
  const detail = params.get("detail") || undefined;

  // Date filter applies to whichever nextMaintenanceDate is the source of truth
  // (sub-item for tracked, item for flat).
  const dateFilter: Record<string, unknown> = { not: null };
  if (dateFrom) dateFilter.gte = new Date(dateFrom);
  if (dateTo) dateFilter.lte = new Date(dateTo + "T23:59:59");

  const locFilter = building || floor || room || detail
    ? { location: { ...(building && { building }), ...(floor && { floor }), ...(room && { room }), ...(detail && { detail }) } }
    : {};

  // ponytail: in-memory merge of the two sources, move to a SQL UNION if it ever grows.
  // Tracked → one row per live copy (source of truth = SubItem dates).
  const [subs, flatItems] = await Promise.all([
    prisma.subItem.findMany({
      where: {
        nextMaintenanceDate: dateFilter,
        status: { notIn: [...WRITTEN_OFF] },
        item: { isActive: true, trackIndividually: true, ...locFilter },
      },
      include: {
        item: {
          select: {
            id: true,
            code: true,
            name: true,
            model: true,
            maintenanceCycleMonths: true,
            category: { select: { id: true, name: true, profileId: true } },
            location: { select: { building: true, floor: true, room: true, detail: true } },
            _count: { select: { subItems: true } },
          },
        },
      },
    }),
    // Flat (non-tracked, e.g. วัสดุคงทน) → one row per item (source of truth = Item dates).
    prisma.item.findMany({
      where: {
        isActive: true,
        trackIndividually: false,
        nextMaintenanceDate: dateFilter,
        ...locFilter,
      },
      include: {
        category: { select: { id: true, name: true, profileId: true } },
        location: { select: { building: true, floor: true, room: true, detail: true } },
      },
    }),
  ]);

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // กำลังบำรุงรักษา wins over the date: the piece is physically at the vendor, so "เกินกำหนด"
  // would be scolding staff for a round that is already under way. It goes back to reading its
  // date the moment the round is recorded and the piece comes off that status.
  const statusOf = (next: Date, status: string) =>
    status === "PENDING_MAINTENANCE"
      ? "in-maintenance"
      : next < now
        ? "overdue"
        : next <= in30Days
          ? "due-soon"
          : "normal";

  type Row = {
    id: string;
    itemId: string;
    subItemId: string | null;
    subCode: string | null;
    code: string;
    name: string;
    model: string;
    categoryName: string;
    // Ids + raw location parts so a client can drive the shared items filter bar off these rows.
    categoryId: string;
    profileId: string;
    building: string;
    floor: string;
    room: string;
    detail: string;
    status: string;
    location: string;
    lastMaintenanceDate: string;
    nextMaintenanceDate: string;
    maintenanceCycleMonths: number;
    maintenanceStatus: string;
    subItemStatus: string | null;
    // ส่งบำรุงรักษาภายนอกเมื่อไหร่ + ส่งไปที่ไหน. เติมเฉพาะแถวที่ยังอยู่ข้างนอก (ดูท้ายไฟล์) —
    // แท็บรับคืนต้องตอบให้ได้ว่า "หายไปกี่วันแล้ว" ซึ่งเป็นเหตุผลเดียวที่ worklist นั้นมีอยู่
    sentAt: string | null;
    sentNote: string | null;
  };

  const trackedRows: Row[] = subs.map((s) => {
    const next = s.nextMaintenanceDate!;
    return {
      id: s.id, // row key = sub-item id
      itemId: s.item.id,
      subItemId: s.id,
      subCode: s.subCode,
      code: effectiveCode(s.item.code, s.subCode, s.item._count.subItems),
      name: s.item.name,
      model: s.item.model ?? "",
      categoryName: s.item.category.name,
      categoryId: s.item.category.id,
      profileId: s.item.category.profileId,
      building: s.item.location?.building ?? "",
      floor: s.item.location?.floor ?? "",
      room: s.item.location?.room ?? "",
      detail: s.item.location?.detail ?? "",
      status: s.status,
      location: locationLabel(s.item.location),
      lastMaintenanceDate: s.lastMaintenanceDate?.toISOString() ?? "",
      nextMaintenanceDate: next.toISOString(),
      maintenanceCycleMonths: s.item.maintenanceCycleMonths,
      maintenanceStatus: statusOf(next, s.status),
      subItemStatus: s.status,
      sentAt: null,
      sentNote: null,
    };
  });

  const flatRows: Row[] = flatItems.map((i) => {
    const next = i.nextMaintenanceDate!;
    return {
      id: i.id,
      itemId: i.id,
      subItemId: null,
      subCode: null,
      code: i.code,
      name: i.name,
      model: i.model ?? "",
      categoryName: i.category.name,
      categoryId: i.category.id,
      profileId: i.category.profileId,
      building: i.location?.building ?? "",
      floor: i.location?.floor ?? "",
      room: i.location?.room ?? "",
      detail: i.location?.detail ?? "",
      status: i.status,
      location: locationLabel(i.location),
      lastMaintenanceDate: i.lastMaintenanceDate?.toISOString() ?? "",
      nextMaintenanceDate: next.toISOString(),
      maintenanceCycleMonths: i.maintenanceCycleMonths,
      maintenanceStatus: statusOf(next, i.status),
      subItemStatus: null,
      sentAt: null,
      sentNote: null,
    };
  });

  const merged = [...trackedRows, ...flatRows].sort(
    (a, b) => new Date(a.nextMaintenanceDate).getTime() - new Date(b.nextMaintenanceDate).getTime(),
  );

  // ของที่อยู่ข้างนอก: หาแถว log ของเที่ยวที่ส่งไป (ล่าสุดของชิ้นนั้น) มาแปะวันที่ส่ง + หมายเหตุ.
  // Only for rows already known to be PENDING_MAINTENANCE, so this is one small query on a
  // handful of ids — an item with a due date is common, one sitting at a vendor is not.
  const out = merged.filter((r) => r.maintenanceStatus === "in-maintenance");
  if (out.length > 0) {
    const logs = await prisma.itemStatusLog.findMany({
      where: {
        newStatus: "PENDING_MAINTENANCE",
        itemId: { in: [...new Set(out.map((r) => r.itemId))] },
      },
      orderBy: { changedAt: "desc" },
      select: { itemId: true, subItemId: true, previousStatus: true, changedAt: true, repairNote: true, reason: true },
    });
    const key = (itemId: string, subItemId: string | null) => `${itemId}|${subItemId ?? ""}`;
    // Two different rows answer two different questions, and แก้ข้อมูลส่งบำรุงรักษา is what
    // splits them: it appends a PENDING_MAINTENANCE → PENDING_MAINTENANCE row to the same trip.
    //   note — the NEWEST row: the latest correction is what is true now.
    //   sentAt — the newest row that ENTERED the status (previousStatus is something else),
    //            i.e. the trip's departure. Reading the newest row here would restart
    //            "ออกไปกี่วันแล้ว" at 0 every time someone fixed a typo.
    const latestNote = new Map<string, (typeof logs)[number]>();
    const departure = new Map<string, (typeof logs)[number]>();
    for (const l of logs) {
      const k = key(l.itemId, l.subItemId);
      if (!latestNote.has(k)) latestNote.set(k, l);
      if (l.previousStatus !== "PENDING_MAINTENANCE" && !departure.has(k)) departure.set(k, l);
    }
    for (const r of out) {
      const k = key(r.itemId, r.subItemId);
      const note = latestNote.get(k);
      const dep = departure.get(k);
      if (dep) r.sentAt = dep.changedAt.toISOString();
      if (note) r.sentNote = note.repairNote ?? note.reason ?? null;
    }
  }

  const total = merged.length;
  const data = merged.slice(skip, skip + take);

  return json({ items: data, page, perPage, total });
}
