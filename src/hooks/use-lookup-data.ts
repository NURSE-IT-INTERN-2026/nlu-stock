"use client";

import { useQuery } from "@tanstack/react-query";
import { getCategories, getLocations, type CategoryOption, type LocationOption } from "@/lib/api";

// ponytail: react-query already powers the dashboard hooks — the hand-rolled module cache here
// duplicated its fetch + dedupe. Same return shape ({ X, loading }) so the 6 callers are unchanged.
export function useCategories() {
  const q = useQuery({ queryKey: ["lookup", "categories"], queryFn: getCategories });
  return { categories: q.data ?? [], loading: q.isLoading };
}

export function useLocations() {
  const q = useQuery({ queryKey: ["lookup", "locations"], queryFn: getLocations });
  return { locations: q.data ?? [], loading: q.isLoading };
}
