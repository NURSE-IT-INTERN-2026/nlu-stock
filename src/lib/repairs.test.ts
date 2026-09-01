// Folding repair logs back into one trip. Run with: npx tsx --test src/lib/repairs.test.ts
// The card that reads this says "ชำรุด: <symptom>", so the fallback path — rows written before
// the damageNote column, whose อาการ is buried in a sentence — is what these guard.
import assert from "node:assert";
import test from "node:test";
import { deriveRepairTrip, type RepairTripLog } from "@/lib/repairs";

const log = (l: Partial<RepairTripLog>): RepairTripLog => ({
  previousStatus: "AVAILABLE",
  newStatus: "DAMAGED",
  reason: null,
  repairVenue: null,
  repairNote: null,
  damageNote: null,
  changedAt: new Date("2026-08-01"),
  ...l,
});

test("damageNote column wins over the reason sentence", () => {
  const trip = deriveRepairTrip([log({ damageNote: "จอแตก", reason: "คืนพร้อมระบุ: ชำรุด" })], "DAMAGED");
  assert.equal(trip.damageNote, "จอแตก");
});

test("older loan-return rows keep only the note, not the wrapper", () => {
  const trip = deriveRepairTrip([log({ reason: "คืนพร้อมระบุ: ชำรุด (จอแตก)" })], "DAMAGED");
  assert.equal(trip.damageNote, "จอแตก");
});

test("a reason that only restates the status is not a symptom", () => {
  for (const reason of ["เปลี่ยนสถานะเป็น ชำรุด", "คืนพร้อมระบุ: ชำรุด"]) {
    assert.equal(deriveRepairTrip([log({ reason })], "DAMAGED").damageNote, null, reason);
  }
});

test("a plain แจ้งชำรุด note passes through", () => {
  assert.equal(deriveRepairTrip([log({ reason: "ล้อหลุด" })], "DAMAGED").damageNote, "ล้อหลุด");
});

test("an edit corrects the symptom but never moves the trip's start date", () => {
  const trip = deriveRepairTrip(
    [
      log({ previousStatus: "UNDER_REPAIR", newStatus: "UNDER_REPAIR", damageNote: "จอแตก + ปุ่มหลุด", repairVenue: "EXTERNAL", changedAt: new Date("2026-08-20") }),
      log({ previousStatus: "DAMAGED", newStatus: "UNDER_REPAIR", damageNote: "จอแตก", repairVenue: "INTERNAL", changedAt: new Date("2026-08-10") }),
    ],
    "UNDER_REPAIR",
  );
  assert.equal(trip.damageNote, "จอแตก + ปุ่มหลุด");
  assert.equal(trip.repairVenue, "EXTERNAL");
  assert.equal(trip.startedAt, new Date("2026-08-10").toISOString());
});
