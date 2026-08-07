import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams, paginate } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { Prisma, ItemStatus } from "@/generated/prisma/client";
import { isCountDue } from "@/lib/stock-count";
import { itemStatusWhere, andWhere } from "@/lib/item-status-where";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const { page, perPage, skip, take } = paginate(params);
  // ponytail: dual-mode — cursor when the client sends one (mobile load-more),
  // offset otherwise (desktop numbered pagination + legacy consumers: alerts, locations, QR scan).
  const cursorParam = params.get("cursor");
  const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || perPage));
  const useCursor = params.has("cursor") || params.get("mode") === "cursor";

  const where: Prisma.ItemWhereInput = { isActive: true };

  const search = params.get("search");
  if (search) {
    where.OR = [
      { code: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
      { nameEn: { contains: search, mode: "insensitive" } },
    ];
  }

  const categoryId = params.get("categoryId");
  if (categoryId) where.categoryId = categoryId;

  const profileId = params.get("profileId");
  if (profileId) where.category = { profileId };

  // Status multi-select — see itemStatusWhere. AND (not OR) because where.OR is already
  // taken by search / dueCount / alerts.
  const statusList = (params.get("status") ?? "").split(",").filter(Boolean) as ItemStatus[];
  andWhere(where, itemStatusWhere(statusList));

  const locationId = params.get("locationId");
  if (locationId) where.locationId = locationId;

  // Location level filter (cascade): filter every record under a building/floor/room/detail node.
  const building = params.get("building");
  const floor = params.get("floor");
  const room = params.get("room");
  const detail = params.get("detail");
  if (building || floor || room || detail) {
    where.location = {
      ...(building && { building }),
      ...(floor && { floor }),
      ...(room && { room }),
      ...(detail && { detail }),
    };
  }

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  // Expiry alert = expires within 30 days OR already past expiry (no lower bound), and still
  // holds stock. Expired lots surface too so the UI can flag them "หมดอายุ".
  const expiryAlert = { expiryDate: { lte: in30Days }, remainingQty: { gt: 0 } };

  const lowStock = params.get("lowStock");
  if (lowStock === "true") {
    const lowStockItems = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM items WHERE "availableQty" < "minThreshold" AND "isActive" = true
    `;
    where.id = { in: lowStockItems.map((r) => r.id) };
  }

  const nearExpiry = params.get("nearExpiry");
  if (nearExpiry === "true") {
    where.lots = {
      some: expiryAlert,
    };
  }

  const onLoan = params.get("onLoan");
  if (onLoan === "true") {
    where.dispenseRecords = { some: { returnedAt: null } };
  }

  const overdueMaint = params.get("overdueMaint");
  if (overdueMaint === "true") {
    where.nextMaintenanceDate = { lt: now };
  }

  // ถึงรอบตรวจนับ. null = never counted (legacy row the backfill missed) → also due.
  const dueCount = params.get("dueCount");
  if (dueCount === "true") {
    where.OR = [{ nextCountDate: null }, { nextCountDate: { lt: now } }];
  }

  // Union mode: items matching ANY alert condition (used by /alerts page).
  const alerts = params.get("alerts");
  if (alerts === "true") {
    const lowStockIds = (await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM items WHERE "availableQty" < "minThreshold" AND "isActive" = true
    `).map((r) => r.id);
    where.OR = [
      { id: { in: lowStockIds } },
      { lots: { some: expiryAlert } },
      { nextMaintenanceDate: { lt: now } },
      { nextCountDate: null },
      { nextCountDate: { lt: now } },
    ];
  }

  // When a status filter is on, the list ships the matching pieces so the table can expand
  // straight to them (same shape the settings sub-items endpoint returns, so the row renderer
  // is shared). No `where` here on purpose: statusCounts below counts ALL pieces.
  const matchedSubSelect = {
    select: {
      id: true, subCode: true, name: true, condition: true, notes: true, status: true,
      location: true,
      dispenseRecords: {
        where: { returnedAt: null },
        orderBy: { dispensedAt: "desc" },
        take: 1,
        include: { staff: { select: { name: true } } },
      },
    },
    orderBy: { subCode: "asc" },
  } satisfies Prisma.Item$subItemsArgs;

  type MatchedSubItem = Prisma.SubItemGetPayload<typeof matchedSubSelect>;

  const itemInclude = {
    category: { include: { profile: true } },
    location: true,
    issueUnit: true,
    _count: { select: { subItems: true } },
    subItems: statusList.length > 0 ? matchedSubSelect : { select: { status: true } },
    lots: {
      where: expiryAlert,
      orderBy: { expiryDate: "asc" },
      take: 1,
    },
  } satisfies Prisma.ItemFindManyArgs["include"];

  type ItemRow = Prisma.ItemGetPayload<{ include: typeof itemInclude }>;

  // Derive per-item alert types (badge column on /alerts) + status-group counts (items table).
  function transformItem(item: ItemRow) {
    const types: string[] = [];
    if (item.availableQty < item.minThreshold) types.push("lowStock");
    if (item.lots.length > 0) types.push("nearExpiry");
    if (item.nextMaintenanceDate && new Date(item.nextMaintenanceDate) < now) types.push("overdueMaint");
    if (isCountDue(item.nextCountDate, now)) types.push("dueCount");

    // statusCounts: พร้อมใช้งาน / ถูกใช้งาน (ยืม+ใช้งาน) / ไม่พร้อมใช้งาน (ชำรุด+ส่งซ่อม+บำรุงรักษา).
    // Tracked only — the split is real there because every piece carries its own status.
    // Non-tracked items have no per-piece status to count: Item holds one availableQty/totalQty
    // pair plus a single status flag, so the third bucket used to be hard-coded 0 and the
    // whole totalQty−availableQty gap was labelled "ยืม" even when the stock was damaged or
    // eaten by a kit assembly. Null now; the table falls back to available/total.
    let statusCounts: { available: number; inUse: number; unavailable: number } | null = null;
    if (item.trackIndividually) {
      const c = { available: 0, inUse: 0, unavailable: 0 };
      for (const s of item.subItems) {
        if (s.status === ItemStatus.AVAILABLE) c.available++;
        else if (s.status === ItemStatus.ON_LOAN || s.status === ItemStatus.IN_USE) c.inUse++;
        else if (s.status === ItemStatus.DAMAGED || s.status === ItemStatus.UNDER_REPAIR || s.status === ItemStatus.PENDING_MAINTENANCE) c.unavailable++;
      }
      statusCounts = c;
    }

    // Cast: subItems carries the full select only when a status filter is on — which is
    // exactly when this runs. Without a filter it is the {status} projection and stays unused.
    const matchedSubItems = statusList.length > 0
      ? (item.subItems as MatchedSubItem[]).filter((s) => statusList.includes(s.status))
      : undefined;

    // Strip subItems (needed for the counts above, and matched pieces ship separately)
    // so the list payload stays lean.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { subItems, ...rest } = item;
    return { ...rest, alertTypes: types, statusCounts, ...(matchedSubItems ? { matchedSubItems } : {}) };
  }

  if (useCursor) {
    // Cursor mode (mobile load-more). orderBy code asc is a stable total order (code @unique),
    // so cursor on id paginates without skips/dups.
    const cursorRow = cursorParam
      ? await prisma.item.findUnique({ where: { id: cursorParam }, select: { id: true } })
      : null;
    const effectiveCursor = cursorRow?.id; // invalid/stale cursor → falls back to first page
    const fetched = await prisma.item.findMany({
      where,
      orderBy: { code: "asc" },
      take: limit + 1, // ponytail: +1 to know exactly whether more remain (exact nextCursor, no false "has more")
      ...(effectiveCursor ? { cursor: { id: effectiveCursor }, skip: 1 } : {}),
      include: itemInclude,
    });
    const hasMore = fetched.length > limit;
    const pageRows = hasMore ? fetched.slice(0, limit) : fetched;
    const nextCursor = hasMore ? (pageRows[pageRows.length - 1]?.id ?? null) : null;
    // Count only on the first fetch — loadMore reuses the last total (cheap; drifts under writes).
    const total = cursorParam ? null : await prisma.item.count({ where });
    return json({ items: pageRows.map(transformItem), nextCursor, total, page: 1, perPage: limit });
  }

  const [rawItems, total] = await Promise.all([
    prisma.item.findMany({ where, skip, take, orderBy: { code: "asc" }, include: itemInclude }),
    prisma.item.count({ where }),
  ]);
  return json({ items: rawItems.map(transformItem), page, perPage, total, nextCursor: null });
}
