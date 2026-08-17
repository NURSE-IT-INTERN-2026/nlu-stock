-- Qty stock gets the ส่งซ่อม step it never had.
--
-- Before: แจ้งชำรุด on a non-tracked item booked a DAMAGED_PENDING_REPAIR adjustment and that
-- was it — the units appeared straight on รับคืนจากส่งซ่อม, skipping ชำรุด (รอส่งซ่อม) entirely,
-- while a tracked piece had to walk ชำรุด → ส่งซ่อม → รับคืน. A qty item has no sub_items row
-- to carry an UNDER_REPAIR status, so the trip goes on the booking itself.
--
-- repairSentAt null = still waiting to be sent (the /alerts worklist);
-- set = at the repair shop (the receive tab). Existing open bookings stay null, i.e. they
-- land back on ชำรุด รอส่งซ่อม — which is where they should have been all along.
ALTER TABLE "stock_adjustments" ADD COLUMN "repairSentAt" TIMESTAMP(3);
ALTER TABLE "stock_adjustments" ADD COLUMN "repairVenue" "RepairVenue";
ALTER TABLE "stock_adjustments" ADD COLUMN "repairNote" TEXT;
