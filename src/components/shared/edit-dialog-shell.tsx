"use client";

import { useState, type ReactNode } from "react";
import { Pencil, Copy, Check } from "lucide-react";
import { DIALOG_SHELL, DIALOG_BODY, Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared chrome for edit dialogs.
 * - Header: Pencil icon + title + orange code badge (copy). Toggle "เปิดใช้งาน"
 *   only renders when `isActive` + `onToggleActive` are both provided.
 * - Body: one locked-height scroll area; `children` is a single form split by
 *   <Separator> + heading. It used to support a tab bar — every section reads
 *   better in one scroll, so the tabs went rather than sitting here unused.
 * - Footer: optional `leftIndicator`.
 */
export function EditDialogShell({
  open,
  onOpenChange,
  title,
  code,
  description,
  isActive,
  onToggleActive,
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
  const showToggle = isActive !== undefined && onToggleActive !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-[calc(100%-2rem)] sm:max-w-[640px] gap-0 p-0 overflow-hidden", contentClassName)}>
       <div className={DIALOG_SHELL}>
        <DialogHeader className="flex-row items-center gap-3 shrink-0 border-b border-border bg-card px-6 py-4 pr-14">
          {/* The title group has to give way, not the toggle: at 375px a shrink-0
              title pushed the เปิดใช้งาน switch clean outside the dialog. */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Pencil className="h-4 w-4" />
            </div>
            {/* At 375px the row cannot hold icon + title + code + switch. The title is the
                part that drops: the pencil already says "edit" and the code says which item. */}
            <DialogTitle className="hidden truncate text-base font-semibold text-foreground sm:block">
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
          {showToggle && (
            <label
              className={cn(
                "flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-full border px-3 py-1.5 transition-colors",
                isActive ? "border-success/30 bg-success/8 text-success" : "border-border bg-muted/60 text-muted-foreground",
              )}
            >
              <span className="hidden text-xs font-medium sm:inline">{isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span>
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

        <div className={cn(DIALOG_BODY, "bg-secondary/40 px-6 py-5")}>{children}</div>

        <DialogFooter className="mx-0 mb-0 shrink-0 border-t border-border/60 bg-muted/30 px-6 py-3.5 sm:justify-between">
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">{leftIndicator}</div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={saving}>ยกเลิก</Button>
            <Button onClick={onSave} disabled={saving || saveDisabled}>
              {saving ? savingLabel : saveLabel}
            </Button>
          </div>
        </DialogFooter>
       </div>
      </DialogContent>
    </Dialog>
  );
}
