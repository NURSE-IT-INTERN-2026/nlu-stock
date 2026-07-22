import type { CategoryOption } from "@/lib/api";

export type WizardStep = "select" | "confirm-existing" | "create-name" | "create-confirm";

export interface CategorySelectModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (category: CategoryOption) => void;
  /** Title shown in header. Defaults to "เลือกหมวดหมู่" */
  title?: string;
  /** "select" = pick-existing-or-create (default). "create" = skip picker, start at create form. */
  mode?: "select" | "create";
}

export interface WizardState {
  step: WizardStep;
  selectedExisting: CategoryOption | null;
  newCategoryName: string;
  newCategoryProfileId: string;
  newCategoryDescription: string;
  isSubmitting: boolean;
}
