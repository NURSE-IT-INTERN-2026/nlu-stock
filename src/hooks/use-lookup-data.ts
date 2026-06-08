"use client";

import { useState, useEffect } from "react";
import { getCategories, getLocations, type CategoryOption, type LocationOption } from "@/lib/api";

// Module-level cache — shared across hook instances on the same page load
let categoriesCache: CategoryOption[] | null = null;
let locationsCache: LocationOption[] | null = null;

export function useCategories() {
  const [categories, setCategories] = useState<CategoryOption[]>(categoriesCache ?? []);
  const [loading, setLoading] = useState(!categoriesCache);

  useEffect(() => {
    if (categoriesCache) { setCategories(categoriesCache); setLoading(false); return; }
    getCategories()
      .then((data) => { categoriesCache = data; setCategories(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { categories, loading };
}

export function useLocations() {
  const [locations, setLocations] = useState<LocationOption[]>(locationsCache ?? []);
  const [loading, setLoading] = useState(!locationsCache);

  useEffect(() => {
    if (locationsCache) { setLocations(locationsCache); setLoading(false); return; }
    getLocations()
      .then((data) => { locationsCache = data; setLocations(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { locations, loading };
}

export function invalidateCategoriesCache() { categoriesCache = null; }
export function invalidateLocationsCache() { locationsCache = null; }
