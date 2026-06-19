"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getDashboardRecentDispense,
  getDashboardRecentReceive,
  getDashboardTopDispense,
  getDashboardUsageBySubject,
  getDashboardStatusOverview,
  getDashboardDispenseMonthly,
} from "@/lib/api";
import {
  DispenseRecordArraySchema,
  ReceiveRecordArraySchema,
  TopDispenseDataArraySchema,
  UsageByTypeDataArraySchema,
  StatusDataArraySchema,
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

export function useTopDispense(categoryId?: string) {
  return useQuery({
    queryKey: ["dashboard", "top-dispense", categoryId ?? "all"],
    queryFn: async () => validate(TopDispenseDataArraySchema, await getDashboardTopDispense(categoryId)),
  });
}

export function useUsageBySubject(categoryId?: string) {
  return useQuery({
    queryKey: ["dashboard", "usage-by-subject", categoryId ?? "all"],
    queryFn: async () => validate(UsageByTypeDataArraySchema, await getDashboardUsageBySubject(categoryId)),
  });
}

export function useStatusOverview() {
  return useQuery({
    queryKey: ["dashboard", "status-overview"],
    queryFn: async () => validate(StatusDataArraySchema, await getDashboardStatusOverview()),
  });
}

export function useDispenseMonthly() {
  return useQuery({
    queryKey: ["dashboard", "dispense-monthly"],
    queryFn: async () => validate(MonthlyDispenseDataArraySchema, await getDashboardDispenseMonthly()),
  });
}
