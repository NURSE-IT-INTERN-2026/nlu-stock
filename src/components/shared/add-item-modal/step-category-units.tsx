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
import type { Category } from "@/lib/constants";
import { BookCodeBuilder } from "./book-code-builder";

interface StepCategoryUnitsProps {
  code: string;
  onCodeChange: (code: string) => void;
  categoryId: string;
  categoryName: string;
  onCategorySelect: (cat: CategoryOption) => void;
  /** Filter categories to only these types */
  allowedCategoryTypes?: Category[];
  issueUnitId: string;
  subUnitId: string;
  onIssueUnitChange: (id: string) => void;
  onSubUnitChange: (id: string) => void;
  conversionFactor: number;
  onConversionFactorChange: (factor: number) => void;
  /** Opens inline category selection step */
  onOpenCategorySelect: () => void;
  /** Category type code (e.g. "CON", "KRU"). Used to determine if code input should be disabled */
  categoryType?: string;
  /** Number of copies (for BOOK/TOY) */
  copyCount?: number;
  onCopyCountChange?: (count: number) => void;
}

export function StepCategoryUnits({
  code,
  onCodeChange,
  categoryId,
  categoryName,
  onCategorySelect,
  allowedCategoryTypes,
  issueUnitId,
  subUnitId,
  onIssueUnitChange,
  onSubUnitChange,
  conversionFactor,
  onConversionFactorChange,
  onOpenCategorySelect,
  categoryType,
  copyCount = 1,
  onCopyCountChange,
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

  return (
    <div className="space-y-5">
      {/* Code */}
      <div className="space-y-2">
        <Label>รหัสพัสดุ</Label>
        {!categoryType ? (
          <Input placeholder="เลือกหมวดหมู่ก่อน" disabled className="bg-card" />
        ) : categoryType === "BOOK" || categoryType === "TOY" ? (
          <BookCodeBuilder
            prefix={categoryType}
            value={code}
            onChange={onCodeChange}
            copyCount={copyCount}
            onCopyCountChange={onCopyCountChange ?? (() => {})}
          />
        ) : (
          <Input
            placeholder="กำลังสร้างรหัส..."
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            className="bg-card"
          />
        )}
      </div>

      {/* Category */}
      <div className="space-y-2">
        <Label>หมวดหมู่</Label>
        <button
          type="button"
          onClick={onOpenCategorySelect}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all",
            categoryId
              ? "border-primary/30 bg-primary/[0.02]"
              : "border-dashed border-primary/30 hover:border-primary/50 hover:bg-primary/[0.02]",
          )}
        >
          <div className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            categoryId ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}>
            <FolderOpen className="h-4 w-4" />
          </div>
          <div className="flex-1">
            {categoryId ? (
              <span className="text-sm font-medium text-foreground">{categoryName}</span>
            ) : (
              <>
                <span className="text-sm font-medium text-foreground">เลือกหมวดหมู่</span>
                <span className="text-xs text-muted-foreground block mt-0.5">เลือกจากที่มี หรือสร้างใหม่</span>
              </>
            )}
          </div>
        </button>
      </div>

      {/* Units */}
      {unitsLoading ? (
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-xs">หน่วยเบิก</Label>
            <Select
              value={issueUnitId}
              onValueChange={(v) => {
                onIssueUnitChange(v);
                if (!subUnitId) onSubUnitChange(v);
              }}
            >
              <SelectTrigger className="bg-card">
                <span className={issueUnitId ? "text-foreground" : "text-muted-foreground"}>
                  {issueUnitId
                    ? units.find((u) => u.id === issueUnitId)?.name ?? "เลือกหน่วย"
                    : "เลือกหน่วย"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">หน่วยย่อย</Label>
            <Select value={subUnitId} onValueChange={onSubUnitChange}>
              <SelectTrigger className="bg-card">
                <span className={subUnitId ? "text-foreground" : "text-muted-foreground"}>
                  {subUnitId
                    ? units.find((u) => u.id === subUnitId)?.name ?? "เลือกหน่วย"
                    : "เลือกหน่วย"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Conversion factor */}
      <div className="space-y-2">
        <Label htmlFor="conv-factor" className="text-xs">
          Conversion factor{" "}
          <span className="text-muted-foreground">(1 หน่วยเบิก = ? หน่วยย่อย)</span>
        </Label>
        <Input
          id="conv-factor"
          type="number"
          min={1}
          value={conversionFactor}
          onChange={(e) => onConversionFactorChange(parseInt(e.target.value) || 1)}
          className="bg-card"
        />
      </div>
    </div>
  );
}
