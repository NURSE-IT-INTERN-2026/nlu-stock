import type { CategoryOption, ProfileOption } from "@/lib/api";

export type WizardStep = "select" | "confirm-existing" | "create-name" | "create-confirm";

export interface CategorySelectModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (category: CategoryOption) => void;
  /** Title shown in header. Defaults to "เลือกหมวดหมู่" */
  title?: string;
  /** Only show categories whose profile id is in this list. If omitted, show all. */
  allowedProfileIds?: string[];
}

export interface WizardState {
  step: WizardStep;
  selectedExisting: CategoryOption | null;
  newCategoryName: string;
  newCategoryProfileId: string;
  newCategoryDescription: string;
  isSubmitting: boolean;
}

export interface ProfilePick {
  profile: ProfileOption;
  /** optional label override */
}
