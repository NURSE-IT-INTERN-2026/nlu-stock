"use client";

import { useState, useCallback, useEffect } from "react";
import { Plus, ArrowLeft, ArrowRight, Check, X } from "lucide-react";
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
import { createCategory } from "@/lib/api";
import type { CategoryOption } from "@/lib/api";
import type { CategorySelectModalProps, WizardState, WizardStep } from "./types";
import { StepSelect } from "./step-select";
import { StepConfirmExisting } from "./step-confirm-existing";
import { StepCreateName } from "./step-create-name";
import { StepCreateConfirm } from "./step-create-confirm";

const STEP_TITLES: Record<WizardStep, string> = {
  select: "เลือกหมวดหมู่",
  "confirm-existing": "ยืนยันหมวดหมู่",
  "create-name": "สร้างหมวดหมู่ใหม่",
  "create-confirm": "ตรวจสอบและยืนยัน",
};

function getProgressIndex(step: WizardStep): number {
  if (step === "select") return 0;
  if (step === "confirm-existing" || step === "create-name") return 1;
  return 2;
}

function getProgressTotal(step: WizardStep): number {
  if (step === "select" || step === "confirm-existing") return 2;
  return 3;
}

export function CategorySelectModal({
  open,
  onClose,
  onSelect,
  title = "เลือกหมวดหมู่",
}: CategorySelectModalProps) {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const [state, setState] = useState<WizardState>({
    step: "select",
    selectedExisting: null,
    newCategoryName: "",
    newCategoryProfileId: "",
    newCategoryDescription: "",
    isSubmitting: false,
  });

  const reset = useCallback(() => {
    setState({
      step: "select",
      selectedExisting: null,
      newCategoryName: "",
      newCategoryProfileId: "",
      newCategoryDescription: "",
      isSubmitting: false,
    });
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // ── Navigation ──────────────────────────────────────────────

  const handleSelectExisting = useCallback((cat: CategoryOption) => {
    setState((s) => ({ ...s, selectedExisting: cat, step: "confirm-existing" }));
  }, []);

  const handleSelectCreateNew = useCallback(() => {
    setState((s) => ({
      ...s,
      step: "create-name",
      selectedExisting: null,
      newCategoryName: "",
      newCategoryProfileId: "",
    }));
  }, []);

  const handleSelectSimilar = useCallback((cat: CategoryOption) => {
    setState((s) => ({ ...s, selectedExisting: cat, step: "confirm-existing" }));
  }, []);

  const handleConfirmExisting = useCallback(() => {
    if (state.selectedExisting) {
      onSelect(state.selectedExisting);
      handleClose();
    }
  }, [state.selectedExisting, onSelect, handleClose]);

  const handleConfirmCreate = useCallback(async () => {
    setState((s) => ({ ...s, isSubmitting: true }));
    try {
      const created = await createCategory({
        name: state.newCategoryName,
        profileId: state.newCategoryProfileId,
        description: state.newCategoryDescription || undefined,
      });
      toast.success("สร้างหมวดหมู่สำเร็จ");
      onSelect(created);
      handleClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้างหมวดหมู่ไม่สำเร็จ");
      setState((s) => ({ ...s, isSubmitting: false }));
    }
  }, [state.newCategoryName, state.newCategoryProfileId, state.newCategoryDescription, onSelect, handleClose]);

  // ── Validation ──────────────────────────────────────────────

  const canNext =
    state.step === "confirm-existing" ||
    (state.step === "create-name" && state.newCategoryName.trim() !== "" && state.newCategoryProfileId) ||
    state.step === "create-confirm";

  const handleBack = useCallback(() => {
    if (state.step === "confirm-existing" || state.step === "create-name") {
      setState((s) => ({ ...s, step: "select" }));
    } else if (state.step === "create-confirm") {
      setState((s) => ({ ...s, step: "create-name" }));
    } else {
      handleClose();
    }
  }, [state.step, handleClose]);

  const handleNext = useCallback(() => {
    if (state.step === "confirm-existing") {
      handleConfirmExisting();
    } else if (state.step === "create-name") {
      setState((s) => ({ ...s, step: "create-confirm" }));
    } else if (state.step === "create-confirm") {
      handleConfirmCreate();
    }
  }, [state.step, handleConfirmExisting, handleConfirmCreate]);

  // ── Shared rendering helpers ────────────────────────────────

  const progressIdx = getProgressIndex(state.step);
  const progressTotal = getProgressTotal(state.step);
  const stepTitle = STEP_TITLES[state.step];

  function renderHeader() {
    return (
      <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Plus className="h-4 w-4" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{stepTitle}</p>
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
        {Array.from({ length: progressTotal }).map((_, i) => (
          <div
            key={`${progressTotal}-${i}`}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i <= progressIdx ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>
    );
  }

  function renderBody() {
    return (
      <div className="max-h-[60vh] overflow-y-auto bg-secondary/40 px-6 py-6">
        {state.step === "select" && (
          <StepSelect
            selectedId={state.selectedExisting?.id ?? null}
            onSelectExisting={handleSelectExisting}
            onSelectCreateNew={handleSelectCreateNew}
          />
        )}
        {state.step === "confirm-existing" && state.selectedExisting && (
          <StepConfirmExisting category={state.selectedExisting} />
        )}
        {state.step === "create-name" && (
          <StepCreateName
            name={state.newCategoryName}
            onNameChange={(n) => setState((s) => ({ ...s, newCategoryName: n }))}
            profileId={state.newCategoryProfileId}
            onProfileChange={(id) => setState((s) => ({ ...s, newCategoryProfileId: id }))}
            onSelectSimilar={handleSelectSimilar}
          />
        )}
        {state.step === "create-confirm" && (
          <StepCreateConfirm
            name={state.newCategoryName}
            profileId={state.newCategoryProfileId}
            description={state.newCategoryDescription}
            onDescriptionChange={(d) => setState((s) => ({ ...s, newCategoryDescription: d }))}
          />
        )}
      </div>
    );
  }

  function renderFooter() {
    return (
      <div className="flex items-center justify-between border-t border-border bg-card px-6 py-4">
        <Button variant="ghost" onClick={handleBack} className="gap-1.5">
          {state.step === "select" ? (
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
          {state.step === "confirm-existing" || state.step === "create-confirm" ? (
            <>
              <Check className="h-4 w-4" />
              {state.isSubmitting ? "กำลังบันทึก..." : "บันทึก"}
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

  // ── Render Dialog OR Sheet — never both ────────────────────────
  //    Use JS media query to pick one, avoiding dual focus-trap.

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
