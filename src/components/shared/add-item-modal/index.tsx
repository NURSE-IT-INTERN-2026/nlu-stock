"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { PackagePlus, ArrowLeft, ArrowRight, Check, X, FileText, Layers, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { quickCreateItem, createCategory } from "@/lib/api";
import type { CategoryOption } from "@/lib/api";
import type { AddItemModalProps, CategoryWizardState, ItemFormState, SimilarItem, WizardStep } from "./types";
import { USAGE_OPTIONS } from "./types";
import { StepItemDetails } from "./step-item-details";
import { StepCategoryUnits } from "./step-category-units";
import type { CodeMeta } from "./code-builder";
import { StepSummary } from "./step-summary";
import { StepSelect } from "../category-select-modal/step-select";
import { StepCreateName } from "../category-select-modal/step-create-name";
import { StepCreateConfirm } from "../category-select-modal/step-create-confirm";

const STEP_TITLES: Record<WizardStep, string> = {
  details: "ข้อมูลพัสดุ",
  "category-units": "หมวดหมู่และหน่วย",
  summary: "ตรวจสอบและยืนยัน",
  "cat-select": "เลือกหมวดหมู่",
  "cat-confirm-existing": "ยืนยันหมวดหมู่",
  "cat-create-name": "สร้างหมวดหมู่ใหม่",
  "cat-create-confirm": "ตรวจสอบและยืนยัน",
};

// Sidebar stepper metadata (3 main steps; cat-* sub-steps map to index 1)
const MAIN_STEPS = [
  { idx: 0, title: "ข้อมูลพัสดุ", desc: "ชื่อและประเภทการใช้งาน", icon: FileText },
  { idx: 1, title: "หมวดหมู่และหน่วย", desc: "หมวดหมู่ รหัส และหน่วยนับ", icon: Layers },
  { idx: 2, title: "ตรวจสอบและยืนยัน", desc: "สรุปข้อมูลก่อนสร้าง", icon: ClipboardCheck },
] as const;

const INITIAL_CAT_WIZARD: CategoryWizardState = {
  selectedExisting: null,
  newCategoryName: "",
  newCategoryProfileId: "",
  newCategoryDescription: "",
  isSubmitting: false,
};

function isCatStep(step: WizardStep): boolean {
  return step.startsWith("cat-");
}

export function AddItemModal({
  open,
  onClose,
  onCreated,
  defaultCode = "",
  onSelectExisting,
}: AddItemModalProps) {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const [state, setState] = useState<{
    step: WizardStep;
    form: ItemFormState;
    isSubmitting: boolean;
    catWizard: CategoryWizardState;
    codeMeta: CodeMeta | null;
    initialQty: number;
  }>({
    step: "details",
    form: {
      name: "",
      usageType: null,
      code: defaultCode,
      categoryId: "",
      categoryName: "",
      categoryType: "",
          profile: null,
      issueUnitId: "",
      issueUnitName: "",
      subUnitId: "",
      subUnitName: "",
      conversionFactor: 1,
    },
    isSubmitting: false,
    catWizard: { ...INITIAL_CAT_WIZARD },
    codeMeta: null,
    initialQty: 1,
  });

  const reset = useCallback(() => {
    setState({
      step: "details",
      form: {
        name: "",
        usageType: null,
        code: defaultCode,
        categoryId: "",
        categoryName: "",
        categoryType: "",
          profile: null,
        issueUnitId: "",
        issueUnitName: "",
        subUnitId: "",
        subUnitName: "",
        conversionFactor: 1,
      },
      isSubmitting: false,
      codeMeta: null,
      initialQty: 1,
      catWizard: { ...INITIAL_CAT_WIZARD },
    });
  }, [defaultCode]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // When usageType changes, clear step-2 fields so user picks fresh values
  const prevUsageType = useRef(state.form.usageType);
  useEffect(() => {
    if (prevUsageType.current !== state.form.usageType) {
      prevUsageType.current = state.form.usageType;
      setState((s) => ({
        ...s,
        form: {
          ...s.form,
          code: "",
          categoryId: "",
          categoryName: "",
          categoryType: "",
          profile: null,
          issueUnitId: "",
          issueUnitName: "",
          subUnitId: "",
          subUnitName: "",
          conversionFactor: 1,
        },
        copyCount: 1,
        codeMeta: null,
        initialQty: 1,
      }));
    }
  }, [state.form.usageType]);

  const handleCodeMetaChange = useCallback((meta: CodeMeta) => {
    setState((s) => {
      if (
        s.codeMeta?.copyCount === meta.copyCount &&
        s.codeMeta?.isSet === meta.isSet &&
        s.codeMeta?.setSize === meta.setSize
      ) return s;
      return { ...s, codeMeta: meta };
    });
  }, []);

  const setCatWizard = useCallback((updater: (prev: CategoryWizardState) => CategoryWizardState) => {
    setState((s) => ({ ...s, catWizard: updater(s.catWizard) }));
  }, []);

  // ── Helpers ─────────────────────────────────────────────────

  const allowedDispenseType = state.form.usageType
    ? USAGE_OPTIONS.find((o) => o.id === state.form.usageType)?.dispenseType
    : undefined;

  /** Apply a selected/created category, fetch suggested code, return to category-units step */
  const applyCategory = useCallback(async (cat: CategoryOption) => {
    const profile = cat.profile;
    const isItemTracked = profile?.dispenseType === "ITEM";
    setState((s) => ({
      ...s,
      step: "category-units",
      form: {
        ...s.form,
        categoryId: cat.id,
        categoryName: cat.name,
        categoryType: profile?.code ?? "",
        profile: profile ? { code: profile.code, dispenseType: profile.dispenseType, assetTracking: profile.assetTracking, setTracking: profile.setTracking } : null,
        // Reset code — let the builder component generate it for ITEM types
        code: isItemTracked ? "" : s.form.code,
      },
      catWizard: { ...INITIAL_CAT_WIZARD },
      codeMeta: isItemTracked ? null : s.codeMeta,
    }));

    // Auto-generate code only for flat types — builders handle themselves
    if (!isItemTracked && profile?.code) {
      try {
        const res = await fetch(`/api/items/suggest-code?prefix=${encodeURIComponent(profile.code)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.suggestedCode) {
            setState((s) => ({ ...s, form: { ...s.form, code: data.suggestedCode } }));
          }
        }
      } catch {
        // Silent fail — user can type code manually
      }
    }
  }, []);

  // ── Validation ──────────────────────────────────────────────

  const canNext =
    (state.step === "details" && state.form.name.trim() !== "" && state.form.usageType !== null) ||
    (state.step === "category-units" &&
      state.form.code.trim() !== "" &&
      state.form.categoryId !== "" &&
      state.form.issueUnitId !== "" &&
      state.form.subUnitId !== "") ||
    state.step === "summary" ||
    (state.step === "cat-create-name" && state.catWizard.newCategoryName.trim() !== "" && state.catWizard.newCategoryProfileId !== "") ||
    state.step === "cat-create-confirm";

  const handleBack = useCallback(() => {
    if (state.step === "category-units") {
      setState((s) => ({ ...s, step: "details" }));
    } else if (state.step === "summary") {
      setState((s) => ({ ...s, step: "category-units" }));
    } else if (state.step === "cat-select") {
      setState((s) => ({ ...s, step: "category-units" }));
    } else if (state.step === "cat-create-name") {
      setState((s) => ({ ...s, step: "cat-select" }));
    } else if (state.step === "cat-create-confirm") {
      setState((s) => ({ ...s, step: "cat-create-name" }));
    } else {
      handleClose();
    }
  }, [state.step, handleClose]);

  const handleNext = useCallback(async () => {
    if (state.step === "details") {
      setState((s) => ({ ...s, step: "category-units" }));
    } else if (state.step === "category-units") {
      setState((s) => ({ ...s, step: "summary" }));
    } else if (state.step === "summary") {
      setState((s) => ({ ...s, isSubmitting: true }));
      try {
        const isFlat = state.form.profile?.dispenseType !== "ITEM";
        const created = await quickCreateItem({
          code: state.form.code,
          name: state.form.name,
          categoryId: state.form.categoryId,
          issueUnitId: state.form.issueUnitId,
          subUnitId: state.form.subUnitId,
          conversionFactor: state.form.conversionFactor,
          copyCount: state.codeMeta?.copyCount ?? 1,
          setSize: state.codeMeta?.isSet ? state.codeMeta.setSize : 1,
          initialQty: isFlat ? state.initialQty : 0,
        });
        toast.success(`สร้างพัสดุ "${created.code}" สำเร็จ`);
        onCreated(created);
        handleClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "สร้างพัสดุไม่สำเร็จ");
        setState((s) => ({ ...s, isSubmitting: false }));
      }
    } else if (state.step === "cat-create-name") {
      setState((s) => ({ ...s, step: "cat-create-confirm" }));
    } else if (state.step === "cat-create-confirm") {
      // Create new category then apply
      setCatWizard((prev) => ({ ...prev, isSubmitting: true }));
      try {
        const cat = await createCategory({
          name: state.catWizard.newCategoryName,
          profileId: state.catWizard.newCategoryProfileId,
          description: state.catWizard.newCategoryDescription || undefined,
        });
        applyCategory(cat);
        toast.success(`สร้างหมวดหมู่ "${cat.name}" สำเร็จ`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "สร้างหมวดหมู่ไม่สำเร็จ");
        setCatWizard((prev) => ({ ...prev, isSubmitting: false }));
      }
    }
  }, [state, onCreated, handleClose, applyCategory, setCatWizard]);

  // ── Rendering helpers ───────────────────────────────────────

  // Main step index (cat-* steps map to step 2)
  const stepIdx = isCatStep(state.step) ? 1 : state.step === "details" ? 0 : state.step === "category-units" ? 1 : 2;
  const stepTitle = STEP_TITLES[state.step];
  const title = "เพิ่มพัสดุใหม่";

  function renderHeader() {
    return (
      <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <PackagePlus className="h-4 w-4" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">
              {isCatStep(state.step) ? stepTitle : `ขั้นตอนที่ ${stepIdx + 1} จาก 3`}
            </p>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  function renderProgress() {
    return (
      <div className="flex gap-1.5 bg-card px-6 pb-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i <= stepIdx ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>
    );
  }

  // Vertical stepper for desktop split-pane layout
  function renderSidebar() {
    return (
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
        {/* Sidebar header */}
        <div className="flex items-center border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PackagePlus className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-foreground">{title}</span>
          </div>
        </div>

        {/* Steps */}
        <nav className="flex flex-col gap-1 p-4">
          {MAIN_STEPS.map((step, i) => {
            const Icon = step.icon;
            const isComplete = stepIdx > step.idx;
            const isCurrent = stepIdx === step.idx;
            const isUpcoming = stepIdx < step.idx;
            return (
              <div
                key={step.idx}
                className={cn(
                  "flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
                  isCurrent && "bg-primary/5",
                )}
              >
                {/* Indicator */}
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    isComplete && "border-primary bg-primary text-primary-foreground",
                    isCurrent && "border-primary bg-card text-primary",
                    isUpcoming && "border-border bg-card text-muted-foreground",
                  )}
                >
                  {isComplete ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                {/* Label */}
                <div className="min-w-0 pt-0.5">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      isCurrent || isComplete ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {step.title}
                  </p>
                  {/* Show current sub-step label for category branch */}
                  {isCurrent && isCatStep(state.step) ? (
                    <p className="mt-0.5 text-xs text-primary">{stepTitle}</p>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted-foreground">{step.desc}</p>
                  )}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>
    );
  }

  function renderBody() {
    return (
      <div className="flex-1 overflow-y-auto bg-secondary/40 px-6 py-6">
        {state.step === "details" && (
          <StepItemDetails
            name={state.form.name}
            onNameChange={(n) => setState((s) => ({ ...s, form: { ...s.form, name: n } }))}
            usageType={state.form.usageType}
            onUsageTypeChange={(t) => setState((s) => ({ ...s, form: { ...s.form, usageType: t } }))}
            onSelectExisting={onSelectExisting}
          />
        )}
        {state.step === "category-units" && (
          <StepCategoryUnits
            code={state.form.code}
            onCodeChange={(c) => setState((s) => ({ ...s, form: { ...s.form, code: c } }))}
            categoryId={state.form.categoryId}
            categoryName={state.form.categoryName}
            onCategorySelect={(cat: CategoryOption) =>
              setState((s) => ({ ...s, form: { ...s.form, categoryId: cat.id, categoryName: cat.name } }))
            }
            allowedDispenseType={allowedDispenseType}
            issueUnitId={state.form.issueUnitId}
            issueUnitName={state.form.issueUnitName}
            subUnitId={state.form.subUnitId}
            subUnitName={state.form.subUnitName}
            onIssueUnitChange={(id, name) => setState((s) => ({ ...s, form: { ...s.form, issueUnitId: id, issueUnitName: name } }))}
            onSubUnitChange={(id, name) => setState((s) => ({ ...s, form: { ...s.form, subUnitId: id, subUnitName: name } }))}
            conversionFactor={state.form.conversionFactor}
            onConversionFactorChange={(f) => setState((s) => ({ ...s, form: { ...s.form, conversionFactor: f } }))}
            onOpenCategorySelect={() => setState((s) => ({ ...s, step: "cat-select" }))}
            categoryType={state.form.categoryType}
            profile={state.form.profile}
            onCodeMetaChange={handleCodeMetaChange}
            initialCodeMeta={state.codeMeta}
            initialQty={state.initialQty}
            onInitialQtyChange={(q) => setState((s) => ({ ...s, initialQty: q }))}
          />
        )}
        {state.step === "summary" && (
          <StepSummary
            name={state.form.name}
            usageType={state.form.usageType}
            code={state.form.code}
            categoryName={state.form.categoryName}
            categoryType={state.form.categoryType}
            issueUnitName={state.form.issueUnitName}
            subUnitName={state.form.subUnitName}
            conversionFactor={state.form.conversionFactor}
            codeMeta={state.codeMeta}
            initialQty={state.initialQty}
          />
        )}

        {/* ── Category sub-steps (inline) ── */}
        {state.step === "cat-select" && (
          <StepSelect
            selectedId={state.form.categoryId || null}
            onSelectExisting={(cat) => {
              applyCategory(cat);
            }}
            onSelectCreateNew={() => setState((s) => ({ ...s, step: "cat-create-name" }))}
            allowedDispenseType={allowedDispenseType}
          />
        )}
        {state.step === "cat-create-name" && (
          <StepCreateName
            name={state.catWizard.newCategoryName}
            onNameChange={(n) => setCatWizard((prev) => ({ ...prev, newCategoryName: n }))}
            profileId={state.catWizard.newCategoryProfileId}
            onProfileChange={(id) => setCatWizard((prev) => ({ ...prev, newCategoryProfileId: id }))}
            onSelectSimilar={(cat) => {
              setCatWizard((prev) => ({ ...prev, selectedExisting: cat }));
              setState((s) => ({ ...s, step: "cat-confirm-existing" }));
            }}
          />
        )}
        {state.step === "cat-create-confirm" && (
          <StepCreateConfirm
            name={state.catWizard.newCategoryName}
            profileId={state.catWizard.newCategoryProfileId}
            description={state.catWizard.newCategoryDescription}
            onDescriptionChange={(d) => setCatWizard((prev) => ({ ...prev, newCategoryDescription: d }))}
          />
        )}
      </div>
    );
  }

  function renderFooter() {
    return (
      <div className="flex items-center justify-between border-t border-border bg-card px-6 py-4">
        <Button variant="ghost" onClick={handleBack} className="gap-1.5">
          {state.step === "details" ? (
            "ยกเลิก"
          ) : (
            <>
              <ArrowLeft className="h-4 w-4" />
              ย้อนกลับ
            </>
          )}
        </Button>
        <Button
          disabled={!canNext || state.isSubmitting || state.catWizard.isSubmitting}
          onClick={handleNext}
          className="gap-1.5"
        >
          {state.step === "summary" ? (
            <>
              <Check className="h-4 w-4" />
              {state.isSubmitting ? "กำลังสร้าง..." : "สร้างพัสดุ"}
            </>
          ) : state.step === "cat-create-confirm" ? (
            <>
              <Check className="h-4 w-4" />
              {state.catWizard.isSubmitting ? "กำลังสร้าง..." : "สร้างหมวดหมู่"}
            </>
          ) : (
            <>
              ถัดไป
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    );
  }

  // ── Render Dialog OR Sheet ──────────────────────────────────

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent
          className="sm:max-w-3xl gap-0 overflow-hidden p-0 sm:rounded-2xl"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{stepTitle}</DialogDescription>
          <div className="relative flex h-[580px] w-full overflow-hidden">
            {renderSidebar()}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {renderBody()}
              {renderFooter()}
            </div>
            {/* Close button — top-right of modal */}
            <button
              onClick={handleClose}
              className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="ปิด"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <SheetContent
        side="bottom"
        className="h-[90vh] rounded-t-2xl gap-0 p-0 overflow-hidden"
        showCloseButton={false}
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <SheetDescription className="sr-only">{stepTitle}</SheetDescription>
        {renderHeader()}
        {renderProgress()}
        {renderBody()}
        {renderFooter()}
      </SheetContent>
    </Sheet>
  );
}
