"use client";

import { useAsync, useDashboardRefreshNonce } from "@/hooks/use-async";
import { useDashboardScope, scopeKey } from "@/hooks/use-dashboard-scope";
import {
  getDashboardRecentDispense,
  getDashboardRecentReceive,
  getDashboardTopDispense,
  getDashboardUsageBySubject,
  getDashboardRepairStatus,
} from "@/lib/api";
import type { DashboardScope } from "@/lib/dashboard-scope";
import {
  DispenseRecordArraySchema,
  ReceiveRecordArraySchema,
  TopDispenseDataArraySchema,
  UsageByTypeDataArraySchema,
  RepairStatusDataSchema,
} from "@/lib/dashboard-types";

// Every dashboard fetch is (scope + refresh nonce) → validated rows, so one helper covers
// all of them: the hooks below only pick a fetcher and a schema.
// `override` is for callers outside the dashboard tabs — /reports drives the same two
// charts from its own filter bar, where there is no tab and so no scope context.
function useScopedQuery<T>(
  fetcher: (scope: DashboardScope) => Promise<unknown>,
  schema: import("zod").ZodSchema<T>,
  override?: DashboardScope,
) {
  const nonce = useDashboardRefreshNonce();
  const ctx = useDashboardScope();
  const scope = override ?? ctx;
  return useAsync(async () => schema.parse(await fetcher(scope)), [nonce, scopeKey(scope)]);
}

export function useRecentDispense() {
  return useScopedQuery(getDashboardRecentDispense, DispenseRecordArraySchema);
}

export function useRecentReceive() {
  return useScopedQuery(getDashboardRecentReceive, ReceiveRecordArraySchema);
}

export function useTopDispense(scope?: DashboardScope) {
  return useScopedQuery(getDashboardTopDispense, TopDispenseDataArraySchema, scope);
}

export function useUsageBySubject(scope?: DashboardScope) {
  return useScopedQuery(getDashboardUsageBySubject, UsageByTypeDataArraySchema, scope);
}

export function useRepairStatus() {
  return useScopedQuery(getDashboardRepairStatus, RepairStatusDataSchema);
}
