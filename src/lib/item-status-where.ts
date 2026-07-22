import type { Prisma } from "@/generated/prisma/client";
import { ItemStatus } from "@/generated/prisma/enums";

/**
 * Prisma where-fragment for a status multi-select, one branch per tracking mode:
 *   tracked     — the real status lives on the sub-items; the aggregate on Item is only the
 *                 highest-priority LIVE one (see deriveStatusFromSubItems), so an item with a
 *                 single lost copy is no longer LOST at item level and would otherwise vanish
 *                 from a สูญหาย filter entirely.
 *   non-tracked — no per-piece lifecycle. AVAILABLE additionally requires stock on hand,
 *                 otherwise every emptied consumable (status is always AVAILABLE for them)
 *                 turns up under พร้อมใช้งาน while its row reads ไม่พร้อมใช้งาน.
 *
 * Shared by /api/items (operational list) and /api/settings/items (registry) so the two
 * cannot drift — they did, and the registry silently returned nothing for สูญหาย.
 * Returns null for an empty selection (= no filter). Merge under `where.AND`: both routes
 * already use `where.OR` for search.
 */
export function itemStatusWhere(list: ItemStatus[]): Prisma.ItemWhereInput | null {
  if (list.length === 0) return null;

  const offNormal = list.filter((s) => s !== ItemStatus.AVAILABLE);
  const nonTrackedOr: Prisma.ItemWhereInput[] = [
    ...(list.includes(ItemStatus.AVAILABLE)
      ? [{ status: ItemStatus.AVAILABLE, availableQty: { gt: 0 } }]
      : []),
    ...(offNormal.length > 0 ? [{ status: { in: offNormal } }] : []),
  ];

  return {
    OR: [
      {
        trackIndividually: true,
        OR: [{ status: { in: list } }, { subItems: { some: { status: { in: list } } } }],
      },
      { trackIndividually: false, OR: nonTrackedOr },
    ],
  };
}

/** Append a fragment to `where.AND`, normalising the object/array/undefined shapes. */
export function andWhere(
  where: Prisma.ItemWhereInput,
  fragment: Prisma.ItemWhereInput | null,
): void {
  if (!fragment) return;
  where.AND = [
    ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
    fragment,
  ];
}
