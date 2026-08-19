import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { STATUS_LABELS, STATUS_COLORS, USAGE_STATUS_ORDER } from "@/lib/constants";
import { parseScope, scopeItemWhere } from "@/lib/dashboard-scope-where";

// Per-piece status breakdown for tracked (durable/asset) items. Same six-status set as the
// "สัดส่วนการใช้งาน" convention (USAGE_STATUS_ORDER) — LOST/DISPOSED are written off, excluded.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const scope = scopeItemWhere(parseScope(getSearchParams(request)));

  const groups = await prisma.subItem.groupBy({
    by: ["status"],
    where: { item: { trackIndividually: true, isActive: true, ...scope } },
    _count: true,
  });
  const counts = new Map(groups.map((g) => [g.status, g._count]));

  const data = USAGE_STATUS_ORDER.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    color: STATUS_COLORS[status],
    count: counts.get(status) ?? 0,
  }));

  return json(data);
}
