import type { CategoryOption } from "@/lib/api";
import type { Category } from "@/lib/constants";

export type WizardStep = "select" | "confirm-existing" | "create-name" | "create-confirm";

export interface CategorySelectModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (category: CategoryOption) => void;
  /** Title shown in header. Defaults to "เลือกหมวดหมู่" */
  title?: string;
  /** Only show categories matching these types. If omitted, show all. */
  allowedCategoryTypes?: Category[];
}

export interface WizardState {
  step: WizardStep;
  selectedExisting: CategoryOption | null;
  newCategoryName: string;
  newCategoryType: string;
  newCategoryDescription: string;
  isSubmitting: boolean;
}
