"use client";

import { useAsync, useDashboardRefreshNonce } from "@/hooks/use-async";
import {
  getDashboardRecentDispense,
  getDashboardRecentReceive,
  getDashboardTopDispense,
  getDashboardUsageBySubject,
  getDashboardDispenseMonthly,
} from "@/lib/api";
import {
  DispenseRecordArraySchema,
  ReceiveRecordArraySchema,
  TopDispenseDataArraySchema,
  UsageByTypeDataArraySchema,
  MonthlyDispenseDataArraySchema,
} from "@/lib/dashboard-types";

function validate<T>(schema: import("zod").ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

export function useRecentDispense() {
  const nonce = useDashboardRefreshNonce();
  return useAsync(
    async () => validate(DispenseRecordArraySchema, await getDashboardRecentDispense()),
    [nonce],
  );
}

export function useRecentReceive() {
  const nonce = useDashboardRefreshNonce();
  return useAsync(
    async () => validate(ReceiveRecordArraySchema, await getDashboardRecentReceive()),
    [nonce],
  );
}

export function useTopDispense(categoryId?: string, profileId?: string) {
  const nonce = useDashboardRefreshNonce();
  return useAsync(
    async () => validate(TopDispenseDataArraySchema, await getDashboardTopDispense(categoryId, profileId)),
    [nonce, categoryId ?? "all", profileId ?? "all"],
  );
}

export function useUsageBySubject(categoryId?: string, profileId?: string) {
  const nonce = useDashboardRefreshNonce();
  return useAsync(
    async () => validate(UsageByTypeDataArraySchema, await getDashboardUsageBySubject(categoryId, profileId)),
    [nonce, categoryId ?? "all", profileId ?? "all"],
  );
}

export function useDispenseMonthly() {
  const nonce = useDashboardRefreshNonce();
  return useAsync(
    async () => validate(MonthlyDispenseDataArraySchema, await getDashboardDispenseMonthly()),
    [nonce],
  );
}
