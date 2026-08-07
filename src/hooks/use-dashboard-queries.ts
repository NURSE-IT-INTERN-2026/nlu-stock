"use client";

import { useAsync, useDashboardRefreshNonce } from "@/hooks/use-async";
import {
  getDashboardRecentDispense,
  getDashboardRecentReceive,
  getDashboardTopDispense,
  getDashboardUsageBySubject,
  getDashboardRepairStatus,
  getDashboardRepairInProgress,
  getDashboardOverdueReturn,
  getDashboardLowStock,
  getDashboardMaintenanceFollowup,
} from "@/lib/api";
import {
  DispenseRecordArraySchema,
  ReceiveRecordArraySchema,
  TopDispenseDataArraySchema,
  UsageByTypeDataArraySchema,
  RepairStatusDataSchema,
  RepairInProgressArraySchema,
  OverdueReturnArraySchema,
  LowStockArraySchema,
  MaintenanceFollowupArraySchema,
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

export function useRepairStatus() {
  const nonce = useDashboardRefreshNonce();
  return useAsync(
    async () => validate(RepairStatusDataSchema, await getDashboardRepairStatus()),
    [nonce],
  );
}

export function useRepairInProgress() {
  const nonce = useDashboardRefreshNonce();
  return useAsync(
    async () => validate(RepairInProgressArraySchema, await getDashboardRepairInProgress()),
    [nonce],
  );
}

export function useOverdueReturn() {
  const nonce = useDashboardRefreshNonce();
  return useAsync(
    async () => validate(OverdueReturnArraySchema, await getDashboardOverdueReturn()),
    [nonce],
  );
}

export function useLowStock() {
  const nonce = useDashboardRefreshNonce();
  return useAsync(
    async () => validate(LowStockArraySchema, await getDashboardLowStock()),
    [nonce],
  );
}

export function useMaintenanceFollowup() {
  const nonce = useDashboardRefreshNonce();
  return useAsync(
    async () => validate(MaintenanceFollowupArraySchema, await getDashboardMaintenanceFollowup()),
    [nonce],
  );
}
