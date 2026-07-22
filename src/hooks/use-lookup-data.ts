"use client";

import { useAsync } from "@/hooks/use-async";
import { getCategories, getLocations } from "@/lib/api";

// ponytail: was react-query lookup; now plain useAsync. No cache/dedup, so the 6 callers
// each fetch on mount — categories/locations are small and rarely change, acceptable.
// Same return shape ({ X, loading }) so the callers are unchanged.
export function useCategories() {
  const q = useAsync(getCategories, []);
  return { categories: q.data ?? [], loading: q.isLoading };
}

export function useLocations() {
  const q = useAsync(getLocations, []);
  return { locations: q.data ?? [], loading: q.isLoading };
}
