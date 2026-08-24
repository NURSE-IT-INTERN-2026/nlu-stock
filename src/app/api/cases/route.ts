import { NextRequest } from "next/server";
import { requireAuth, json, getSearchParams, paginate } from "@/lib/api-utils";
import { caseRangeStart, listCases, summariseCases, type CaseFilter, type CaseState, type CaseType } from "@/lib/cases";

const TYPES = new Set(["REPAIR", "MAINTENANCE", "BORROW", "INUSE", "LOST"]);
const STATES = new Set(["OPEN", "DONE", "CANCELLED"]);

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
    // งานที่ยังมีคนต้องไปทำ — เกณฑ์อยู่ที่ isTodo ตัวเดียวกับที่ badge นับ ไม่ใช่ state=OPEN เปล่าๆ
    // ซึ่งจะลากตั้งใช้ในห้องกับยืมที่ยังไม่ถึงกำหนดเข้ามาด้วย
    ...(p.get("todo") === "true" ? { todo: true } : {}),
  };
  const from = caseRangeStart(p.get("range"));
  if (from) filter.from = from;

  const cases = await listCases(filter);
  const { page, perPage, skip, take } = paginate(p);
  return json({
    cases: cases.slice(skip, skip + take),
    total: cases.length,
    page,
    perPage,
    summary: summariseCases(cases),
  });
}
