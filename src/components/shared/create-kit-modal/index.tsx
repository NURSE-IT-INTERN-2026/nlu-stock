"use client";

import { useState, useCallback, useEffect } from "react";
import { Boxes, ListPlus, ClipboardCheck, ArrowLeft, ArrowRight, Check, X } from "lucide-react";
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
import { assembleKit } from "@/lib/api";
import type { CreateKitModalProps, KitFormState, ComponentRow, WizardStep } from "./types";
import { StepKitDetails } from "./step-kit-details";
import { StepComponents } from "./step-components";
import { StepAssemble } from "./step-assemble";

const STEP_TITLES: Record<WizardStep, string> = {
  "kit-details": "ข้อมูลชุด",
  components: "ส่วนประกอบ",
  assemble: "ประกอบและสรุป",
};

const MAIN_STEPS = [
  { idx: 0, title: "ข้อมูลชุด", desc: "ชื่อ หมวดหมู่ รหัส หน่วย", icon: Boxes },
  { idx: 1, title: "ส่วนประกอบ", desc: "พัสดุที่จะประกอบเป็นชุด", icon: ListPlus },
  { idx: 2, title: "ประกอบและสรุป", desc: "จำนวนที่จะประกอบ", icon: ClipboardCheck },
] as const;

const INITIAL_FORM: KitFormState = {
  name: "",
  code: "",
  issueUnitId: "",
  issueUnitName: "",
};

export function CreateKitModal({ open, onClose, onCreated }: CreateKitModalProps) {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const [step, setStep] = useState<WizardStep>("kit-details");
  const [form, setForm] = useState<KitFormState>(INITIAL_FORM);
  const [components, setComponents] = useState<ComponentRow[]>([]);
  const [assembleQty, setAssembleQty] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = useCallback(() => {
    setStep("kit-details");
    setForm(INITIAL_FORM);
    setComponents([]);
    setAssembleQty(1);
    setIsSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // ── Validation ──────────────────────────────────────────────
  const hasShortage = components.some((c) => c.quantity * assembleQty > c.availableQty);
  const canNext =
    (step === "kit-details" && form.name.trim() !== "" && form.issueUnitId !== "") ||
    (step === "components" && components.length >= 1) ||
    (step === "assemble" && !hasShortage);

  const handleBack = useCallback(() => {
    if (step === "components") setStep("kit-details");
    else if (step === "assemble") setStep("components");
    else handleClose();
  }, [step, handleClose]);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const result = await assembleKit({
        name: form.name.trim(),
        issueUnitId: form.issueUnitId,
        components: components.map((c) => ({ componentItemId: c.componentItemId, quantity: c.quantity })),
        assembleQty,
      });
      toast.success(`ประกอบชุด "${result.kitCode}" สำเร็จ ได้ ${result.assembledQty} ชุด`);
      onCreated(result);
      handleClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ประกอบชุดไม่สำเร็จ");
      setIsSubmitting(false);
    }
  }, [form, components, assembleQty, onCreated, handleClose]);

  const handleNext = useCallback(() => {
    if (step === "kit-details") setStep("components");
    else if (step === "components") setStep("assemble");
    else if (step === "assemble") handleSubmit();
  }, [step, handleSubmit]);

  // ── Component row handlers ──────────────────────────────────
  const addComponent = useCallback((row: ComponentRow) => {
    setComponents((s) => (s.some((c) => c.componentItemId === row.componentItemId) ? s : [...s, row]));
  }, []);
  const removeComponent = useCallback((id: string) => {
    setComponents((s) => s.filter((c) => c.componentItemId !== id));
  }, []);
  const changeQty = useCallback((id: string, qty: number) => {
    setComponents((s) => s.map((c) => (c.componentItemId === id ? { ...c, quantity: qty } : c)));
  }, []);

  // ── Rendering ───────────────────────────────────────────────
  const stepIdx = step === "kit-details" ? 0 : step === "components" ? 1 : 2;
  const stepTitle = STEP_TITLES[step];
  const title = "ประกอบชุดใหม่";

  function renderHeader() {
    return (
      <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Boxes className="h-4 w-4" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{`ขั้นตอนที่ ${stepIdx + 1} จาก 3`}</p>
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

  function renderSidebar() {
    return (
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="flex items-center border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Boxes className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-foreground">{title}</span>
          </div>
        </div>
        <nav className="flex flex-col gap-1 p-4">
          {MAIN_STEPS.map((s) => {
            const Icon = s.icon;
            const isComplete = stepIdx > s.idx;
            const isCurrent = stepIdx === s.idx;
            const isUpcoming = stepIdx < s.idx;
            return (
              <div
                key={s.idx}
                className={cn(
                  "flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
                  isCurrent && "bg-primary/5",
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    isComplete && "border-primary bg-primary text-primary-foreground",
                    isCurrent && "border-primary bg-card text-primary",
                    isUpcoming && "border-border bg-card text-muted-foreground",
                  )}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <div className="min-w-0 pt-0.5">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      isCurrent || isComplete ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {s.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.desc}</p>
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
        {step === "kit-details" && (
          <StepKitDetails
            form={form}
            onUpdate={(patch) => setForm((s) => ({ ...s, ...patch }))}
          />
        )}
        {step === "components" && (
          <StepComponents
            components={components}
            onAdd={addComponent}
            onRemove={removeComponent}
            onQtyChange={changeQty}
          />
        )}
        {step === "assemble" && (
          <StepAssemble
            kitName={form.name}
            kitCode={form.code}
            issueUnitName={form.issueUnitName}
            components={components}
            assembleQty={assembleQty}
            onAssembleQtyChange={setAssembleQty}
          />
        )}
      </div>
    );
  }

  function renderFooter() {
    return (
      <div className="flex items-center justify-between border-t border-border bg-card px-6 py-4">
        <Button variant="ghost" onClick={handleBack} className="gap-1.5">
          {step === "kit-details" ? (
            "ยกเลิก"
          ) : (
            <>
              <ArrowLeft className="h-4 w-4" />
              ย้อนกลับ
            </>
          )}
        </Button>
        <Button
          disabled={!canNext || isSubmitting}
          onClick={handleNext}
          className="gap-1.5"
        >
          {step === "assemble" ? (
            <>
              <Check className="h-4 w-4" />
              {isSubmitting ? "กำลังประกอบ..." : "ประกอบชุด"}
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

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent
          className="sm:max-w-3xl gap-0 overflow-hidden p-0 sm:rounded-2xl"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{stepTitle}</DialogDescription>
          <div className="relative flex h-[600px] w-full overflow-hidden">
            {renderSidebar()}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {renderBody()}
              {renderFooter()}
            </div>
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
