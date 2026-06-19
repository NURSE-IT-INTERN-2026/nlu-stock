/**
 * Icon registry: maps profile.icon string → lucide component.
 * Used by client components since CategoryProfile.icon is stored as a string.
 */
import {
  Building2,
  Monitor,
  BookOpen,
  Puzzle,
  Hammer,
  Package,
  Beaker,
  Stethoscope,
  Pill,
  Syringe,
  HeartPulse,
  Laptop,
  Microscope,
  ShoppingCart,
  Utensils,
  Shirt,
  Wrench,
  Box,
  Boxes,
  type LucideIcon,
} from "lucide-react";

export const PROFILE_ICON_REGISTRY: Record<string, LucideIcon> = {
  Building2,
  Monitor,
  BookOpen,
  Puzzle,
  Hammer,
  Package,
  Beaker,
  Stethoscope,
  Pill,
  Syringe,
  HeartPulse,
  Laptop,
  Microscope,
  ShoppingCart,
  Utensils,
  Shirt,
  Wrench,
  Box,
  Boxes,
};

/** Icon options offered in the "เพิ่มประเภท" form palette. */
export const PROFILE_ICON_OPTIONS: { value: string; label: string }[] = Object.keys(
  PROFILE_ICON_REGISTRY,
).map((name) => ({ value: name, label: name }));

export function profileIcon(name: string | null | undefined): LucideIcon {
  return (name && PROFILE_ICON_REGISTRY[name]) || Package;
}

/** Color options offered in the form palette (tailwind badge classes). */
export const PROFILE_COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", label: "ฟ้า" },
  { value: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", label: "เขียว" },
  { value: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200", label: "ม่วง" },
  { value: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", label: "เหลือง" },
  { value: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200", label: "ฟ้าอมเขียว" },
  { value: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200", label: "ชมพู" },
  { value: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200", label: "เขียวขี้ม้า" },
  { value: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", label: "แดง" },
  { value: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200", label: "ส้ม" },
  { value: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200", label: "คราม" },
];
