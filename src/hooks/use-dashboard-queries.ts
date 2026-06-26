"use client";

import { useQuery } from "@tanstack/react-query";
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
  return useQuery({
    queryKey: ["dashboard", "recent-dispense"],
    queryFn: async () => validate(DispenseRecordArraySchema, await getDashboardRecentDispense()),
  });
}

export function useRecentReceive() {
  return useQuery({
    queryKey: ["dashboard", "recent-receive"],
    queryFn: async () => validate(ReceiveRecordArraySchema, await getDashboardRecentReceive()),
  });
}

export function useTopDispense(categoryId?: string, profileId?: string) {
  return useQuery({
    queryKey: ["dashboard", "top-dispense", categoryId ?? "all", profileId ?? "all"],
    queryFn: async () => validate(TopDispenseDataArraySchema, await getDashboardTopDispense(categoryId, profileId)),
  });
}

export function useUsageBySubject(categoryId?: string, profileId?: string) {
  return useQuery({
    queryKey: ["dashboard", "usage-by-subject", categoryId ?? "all", profileId ?? "all"],
    queryFn: async () => validate(UsageByTypeDataArraySchema, await getDashboardUsageBySubject(categoryId, profileId)),
  });
}

export function useDispenseMonthly() {
  return useQuery({
    queryKey: ["dashboard", "dispense-monthly"],
    queryFn: async () => validate(MonthlyDispenseDataArraySchema, await getDashboardDispenseMonthly()),
  });
}
