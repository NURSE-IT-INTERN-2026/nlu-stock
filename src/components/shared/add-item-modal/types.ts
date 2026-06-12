import type { LucideIcon } from "lucide-react";
import { Package, Repeat, ListChecks } from "lucide-react";
import type { Category } from "@/lib/constants";

export type WizardStep =
  | "details"
  | "category-units"
  | "summary"
  | "cat-select"
  | "cat-confirm-existing"
  | "cat-create-name"
  | "cat-create-confirm";

export type UsageType = "consumable" | "borrow-count" | "borrow-item";

export interface UsageOption {
  id: UsageType;
  icon: LucideIcon;
  title: string;
  desc: string;
  categories: Category[];
}

export const USAGE_OPTIONS: UsageOption[] = [
  { id: "consumable", icon: Package, title: "ใช้แล้วทิ้ง", desc: "สิ้นเปลือง นับจำนวนคงเหลือ", categories: ["CON", "MED", "KIT"] },
  { id: "borrow-count", icon: Repeat, title: "ยืม-คืน แบบนับจำนวน", desc: "คงทน เช็คจำนวนชิ้นที่ถูกยืม", categories: ["DUR"] },
  { id: "borrow-item", icon: ListChecks, title: "ยืม-คืน รายชิ้น", desc: "ครุภัณฑ์ มี Status รายตัว", categories: ["KRU", "ELE", "BOOK", "TOY"] },
];

export interface ItemFormState {
  name: string;
  usageType: UsageType | null;
  code: string;
  categoryId: string;
  categoryName: string;
  categoryType: string;
  issueUnitId: string;
  subUnitId: string;
  conversionFactor: number;
}

export interface SimilarItem {
  id: string;
  code: string;
  name: string;
  category: { name: string; category: string };
}

export interface AddItemModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (item: unknown) => void;
  /** Pre-fill code from search query */
  defaultCode?: string;
  /** If provided, similar items become selectable (e.g. receive flow). Fires when user confirms selecting an existing item. */
  onSelectExisting?: (item: SimilarItem) => void;
}

export interface CategoryWizardState {
  selectedExisting: import("@/lib/api").CategoryOption | null;
  newCategoryName: string;
  newCategoryType: string;
  newCategoryDescription: string;
  isSubmitting: boolean;
}
