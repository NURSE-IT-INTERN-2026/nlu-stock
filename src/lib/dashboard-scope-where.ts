import type { Prisma } from "@/generated/prisma/client";
import { kindDispenseTypes, kindLoanWhere } from "@/lib/dispense-kind-where";
import type { DashboardScope } from "@/lib/dashboard-scope";

// Server half of dashboard-scope — the Item/DispenseRecord where-builders. Split out because
// dispense-kind-where pulls the Prisma runtime and dashboard-scope is imported by api.ts on
// the client. Re-exports the client-safe helpers so a route needs one import, not two.
export { parseScope, scopeQuery, scopeKey, type DashboardScope } from "@/lib/dashboard-scope";

/**
 * Prisma where fragment on Item.
 *
 * The DispenseType filter is always applied, even under a categoryId: the picker only offers
 * categories inside the tab, but a stale URL must not be able to show ครุภัณฑ์ numbers under
 * สิ้นเปลือง.
 */
export function scopeItemWhere({ kind, profileId, categoryId }: DashboardScope): Prisma.ItemWhereInput {
  const dispenseType = kindDispenseTypes(kind);
  if (categoryId) return { categoryId, category: { profile: { dispenseType } } };
  if (profileId) return { category: { profileId, profile: { dispenseType } } };
  return { category: { profile: { dispenseType } } };
}

/** For anything hanging off an item that has no loanType of its own — ReceiveRecord, SubItem. */
export function scopeItemRelWhere(scope: DashboardScope): { item: Prisma.ItemWhereInput } {
  return { item: scopeItemWhere(scope) };
}

/** For DispenseRecord: the item filter plus the tab's loanType half. */
export function scopeDispenseWhere(scope: DashboardScope): Prisma.DispenseRecordWhereInput {
  return { ...kindLoanWhere(scope.kind), item: scopeItemWhere(scope) };
}
