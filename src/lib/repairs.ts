/**
 * A tracked piece's repair trip, read back out of its status log.
 *
 * There is no repair-trip table: ชำรุด → ส่งซ่อม → รับคืน is a walk on `SubItem.status`, and
 * everything a screen wants to say about the trip in progress (อาการ, ที่ส่งซ่อม, ส่งไปเมื่อไหร่)
 * lives spread across the ItemStatusLog rows that walk it. This is the one place that folds
 * those rows back into a trip, so /api/sub-items (the worklist) and /api/items/[id]/open-repairs
 * (the item's active-case card) cannot disagree about what is wrong with the same piece.
 *
 * Pass the logs for ONE status, newest first — the rows whose `newStatus` is the piece's
 * current one. Anything older belongs to a trip that already closed.
 */
export type RepairTripLog = {
  previousStatus: string | null;
  newStatus?: string | null;
  reason: string | null;
  repairVenue: "INTERNAL" | "EXTERNAL" | null;
  repairNote: string | null;
  damageNote: string | null;
  changedAt: Date;
};

export type RepairTrip = {
  repairVenue: "INTERNAL" | "EXTERNAL" | null;
  damageNote: string | null;
  repairNote: string | null;
  /** When the piece entered its current status — not the last edit to the repair info. */
  startedAt: string | null;
};

export function deriveRepairTrip(logs: RepairTripLog[], status: string): RepairTrip {
  const latest = logs[0];
  // แก้ข้อมูลการส่งซ่อม appends an X → X row per edit, so the trip started at the newest row
  // that came from a DIFFERENT status; edits are skipped and the day count stays honest.
  const start = logs.find((l) => l.previousStatus !== status) ?? logs.at(-1);
  return {
    repairVenue: latest?.repairVenue ?? null,
    // Venue/note track the newest edit, and so does the symptom now that แก้ข้อมูลการส่งซ่อม can
    // correct it — newest non-null damageNote wins, falling back to the trip-opening row's
    // reason for trips recorded before the column existed.
    damageNote: logs.find((l) => l.damageNote)?.damageNote ?? start?.reason ?? null,
    repairNote: latest?.repairNote ?? null,
    startedAt: start?.changedAt.toISOString() ?? null,
  };
}
