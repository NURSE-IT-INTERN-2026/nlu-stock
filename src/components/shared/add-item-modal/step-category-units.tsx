"use client";

import { useState, useEffect, useCallback } from "react";
import { FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getUnits } from "@/lib/api";
import type { CategoryOption, UnitOption } from "@/lib/api";
import { CodeBuilder } from "./code-builder";
import type { CodeMeta } from "./code-builder";
import type { FormProfile } from "./types";

interface StepCategoryUnitsProps {
  code: string;
  onCodeChange: (code: string) => void;
  categoryId: string;
  categoryName: string;
  onCategorySelect: (cat: CategoryOption) => void;
  /** Filter categories by dispenseType */
  allowedDispenseType?: "CONSUMABLE" | "COUNT" | "ITEM";
  issueUnitId: string;
  issueUnitName?: string;
  subUnitId: string;
  subUnitName?: string;
  onIssueUnitChange: (id: string, name: string) => void;
  onSubUnitChange: (id: string, name: string) => void;
  conversionFactor: number;
  onConversionFactorChange: (factor: number) => void;
  /** Opens inline category selection step */
  onOpenCategorySelect: () => void;
  /** Category type code (profile.code) — used as code prefix */
  categoryType?: string;
  /** Profile flags driving builder/field visibility */
  profile?: FormProfile | null;
  onCodeMetaChange?: (meta: CodeMeta) => void;
  initialCodeMeta?: CodeMeta | null;
  /** Initial stock quantity for flat types (CON/DUR/KIT) */
  initialQty?: number;
  onInitialQtyChange?: (q: number) => void;
}

export function StepCategoryUnits({
  code,
  onCodeChange,
  categoryId,
  categoryName,
  onCategorySelect,
  allowedDispenseType,
  issueUnitId,
  issueUnitName: issueUnitNameProp = "",
  subUnitId,
  subUnitName: subUnitNameProp = "",
  onIssueUnitChange,
  onSubUnitChange,
  conversionFactor,
  onConversionFactorChange,
  onOpenCategorySelect,
  categoryType,
  profile,
  onCodeMetaChange,
  initialCodeMeta,
  initialQty = 1,
  onInitialQtyChange,
}: StepCategoryUnitsProps) {
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);

  const fetchUnits = useCallback(async () => {
    if (units.length > 0) return;
    setUnitsLoading(true);
    try {
      const data = await getUnits();
      setUnits(data);
    } catch {
      toast.error("โหลดหน่วยไม่สำเร็จ");
    }
    setUnitsLoading(false);
  }, [units.length]);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

  // When units finish loading, sync names for any IDs already set (e.g. after back-navigation)
  useEffect(() => {
    if (!units.length) return;
    if (issueUnitId) {
      const name = units.find((u) => u.id === issueUnitId)?.name ?? "";
      if (name) onIssueUnitChange(issueUnitId, name);
    }
    if (subUnitId) {
      const name = units.find((u) => u.id === subUnitId)?.name ?? "";
      if (name) onSubUnitChange(subUnitId, name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units]);

  return (
    <div className="space-y-5">
      {/* Category — primary, drives code generation */}
      <div className="space-y-2">
        <Label htmlFor="cat-btn">หมวดหมู่ <span className="text-destructive">*</span></Label>
        <button
          id="cat-btn"
          type="button"
          onClick={onOpenCategorySelect}
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            categoryId
              ? "border-primary/30 bg-primary/[0.02] text-foreground"
              : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
          )}
        >
          <FolderOpen className={cn("h-4 w-4 shrink-0", categoryId ? "text-primary" : "text-muted-foreground")} />
          <span className="flex-1 min-w-0 truncate">
            {categoryId ? categoryName : "เลือกหมวดหมู่..."}
          </span>
        </button>
      </div>

      {/* Code — auto-generates from category */}
      <div className="space-y-2">
        <Label htmlFor="item-code">รหัสพัสดุ</Label>
        {!categoryType ? (
          <Input id="item-code" placeholder="—" disabled className="bg-card text-muted-foreground" />
        ) : profile?.dispenseType === "ITEM" ? (
          <CodeBuilder
            prefix={categoryType}
            canSet={profile.setTracking}
            value={code}
            onChange={onCodeChange}
            copyCount={initialCodeMeta?.copyCount ?? 1}
            onCopyCountChange={(count) =>
              onCodeMetaChange?.({
                copyCount: count,
                isSet: initialCodeMeta?.isSet ?? false,
                setSize: initialCodeMeta?.setSize ?? 2,
              })
            }
            onMetaChange={onCodeMetaChange}
            initialMeta={initialCodeMeta}
          />
        ) : (
          <div className="space-y-2">
            {code ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <span className="text-xs text-muted-foreground">รหัสที่จะได้:</span>
                <p className="text-sm font-mono font-semibold text-foreground">{code}</p>
              </div>
            ) : (
              <div className="h-9 rounded-md border bg-muted animate-pulse" />
            )}

            {/* Initial stock quantity for flat types */}
            <div className="w-full rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-4 px-3 py-2.5">
                <Label htmlFor="initial-qty" className="text-sm">จำนวนเริ่มต้น</Label>
                <Input
                  id="initial-qty"
                  type="number"
                  min={0}
                  value={initialQty}
                  onChange={(e) => onInitialQtyChange?.(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-20 bg-background text-center text-gray-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Units + conversion factor as a single equation row */}
      {unitsLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-2" role="group" aria-labelledby="conv-rate-label">
          <Label id="conv-rate-label" className="text-xs">อัตราแปลงหน่วย</Label>
          <div className="grid grid-cols-[1fr_28px_88px_1fr] gap-x-1.5 gap-y-1">
            {/* Labels row */}
            <Label htmlFor="issue-unit-select" className="text-xs text-muted-foreground font-normal">หน่วยเบิก <span className="text-destructive">*</span></Label>
            <span />
            <Label htmlFor="conv-factor" className="text-xs text-muted-foreground font-normal">จำนวน</Label>
            <Label htmlFor="sub-unit-select" className="text-xs text-muted-foreground font-normal">หน่วยย่อย <span className="text-destructive">*</span></Label>

            {/* Controls row */}
            <Select
              value={issueUnitId}
              onValueChange={(v) => {
                if (!v) return;
                const name = units.find((u) => u.id === v)?.name ?? "";
                onIssueUnitChange(v, name);
                if (!subUnitId) onSubUnitChange(v, name);
              }}
            >
              <SelectTrigger id="issue-unit-select" className="bg-card">
                <span className={issueUnitId ? "text-foreground" : "text-muted-foreground"}>
                  {issueUnitId
                    ? ((units.find((u) => u.id === issueUnitId)?.name ?? issueUnitNameProp) || "เลือก")
                    : "เลือก"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex h-9 items-center justify-center text-sm text-muted-foreground">มี</div>

            <Input
              id="conv-factor"
              type="number"
              min={1}
              value={conversionFactor}
              onChange={(e) => onConversionFactorChange(parseInt(e.target.value) || 1)}
              className="bg-card text-center"
            />

            <Select value={subUnitId} onValueChange={(v) => {
              if (!v) return;
              const name = units.find((u) => u.id === v)?.name ?? "";
              onSubUnitChange(v, name);
            }}>
              <SelectTrigger id="sub-unit-select" className="bg-card">
                <span className={subUnitId ? "text-foreground" : "text-muted-foreground"}>
                  {subUnitId
                    ? ((units.find((u) => u.id === subUnitId)?.name ?? subUnitNameProp) || "เลือก")
                    : "เลือก"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preview of the actual relationship */}
          {issueUnitId && subUnitId && (
            <p className="text-xs text-muted-foreground">
              = 1 {units.find((u) => u.id === issueUnitId)?.name ?? "..."} มี {conversionFactor} {units.find((u) => u.id === subUnitId)?.name ?? "..."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
