"use client";

import { useState, useEffect, type ReactNode, type ComponentType } from "react";
import { Pencil, Copy, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface ShellTab {
  value: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
}

const GRID_COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" };

/**
 * Shared chrome for edit dialogs.
 * - Header: Pencil icon + title + orange code badge (copy). Toggle "เปิดใช้งาน"
 *   only renders when `isActive` + `onToggleActive` are both provided.
 * - Body: if `tabs` provided → renders the tab bar (Tabs/TabsList with sliding
 *   motion indicator, dynamic grid 1–4) + body wrapper; `children` must hold the
 *   matching <TabsContent> blocks. If no tabs → renders `children` directly.
 * - Footer: optional `leftIndicator`; when tabs are provided the "แท็บ x/n"
 *   indicator is computed automatically.
 */
export function EditDialogShell({
  open,
  onOpenChange,
  title,
  code,
  description,
  isActive,
  onToggleActive,
  tabs,
  saving = false,
  saveDisabled = false,
  saveLabel = "บันทึกการแก้ไข",
  savingLabel = "กำลังบันทึก...",
  leftIndicator,
  onSave,
  onCancel,
  children,
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  code: string;
  description?: string;
  isActive?: boolean;
  onToggleActive?: (v: boolean) => void;
  tabs?: readonly ShellTab[];
  saving?: boolean;
  saveDisabled?: boolean;
  saveLabel?: string;
  savingLabel?: string;
  leftIndicator?: ReactNode;
  onSave: () => void;
  onCancel: () => void;
  children: ReactNode;
  contentClassName?: string;
}) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(tabs?.[0]?.value ?? "");
  const showToggle = isActive !== undefined && onToggleActive !== undefined;

  // reset to the first tab whenever the dialog opens or the tab set changes.
  useEffect(() => {
    if (open && tabs && tabs.length) setActiveTab(tabs[0].value);
  }, [open, tabs]);

  const n = tabs?.length ?? 0;
  const idx = Math.max(0, tabs?.findIndex((t) => t.value === activeTab) ?? 0);
  const gridCols = GRID_COLS[n] ?? "grid-cols-4";

  const indicator = tabs && tabs.length ? (
    <>
      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
      แท็บ {idx + 1} / {n}
    </>
  ) : leftIndicator;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-[calc(100%-2rem)] sm:max-w-[640px] gap-0 p-0 overflow-hidden", contentClassName)}>
        <DialogHeader className="flex-row items-center gap-3 border-b border-border bg-card px-6 py-4 pr-14">
          <div className="flex shrink-0 min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Pencil className="h-4 w-4" />
            </div>
            <DialogTitle className="shrink-0 text-base font-semibold text-foreground">
              {title}
            </DialogTitle>
            {/* Code badge — read-only (identity), copy only */}
            <div className="flex shrink-0 items-center gap-1 rounded-full border border-orange-300/50 bg-orange-50 py-1 pl-2.5 pr-1 dark:border-orange-800 dark:bg-orange-950/30">
              <span className="ml-1 font-mono text-xs font-semibold tabular-nums text-orange-600 dark:text-orange-300">
                {code || "—"}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (code) {
                    navigator.clipboard.writeText(code);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 1500);
                  }
                }}
                className="flex h-6 w-6 items-center justify-center rounded-full text-orange-400 transition-colors hover:bg-orange-100 hover:text-orange-600 dark:hover:bg-orange-900/40"
                aria-label="คัดลอกรหัส"
              >
                {copiedCode ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </div>
          <div className="flex-1" />
          {showToggle && (
            <label
              className={cn(
                "flex cursor-pointer select-none items-center gap-2 rounded-full border px-3 py-1.5 transition-colors",
                isActive ? "border-success/30 bg-success/8 text-success" : "border-border bg-muted/60 text-muted-foreground",
              )}
            >
              <span className="text-xs font-medium">{isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span>
              <Switch
                checked={isActive}
                onCheckedChange={onToggleActive}
                aria-label="เปลี่ยนสถานะการใช้งาน"
                className={isActive ? "data-checked:!bg-success" : ""}
              />
            </label>
          )}
          <DialogDescription className="sr-only">{description ?? title}</DialogDescription>
        </DialogHeader>

        {tabs && tabs.length ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col">
            <TabsList className={cn("relative h-11 w-full shrink-0 rounded-none border-b border-border bg-muted/40 p-0", gridCols)}>
              <motion.span
                className="absolute inset-y-0 left-0 rounded-none bg-primary/10"
                style={{ width: `${100 / n}%` }}
                animate={{ x: `${idx * 100}%` }}
                initial={false}
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
              />
              {tabs.map((t) => {
                const Icon = t.icon;
                return (
                  <TabsTrigger key={t.value} value={t.value} className="gap-1.5 text-xs data-active:!bg-transparent data-active:!text-primary data-active:!shadow-none">
                    <span className="relative z-10 flex items-center gap-1.5">
                      {Icon && <Icon className="h-3.5 w-3.5" />}
                      <span className="hidden sm:inline">{t.label}</span>
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {/* Fixed height, not min/max: a short tab must not shrink the dialog when you switch to it. */}
            <div className="h-[55vh] overflow-y-auto bg-secondary/40 px-6 py-5">
              {children}
            </div>
          </Tabs>
        ) : children}

        <DialogFooter className="mx-0 mb-0 border-t border-border/60 bg-muted/30 px-6 py-3.5 sm:justify-between">
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">{indicator}</div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={saving}>ยกเลิก</Button>
            <Button onClick={onSave} disabled={saving || saveDisabled}>
              {saving ? savingLabel : saveLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
