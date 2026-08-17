import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-utils";

/**
 * Everything currently นำไปใช้งาน — the คืนเข้าคลัง tab.
 *
 * Record-based, not status-based. The tab used to read /api/sub-items?status=IN_USE, which
 * can only ever see tracked pieces: a COUNT item has no SubItem row to carry a status, so
 * 8,481 units of วัสดุคงทน were invisible there and fell through to the loan screen instead.
 * An open INUSE DispenseRecord is the one thing both kinds always have.
 *
 * One row per record rather than merged per room: two batches sent to the same room on
 * different days stay apart, which is how ของค้างนาน gets noticed, and a return has to
 * resolve a specific record's resolvedQty anyway.
 */
/**
 * Optional ประเภท/หมวดย่อย narrowing, for the dashboard's นำไปใช้งาน tab — its KPI cards and
 * charts obey the scope bar, and a table beside them that silently ignored it printed a
 * second, larger set of numbers on the same screen.
 *
 * Read straight off the query rather than through parseScope on purpose: parseScope defaults
 * an absent tab to `consume`, which here would filter this endpoint down to CONSUMABLE and
 * blank the /receive คืนเข้าคลัง tab, whose caller sends no params at all. No params = no
 * filter, exactly as before.
 */
function scopeFilter(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const categoryId = params.get("categoryId");
  if (categoryId) return { item: { categoryId } };
  const profileId = params.get("profileId");
  return profileId ? { item: { category: { profileId } } } : {};
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;

  const records = await prisma.dispenseRecord.findMany({
    where: { returnedAt: null, loanType: "INUSE", ...scopeFilter(req) },
    orderBy: { dispensedAt: "asc" }, // oldest first — the ones sitting out longest
    select: {
      id: true,
      quantity: true,
      resolvedQty: true,
      dispensedAt: true,
      // The four inputs lib/constants recipientLabel needs. นำไปใช้งาน files its line in
      // `notes` today and nothing else, but เหตุผล has one definition in this app and the
      // callers must not each re-derive it from whichever column they happen to have.
      notes: true,
      usageType: true,
      courseCode: true,
      usageNote: true,
      recipient: true,
      location: { select: { id: true, building: true, floor: true, room: true, detail: true } },
      staff: { select: { name: true } },
      subItem: { select: { id: true, subCode: true, name: true, serialNumber: true } },
      item: {
        select: {
          id: true,
          code: true,
          name: true,
          imageUrl: true,
          trackIndividually: true,
          locationId: true,
          issueUnit: { select: { name: true } },
          location: { select: { building: true, floor: true, room: true, detail: true } },
          _count: { select: { subItems: true } },
        },
      },
    },
  });

  // A partially-returned record still has units out there; a fully-resolved one that never
  // got its returnedAt stamped does not, and would sit on the tab forever offering 0 to return.
  return NextResponse.json({ records: records.filter((r) => r.quantity - r.resolvedQty > 0) });
}
