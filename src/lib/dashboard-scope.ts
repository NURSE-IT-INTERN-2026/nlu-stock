import type { DispenseType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

// The dashboard is split by how a thing is counted, because that is what decides which
// number means anything: a CONSUMABLE has flow (รับเข้า/เบิกออก qty) and no per-piece
// status, an ITEM has per-piece status and no meaningful qty flow, COUNT sits between.
// One tab per DispenseType, plus an optional CategoryType (หมวดย่อย) filter inside it.
export const DISPENSE_TYPES = ["CONSUMABLE", "COUNT", "ITEM"] as const;

// Three nesting levels, narrowest first: หมวดย่อย (CategoryType) sits inside ประเภท
// (CategoryProfile) sits inside a DispenseType, so the narrowest one set wins outright.
export interface DashboardScope {
  type?: DispenseType;
  profileId?: string;
  categoryId?: string;
}

export function parseScope(params: URLSearchParams): DashboardScope {
  const type = params.get("type");
  return {
    type: (DISPENSE_TYPES as readonly string[]).includes(type ?? "")
      ? (type as DispenseType)
      : undefined,
    profileId: params.get("profileId") || undefined,
    categoryId: params.get("categoryId") || undefined,
  };
}

/** Prisma where fragment on Item. */
export function scopeItemWhere({ type, profileId, categoryId }: DashboardScope): Prisma.ItemWhereInput {
  if (categoryId) return { categoryId };
  if (profileId) return { category: { profileId } };
  if (type) return { category: { profile: { dispenseType: type } } };
  return {};
}

/** Same predicate for anything hanging off an item — DispenseRecord, ReceiveRecord, SubItem. */
export function scopeRecordWhere(scope: DashboardScope): { item?: Prisma.ItemWhereInput } {
  const item = scopeItemWhere(scope);
  return Object.keys(item).length > 0 ? { item } : {};
}

/** Query string for the dashboard API calls. Empty when unscoped. */
export function scopeQuery(scope: DashboardScope | undefined): string {
  if (!scope) return "";
  const qs = new URLSearchParams();
  if (scope.type) qs.set("type", scope.type);
  if (scope.profileId) qs.set("profileId", scope.profileId);
  if (scope.categoryId) qs.set("categoryId", scope.categoryId);
  const s = qs.toString();
  return s ? `?${s}` : "";
}
