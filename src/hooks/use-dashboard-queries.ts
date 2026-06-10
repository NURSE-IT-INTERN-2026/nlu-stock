"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getDashboardRecentDispense,
  getDashboardRecentReceive,
  getDashboardTopDispense,
  getDashboardUsageBySubject,
  getDashboardStatusOverview,
} from "@/lib/api";
import {
  DispenseRecordArraySchema,
  ReceiveRecordArraySchema,
  TopDispenseDataArraySchema,
  UsageByTypeDataArraySchema,
  StatusDataArraySchema,
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

export function useTopDispense() {
  return useQuery({
    queryKey: ["dashboard", "top-dispense"],
    queryFn: async () => validate(TopDispenseDataArraySchema, await getDashboardTopDispense()),
  });
}

export function useUsageBySubject() {
  return useQuery({
    queryKey: ["dashboard", "usage-by-subject"],
    queryFn: async () => validate(UsageByTypeDataArraySchema, await getDashboardUsageBySubject()),
  });
}

export function useStatusOverview() {
  return useQuery({
    queryKey: ["dashboard", "status-overview"],
    queryFn: async () => validate(StatusDataArraySchema, await getDashboardStatusOverview()),
  });
}
