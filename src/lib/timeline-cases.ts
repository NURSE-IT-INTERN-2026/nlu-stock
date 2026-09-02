// แจ้งชำรุด → ส่งซ่อม → (แก้ข้อมูล) → รับคืนจากซ่อม คืองานเดียว แต่ถูกเขียนลงคนละตาราง แล้วโผล่ในไทม์ไลน์
// เป็นคนละแถวห่างกันเป็นสัปดาห์ — คนอ่านต้องประกอบเองว่าแถวไหนของทริปไหน. A trip is that assembly,
// done once here where the links live, so the screen can print it as one thing.
//
// Paging counts units, not rows: a trip is one unit however many steps it holds, so a card can
// never be cut in half by a page boundary.

/** The shape of a timeline row this module needs. The history route's event type is a superset. */
export type TripStep = {
  id: string;
  type: string;
  date: Date;
  qty: number | null;
  cost?: number | null;
  attachments?: { urls: string[] }[];
  details: Record<string, unknown>;
};

export type TimelineCase<T extends TripStep = TripStep> = {
  kind: "trip";
  /** The case's source row id — the same identity src/lib/cases.ts uses, so the two agree. */
  id: string;
  /** ประเภทที่ใช้แสดงผล — route เขียนทับด้วยประเภทจริงจาก src/lib/cases.ts หลังจับกลุ่มเสร็จ. */
  caseType: string;
  /** RC-2569-0142 and its สถานะ. Both filled in by the route from src/lib/cases.ts — the same
   *  words /cases prints, because a case that reads "ปิดงานแล้ว" here and "ซ่อมเสร็จ" there is
   *  two cases as far as the reader is concerned. */
  code: string;
  statusLabel: string;
  /** เคสนี้เรื่องอะไร — บรรทัดที่คนอ่าน. รหัสเป็นเลขอ้างอิง ดู src/lib/cases.ts. */
  subject: string;
  /** ชิ้นไหนของรายการนี้ (C01) — null บนของที่ไม่ได้ติดตามรายชิ้น. เติมโดย route จาก cases.ts. */
  subCode: string | null;
  /** Where the trip sits in the desc timeline — its newest step. */
  date: Date;
  openedAt: Date;
  closedAt: Date | null;
  done: boolean;
  qty: number | null;
  cost: number | null;
  attachments: number;
  steps: T[];
};

/** One แจ้งชำรุด booking on qty stock: opens the trip, and is what รับคืนจากซ่อม closes. */
export type Booking = { openedAt: Date; closedAt: Date | null; qty: number };

// A trip needs at least two rows to be worth a card — a lone แจ้งชำรุด with nothing after it is
// still just one event, and boxing it would add a frame that says nothing.
//
// เกณฑ์นี้ใช้กับเคสที่ต้อง**เดา**สมาชิกเท่านั้น (งานซ่อม): แถวเดียวโดดๆ อาจเป็นเศษของทริปที่จับคู่
// ไม่ได้ การตีกรอบให้มันคือการรับประกันเรื่องที่ยังไม่รู้. เคสที่ชี้ตัวเองมาแล้ว (`known` — ยืม/
// ตั้งใช้/เบิก บอกผ่าน dispense record ของมันเอง) ไม่มีอะไรให้เดา แถวแรกก็เป็นเคสเต็มใบตั้งแต่
// วินาทีที่มันเกิด — และเป็นใบเดียวกับที่ /cases เปิดอยู่แล้ว. ก่อนหน้านี้เกณฑ์นี้กินทั้งสองแบบ
// ผลคือการยืมที่ยังไม่คืนสักชิ้น (ค้างอยู่ = ใบที่คนตามหา) กลับเป็นแถวเปล่าไม่มีเลขเคส ส่วนใบที่
// คืนครบแล้วได้การ์ด — สลับกับที่ควรเป็น.
const MIN_TRIP_STEPS = 2;

function buildTrip<T extends TripStep>(
  id: string,
  caseType: string,
  steps: T[],
  closingIds: Set<string>,
  booking?: Booking,
): TimelineCase<T> {
  // steps arrive newest-first, same as the timeline.
  const newest = steps[0];
  const oldest = steps[steps.length - 1];
  // Whether the trip is closed is a fact the booking holds outright: รับคืนจากซ่อม stamps
  // `recoveredAt` on it. Reading it only off the closing STEP would call every pre-repairBookingId
  // trip "ยังไม่ปิด" — those closing rows exist but cannot be linked, and printing a finished
  // repair as still open is a worse lie than leaving its last row standing on its own.
  const closingStep = steps.find((s) => s.type === "REPAIR_RETURN" || closingIds.has(s.id));
  const done = !!closingStep || !!booking?.closedAt;
  const cost = steps.reduce((sum, s) => sum + (s.cost ?? 0), 0);
  const urls = new Set<string>();
  for (const s of steps) for (const g of s.attachments ?? []) for (const u of g.urls) urls.add(u);
  // The list arrives newest-first like the table it came from. Inside the card it is turned
  // round: แจ้งชำรุด → ส่งซ่อม → รับคืน is a sequence someone reads top to bottom, and reading a
  // repair backwards is most of why the old grouping was hard to follow.
  const ordered = [...steps].reverse();
  return {
    kind: "trip",
    id,
    caseType,
    code: "",
    statusLabel: "",
    subCode: null,
    subject: "",
    date: newest.date,
    openedAt: oldest.date,
    closedAt: closingStep?.date ?? booking?.closedAt ?? null,
    done,
    // The count the trip is about is the one it opened with; รับคืน may hand back fewer.
    qty: oldest.qty,
    cost: cost > 0 ? cost : null,
    attachments: urls.size,
    steps: ordered,
  };
}

/**
 * Fold the rows of one repair into a single unit. `events` must be newest-first.
 *
 * Two paths, two ways of linking, because that is how the data is written:
 *
 *  - qty stock — the แจ้งชำรุด StockAdjustment IS the trip, and the closing รับคืนจากซ่อม row
 *    names it through MaintenanceRecord.repairBookingId. Exact, no guessing.
 *  - tracked pieces — a piece has one status, so its repair rows are strictly sequential:
 *    →ชำรุด / ส่งซ่อม open, the CORRECTIVE maintenance record closes. Also exact.
 *
 * The one row with no link either way is the qty ส่งซ่อม (and its แก้ข้อมูล edits): it is an
 * ItemStatusLog with no FK back to the booking it belongs to. It is placed by the booking's own
 * window, narrowed by qty when more than one booking is open at that moment — and left OUT of
 * every trip when that still does not single one out. A row shown under the wrong trip is worse
 * than a row shown on its own, so ambiguity falls back to standalone rather than to a guess.
 */
export function groupTimelineCases<T extends TripStep>(
  events: T[],
  bookings: Map<string, Booking>,
  closedBy: Map<string, string>,
  /**
   * Cases whose membership the caller already knows — a ยืม group names itself through
   * loanGroupId, so there is nothing to infer. Repairs are the only kind that has to be
   * reconstructed, which is what the rest of this function does.
   */
  known?: (e: T) => { key: string; type: string; done: boolean } | null,
): (T | TimelineCase<T>)[] {
  const tripOf = new Map<string, string>(); // event id → case id
  const typeOf = new Map<string, string>();
  const doneIds = new Set<string>();
  /** เคสที่ผู้เรียกชี้มาเอง — ไม่ต้องผ่านเกณฑ์จำนวนขั้นตอน. */
  const knownIds = new Set<string>();
  const closingIds = new Set(closedBy.values());

  if (known) {
    for (const e of events) {
      const k = known(e);
      if (!k) continue;
      tripOf.set(e.id, k.key);
      typeOf.set(k.key, k.type);
      knownIds.add(k.key);
      if (k.done) doneIds.add(k.key);
    }
  }

  // qty path — the booking row and the row that closed it.
  for (const bookingId of bookings.keys()) tripOf.set(bookingId, bookingId);
  for (const [bookingId, eventId] of closedBy) tripOf.set(eventId, bookingId);

  // qty ส่งซ่อม, placed by window then by qty; ambiguous rows stay out.
  const entries = [...bookings.entries()];
  for (const e of events) {
    if (e.type !== "REPAIR_SENT" || e.details.subItemId) continue;
    const t = e.date.getTime();
    let cand = entries.filter(([, b]) => b.openedAt.getTime() <= t && (!b.closedAt || t <= b.closedAt.getTime()));
    if (cand.length > 1) cand = cand.filter(([, b]) => b.qty === e.qty);
    if (cand.length === 1) tripOf.set(e.id, cand[0][0]);
  }

  // Piece path — walk oldest-first, one open trip per piece.
  const open = new Map<string, string>(); // subItemId → trip id
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const sid = e.details.subItemId as string | undefined | null;
    if (!sid) continue;
    const opens = e.type === "REPAIR_SENT" || (e.type === "STATUS_CHANGE" && e.details.newStatus === "DAMAGED");
    const closes = e.type === "REPAIR_RETURN";
    if (!opens && !closes) continue;
    // ผู้เรียกชี้เคสมาแล้วก็ใช้ไอดีนั้น — เดาเองจะได้คนละไอดีกับ src/lib/cases.ts เมื่อแถวเปิดเคส
    // (เช่น ชำรุดที่แจ้งตอนรับคืน) ถูกกรองทิ้งไปก่อนถึงไทม์ไลน์ในฐานะแถวซ้ำของใบคืน
    const id = tripOf.get(e.id) ?? open.get(sid) ?? e.id;
    tripOf.set(e.id, id);
    if (closes) open.delete(sid);
    else open.set(sid, id);
  }

  const steps = new Map<string, T[]>();
  for (const e of events) {
    const id = tripOf.get(e.id);
    if (!id) continue;
    const list = steps.get(id);
    if (list) list.push(e);
    else steps.set(id, [e]);
  }

  const units: (T | TimelineCase<T>)[] = [];
  const emitted = new Set<string>();
  for (const e of events) {
    const id = tripOf.get(e.id);
    const group = id ? steps.get(id) : undefined;
    if (!id || !group || (group.length < MIN_TRIP_STEPS && !knownIds.has(id))) { units.push(e); continue; }
    if (emitted.has(id)) continue;
    emitted.add(id);
    const type = typeOf.get(id) ?? "REPAIR";
    // A ยืม case is closed by outstanding reaching zero, not by any one row — the caller says so.
    const closed = doneIds.has(id) ? new Set([...closingIds, group[0].id]) : closingIds;
    units.push(buildTrip(id, type, group, closed, bookings.get(id)));
  }
  return units;
}
