"use client";

import { useAsync, useLookupNonce } from "@/hooks/use-async";
import { getCategories, getLocations, getUnits, getProfiles } from "@/lib/api";

// ponytail: was react-query lookup; now plain useAsync. No cache/dedup, so the callers each
// fetch on mount — categories/locations/units/profiles are small and rarely change.
//
// nonce ไม่ใช่ของแถม: หน้าตั้งค่า mount ทุก tab ค้างไว้พร้อมกัน และ dialog แก้พัสดุก็ mount ค้าง
// ตั้งแต่โหลดหน้า — ถ้าไม่มีสัญญาณนี้ ของที่เพิ่ง "บันทึก" สำเร็จจะไม่โผล่ที่อื่นจนกว่าจะเปลี่ยนหน้า
// คนแก้ข้อมูลตั้งต้นต้องเรียก refreshLookups() หลังบันทึกเสมอ
export function useCategories() {
  const nonce = useLookupNonce();
  const q = useAsync(getCategories, [nonce]);
  return { categories: q.data ?? [], loading: q.isLoading };
}

export function useLocations() {
  const nonce = useLookupNonce();
  const q = useAsync(getLocations, [nonce]);
  return { locations: q.data ?? [], loading: q.isLoading };
}

export function useUnits() {
  const nonce = useLookupNonce();
  const q = useAsync(getUnits, [nonce]);
  return { units: q.data ?? [], loading: q.isLoading };
}

export function useProfiles() {
  const nonce = useLookupNonce();
  const q = useAsync(getProfiles, [nonce]);
  return { profiles: q.data ?? [], loading: q.isLoading };
}
