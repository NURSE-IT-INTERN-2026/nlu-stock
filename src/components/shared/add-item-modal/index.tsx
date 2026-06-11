"use client";

import { useState, useCallback, useEffect } from "react";
import { PackagePlus, ArrowLeft, ArrowRight, Check, X } from "lucide-react";
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
import { quickCreateItem } from "@/lib/api";
import type { CategoryOption } from "@/lib/api";
import type { AddItemModalProps, ItemFormState, WizardStep } from "./types";
import { USAGE_OPTIONS } from "./types";
import { StepItemDetails } from "./step-item-details";
import { StepCategoryUnits } from "./step-category-units";
import { StepSummary } from "./step-summary";

const STEP_TITLES: Record<WizardStep, string> = {
  details: "ข้อมูลพัสดุ",
  "category-units": "หมวดหมู่และหน่วย",
  summary: "ตรวจสอบและยืนยัน",
};

export function AddItemModal({
  open,
  onClose,
  onCreated,
  defaultCode = "",
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
  }>({
    step: "details",
    form: {
      name: "",
      usageType: null,
      code: defaultCode,
      categoryId: "",
      categoryName: "",
      issueUnitId: "",
      subUnitId: "",
      conversionFactor: 1,
    },
    isSubmitting: false,
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
        issueUnitId: "",
        subUnitId: "",
        conversionFactor: 1,
      },
      isSubmitting: false,
    });
  }, [defaultCode]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // ── Validation ──────────────────────────────────────────────

  const canNext =
    (state.step === "details" && state.form.name.trim() !== "" && state.form.usageType !== null) ||
    (state.step === "category-units" &&
      state.form.code.trim() !== "" &&
      state.form.categoryId !== "" &&
      state.form.issueUnitId !== "" &&
      state.form.subUnitId !== "") ||
    state.step === "summary";

  const handleBack = useCallback(() => {
    if (state.step === "category-units") {
      setState((s) => ({ ...s, step: "details" }));
    } else if (state.step === "summary") {
      setState((s) => ({ ...s, step: "category-units" }));
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
        const created = await quickCreateItem({
          code: state.form.code,
          name: state.form.name,
          categoryId: state.form.categoryId,
          issueUnitId: state.form.issueUnitId,
          subUnitId: state.form.subUnitId,
          conversionFactor: state.form.conversionFactor,
        });
        toast.success(`สร้างพัสดุ "${created.code}" สำเร็จ`);
        onCreated(created);
        handleClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "สร้างพัสดุไม่สำเร็จ");
        setState((s) => ({ ...s, isSubmitting: false }));
      }
    }
  }, [state, onCreated, handleClose]);

  // ── Rendering helpers ───────────────────────────────────────

  const stepIdx = state.step === "details" ? 0 : state.step === "category-units" ? 1 : 2;
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
            <p className="text-xs text-muted-foreground">ขั้นตอนที่ {stepIdx + 1} จาก 3</p>
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

  function renderBody() {
    return (
      <div className="max-h-[60vh] overflow-y-auto bg-secondary/40 px-6 py-6">
        {state.step === "details" && (
          <StepItemDetails
            name={state.form.name}
            onNameChange={(n) => setState((s) => ({ ...s, form: { ...s.form, name: n } }))}
            usageType={state.form.usageType}
            onUsageTypeChange={(t) => setState((s) => ({ ...s, form: { ...s.form, usageType: t } }))}
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
            allowedCategoryTypes={
              state.form.usageType
                ? USAGE_OPTIONS.find((o) => o.id === state.form.usageType)?.categories
                : undefined
            }
            issueUnitId={state.form.issueUnitId}
            subUnitId={state.form.subUnitId}
            onIssueUnitChange={(id) => setState((s) => ({ ...s, form: { ...s.form, issueUnitId: id } }))}
            onSubUnitChange={(id) => setState((s) => ({ ...s, form: { ...s.form, subUnitId: id } }))}
            conversionFactor={state.form.conversionFactor}
            onConversionFactorChange={(f) => setState((s) => ({ ...s, form: { ...s.form, conversionFactor: f } }))}
          />
        )}
        {state.step === "summary" && (
          <StepSummary
            name={state.form.name}
            usageType={state.form.usageType}
            code={state.form.code}
            categoryName={state.form.categoryName}
            issueUnitName={state.form.issueUnitId}
            subUnitName={state.form.subUnitId}
            conversionFactor={state.form.conversionFactor}
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
          disabled={!canNext || state.isSubmitting}
          onClick={handleNext}
          className="gap-1.5"
        >
          {state.step === "summary" ? (
            <>
              <Check className="h-4 w-4" />
              {state.isSubmitting ? "กำลังสร้าง..." : "สร้างและเพิ่ม"}
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
          className="max-w-2xl gap-0 overflow-hidden p-0 sm:rounded-2xl"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{stepTitle}</DialogDescription>
          {renderHeader()}
          {renderProgress()}
          {renderBody()}
          {renderFooter()}
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
