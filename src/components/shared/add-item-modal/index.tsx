"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { PackagePlus, ArrowLeft, ArrowRight, Check, X, FileText, Layers, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DIALOG_SHELL_ROW,
  DIALOG_BODY,
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
import { type LocationRef, resolveLocationId } from "@/components/shared/location-cascade-picker";
import type { CodeMeta } from "./code-builder";
import { StepSummary } from "./step-summary";
import { withBase } from "@/lib/base-path";

const STEP_TITLES: Record<WizardStep, string> = {
  details: "ข้อมูลพัสดุ",
  "category-units": "หมวดหมู่และหน่วย",
  summary: "ตรวจสอบและยืนยัน",
};

// Sidebar stepper metadata
const MAIN_STEPS = [
  { idx: 0, title: "ข้อมูลพัสดุ", desc: "ชื่อและประเภทการใช้งาน", icon: FileText },
  { idx: 1, title: "หมวดหมู่และหน่วย", desc: "หมวดหมู่ รหัส และหน่วยนับ", icon: Layers },
  { idx: 2, title: "ตรวจสอบและยืนยัน", desc: "สรุปข้อมูลก่อนสร้าง", icon: ClipboardCheck },
] as const;

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
    codeMeta: CodeMeta | null;
    initialQty: number;
    qtyValid: boolean;
    /** ที่จัดเก็บที่เลือกไว้ — ยังไม่ resolve เป็น id จนกว่าจะกดสร้างจริง ไม่งั้นแค่พิมพ์ผ่านๆ
     *  ก็ไปสร้าง Location เปล่าค้างในทะเบียนแล้ว (resolveLocationId เป็น findOrCreate) */
    locationRef: LocationRef | null;
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
      description: "",
    },
    isSubmitting: false,
    codeMeta: null,
    initialQty: 1,
    qtyValid: true,
    locationRef: null,
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
        description: "",
      },
      isSubmitting: false,
      codeMeta: null,
      initialQty: 1,
      qtyValid: true,
      locationRef: null,
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
        },
        codeMeta: null,
        initialQty: 1,
        qtyValid: true,
        locationRef: null,
      }));
    }
  }, [state.form.usageType]);

  const handleCodeMetaChange = useCallback((meta: CodeMeta) => {
    setState((s) => {
      if (s.codeMeta?.copyCount === meta.copyCount) return s;
      return { ...s, codeMeta: meta };
    });
  }, []);

  // ── Helpers ─────────────────────────────────────────────────

  const allowedDispenseType = state.form.usageType
    ? USAGE_OPTIONS.find((o) => o.id === state.form.usageType)?.dispenseType
    : undefined;

  /** Apply the picked category and fetch the code the system suggests for its prefix */
  const applyCategory = useCallback(async (cat: CategoryOption) => {
    const profile = cat.profile;
    const isItemTracked = profile?.dispenseType === "ITEM";
    setState((s) => ({
      ...s,
      form: {
        ...s.form,
        categoryId: cat.id,
        categoryName: cat.name,
        categoryType: profile?.code ?? "",
        profile: profile ? { code: profile.code, dispenseType: profile.dispenseType, assetTracking: profile.assetTracking } : null,
        // Reset code — let the builder component generate it for ITEM types
        code: isItemTracked ? "" : s.form.code,
      },
      codeMeta: isItemTracked ? null : s.codeMeta,
    }));

    // Auto-generate code only for flat types — builders handle themselves
    if (!isItemTracked && profile?.code) {
      try {
        const res = await fetch(withBase(`/api/items/suggest-code?prefix=${encodeURIComponent(profile.code)}`));
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
      state.locationRef?.kind === "ok" &&
      state.qtyValid) ||
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
        const isFlat = state.form.profile?.dispenseType !== "ITEM";
        // ที่จัดเก็บบังคับแล้ว (canNext gate) — resolve ล้มก็ต้องล้มทั้งใบ ไม่ใช่สร้างพัสดุ
        // ที่ค้างเป็น "ไม่ระบุ" ซึ่งเป็นสภาพที่การบังคับกรอกมีไว้กันพอดี
        const locationId = state.locationRef ? await resolveLocationId(state.locationRef) : null;
        const created = await quickCreateItem({
          code: state.form.code,
          name: state.form.name,
          categoryId: state.form.categoryId,
          issueUnitId: state.form.issueUnitId,
          copyCount: state.codeMeta?.copyCount ?? 1,
          initialQty: isFlat ? state.initialQty : 0,
          description: state.form.description || undefined,
          locationId,
        });
        toast.success(`สร้างพัสดุ "${created.name}" สำเร็จ`);
        onCreated(created);
        handleClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "สร้างพัสดุไม่สำเร็จ");
        setState((s) => ({ ...s, isSubmitting: false }));
      }
    }
  }, [state, onCreated, handleClose]);

  // ── Rendering helpers ───────────────────────────────────────

  // Main step index (cat-* steps map to step 2)
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
            <p className="text-xs text-muted-foreground">
              {`ขั้นตอนที่ ${stepIdx + 1} จาก 3`}
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
          {MAIN_STEPS.map((step) => {
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
                  <p className="mt-0.5 text-xs text-muted-foreground">{step.desc}</p>
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
      <div className={cn(DIALOG_BODY, "bg-secondary/40 px-6 py-6")}>
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
            onCategoryChange={applyCategory}
            allowedDispenseType={allowedDispenseType}
            issueUnitId={state.form.issueUnitId}
            issueUnitName={state.form.issueUnitName}
            onIssueUnitChange={(id, name) => setState((s) => ({ ...s, form: { ...s.form, issueUnitId: id, issueUnitName: name } }))}
            categoryType={state.form.categoryType}
            profile={state.form.profile}
            onCodeMetaChange={handleCodeMetaChange}
            initialCodeMeta={state.codeMeta}
            initialQty={state.initialQty}
            onInitialQtyChange={(q) => setState((s) => ({ ...s, initialQty: q }))}
            onQtyValidChange={(v) => setState((s) => ({ ...s, qtyValid: v }))}
            onLocationChange={(ref) => setState((s) => ({ ...s, locationRef: ref }))}
            description={state.form.description}
            onDescriptionChange={(d) => setState((s) => ({ ...s, form: { ...s.form, description: d } }))}
          />
        )}
        {state.step === "summary" && (
          <StepSummary
            name={state.form.name}
            usageType={state.form.usageType}
            code={state.form.code}
            categoryName={state.form.categoryName}
            issueUnitName={state.form.issueUnitName}
            locationLabel={
              state.locationRef?.kind === "ok"
                ? [state.locationRef.building, state.locationRef.floor, state.locationRef.room, state.locationRef.detail]
                    .filter(Boolean).join(" / ")
                : ""
            }
            codeMeta={state.codeMeta}
            initialQty={state.initialQty}
            description={state.form.description}
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
              {state.isSubmitting ? "กำลังสร้าง..." : "สร้างพัสดุ"}
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
          <div className={cn("relative", DIALOG_SHELL_ROW)}>
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
        className="h-[90dvh] rounded-t-2xl gap-0 p-0 overflow-hidden"
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
