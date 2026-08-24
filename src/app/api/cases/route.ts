import { NextRequest } from "next/server";
import { requireAuth, json, getSearchParams, paginate } from "@/lib/api-utils";
import { listCases, type CaseFilter, type CaseState, type CaseType } from "@/lib/cases";

const TYPES = new Set(["REPAIR", "MAINTENANCE", "BORROW", "INUSE", "KIT_CHECK", "LOST"]);
const STATES = new Set(["OPEN", "DONE", "CANCELLED"]);

// Windows the ช่วงเวลา picker offers. Anything else is ignored rather than rejected — a stale
// bookmark should show every case, not a 400.
function since(range: string | null): Date | undefined {
  const d = new Date();
  if (range === "7d") return new Date(d.getTime() - 7 * 86_400_000);
  if (range === "30d") return new Date(d.getTime() - 30 * 86_400_000);
  if (range === "90d") return new Date(d.getTime() - 90 * 86_400_000);
  if (range === "year") return new Date(d.getFullYear(), 0, 1);
  return undefined;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const p = getSearchParams(request);
  const type = p.get("type");
  const state = p.get("state");
  const filter: CaseFilter = {
    ...(type && TYPES.has(type) ? { type: type as CaseType } : {}),
    ...(state && STATES.has(state) ? { state: state as CaseState } : {}),
    ...(p.get("itemId") ? { itemId: p.get("itemId")! } : {}),
    ...(p.get("subItemId") ? { subItemId: p.get("subItemId")! } : {}),
    ...(p.get("q") ? { q: p.get("q")! } : {}),
  };
  const from = since(p.get("range"));
  if (from) filter.from = from;

  const cases = await listCases(filter);
  const { page, perPage, skip, take } = paginate(p);
  return json({ cases: cases.slice(skip, skip + take), total: cases.length, page, perPage });
}
