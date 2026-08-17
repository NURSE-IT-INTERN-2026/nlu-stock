"use client";

import { useAsync, useDashboardRefreshNonce } from "@/hooks/use-async";
import { useDashboardScope } from "@/hooks/use-dashboard-scope";
import { scopeKey, type DashboardScope } from "@/lib/dashboard-scope";
import {
  getDashboardTabSummary,
  getDashboardFlowMonthly,
  getDashboardLoanDuration,
  getDashboardOutstandingLoans,
  getDashboardAssetStatus,
  getDashboardDispenseByUsageMonthly,
  getDashboardRecentDispense,
  getDashboardRecentReceive,
  getDashboardTopDispense,
  getDashboardTopCourses,
  getDashboardStationByRoom,
} from "@/lib/api";
import {
  DispenseRecordArraySchema,
  ReceiveRecordArraySchema,
  TopDispenseDataArraySchema,
  DispenseByUsageMonthArraySchema,
  AssetStatusArraySchema,
  TopCoursesSchema,
  StationByRoomSchema,
  LoanSummarySchema,
  InUseSummarySchema,
  FlowMonthlySchema,
  LoanDurationSchema,
  OutstandingLoansSchema,
} from "@/lib/dashboard-types";

// Every dashboard fetch is (scope + refresh nonce) → validated rows, so one helper covers
// all of them: the hooks below only pick a fetcher and a schema.
function useScopedQuery<T>(
  fetcher: (scope: DashboardScope) => Promise<unknown>,
  schema: import("zod").ZodSchema<T>,
) {
  const nonce = useDashboardRefreshNonce();
  const scope = useDashboardScope();
  return useAsync(async () => schema.parse(await fetcher(scope)), [nonce, scopeKey(scope)]);
}

export const useLoanSummary = () => useScopedQuery(getDashboardTabSummary, LoanSummarySchema);
export const useInUseSummary = () => useScopedQuery(getDashboardTabSummary, InUseSummarySchema);
export const useFlowMonthly = () => useScopedQuery(getDashboardFlowMonthly, FlowMonthlySchema);
export const useLoanDuration = () => useScopedQuery(getDashboardLoanDuration, LoanDurationSchema);
export const useOutstandingLoans = () => useScopedQuery(getDashboardOutstandingLoans, OutstandingLoansSchema);
export const useAssetStatus = () => useScopedQuery(getDashboardAssetStatus, AssetStatusArraySchema);
export const useRecentDispense = () => useScopedQuery(getDashboardRecentDispense, DispenseRecordArraySchema);
export const useRecentReceive = () => useScopedQuery(getDashboardRecentReceive, ReceiveRecordArraySchema);
export const useTopDispense = () => useScopedQuery(getDashboardTopDispense, TopDispenseDataArraySchema);
export const useDispenseByUsage = () => useScopedQuery(getDashboardDispenseByUsageMonthly, DispenseByUsageMonthArraySchema);
export const useTopCourses = () => useScopedQuery(getDashboardTopCourses, TopCoursesSchema);
export const useStationByRoom = () => useScopedQuery(getDashboardStationByRoom, StationByRoomSchema);
