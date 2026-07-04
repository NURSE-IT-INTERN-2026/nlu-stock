export type WizardStep = "kit-details" | "components" | "assemble";

export interface ComponentRow {
  componentItemId: string;
  code: string;
  name: string;
  availableQty: number;
  unitName: string;
  quantity: number; // จำนวนต่อ 1 ชุด
}

export interface KitFormState {
  name: string;
  code: string; // preview เท่านั้น — server generate NLU-KIT-NNN จริง
  issueUnitId: string;
  issueUnitName: string;
}

export interface CreateKitModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (kit: { kitItemId: string; kitCode: string; assembledQty: number }) => void;
}
