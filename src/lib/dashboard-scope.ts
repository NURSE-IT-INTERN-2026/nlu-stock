import { parseDispenseKind, type DispenseKind } from "@/lib/dispense-kind";

/**
 * The dashboard is split by what happened to the stock, not by how the stock is counted.
 * เบิกใช้ never comes back, ยืม has a due date and someone to chase, นำไปใช้งาน has a room and
 * no due date at all — three different questions, so three tabs, each with its own numbers.
 *
 * The tab axis IS lib/dispense-kind's DispenseKind, reused rather than redefined: /reports
 * partitions the same table the same way, and two definitions of "ยืม" would eventually
 * disagree on a legacy row (loanType null) and print two different totals for one event.
 *
 * Inside a tab, ประเภท (CategoryProfile) → หมวดย่อย (CategoryType) narrow further.
 *
 * ponytail: no Prisma here on purpose. The Item/DispenseRecord where-builders live in
 * dashboard-scope-where.ts — pulling them in dragged the whole Prisma runtime through api.ts
 * into every client bundle, and Turbopack refused it (node:module in the browser).
 */
export interface DashboardScope {
  kind: DispenseKind;
  profileId?: string;
  categoryId?: string;
}

export function parseScope(params: URLSearchParams): DashboardScope {
  return {
    kind: parseDispenseKind(params.get("tab")),
    profileId: params.get("profileId") || undefined,
    categoryId: params.get("categoryId") || undefined,
  };
}

/** Query string for the dashboard API calls. `tab` is always written — it is the page. */
export function scopeQuery(scope: DashboardScope): string {
  const qs = new URLSearchParams({ tab: scope.kind });
  if (scope.profileId) qs.set("profileId", scope.profileId);
  if (scope.categoryId) qs.set("categoryId", scope.categoryId);
  return `?${qs.toString()}`;
}

/** Stable dependency key for useAsync — the scope object's identity changes every render. */
export function scopeKey(scope: DashboardScope) {
  return `${scope.kind}|${scope.profileId ?? ""}|${scope.categoryId ?? ""}`;
}
