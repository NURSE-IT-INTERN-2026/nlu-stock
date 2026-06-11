import {
  Building2,
  Monitor,
  BookOpen,
  Puzzle,
  Hammer,
  Package,
  Pill,
  Beaker,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Category } from "@/lib/constants";

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  KRU: Building2,
  ELE: Monitor,
  BOOK: BookOpen,
  TOY: Puzzle,
  DUR: Hammer,
  CON: Package,
  MED: Pill,
  KIT: Beaker,
};
