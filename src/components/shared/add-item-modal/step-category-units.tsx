"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getUnits, getCategories, getProfiles } from "@/lib/api";
import type { UnitOption, CategoryOption, ProfileOption } from "@/lib/api";
import { CategoryPicker } from "@/components/shared/filter-pickers";
import type { DispenseType } from "@/generated/prisma/enums";
import { CodeBuilder } from "./code-builder";
import type { CodeMeta } from "./code-builder";
import { NumericInput } from "@/components/shared/numeric-input";
import { LocationCascadePicker, type LocationRef } from "@/components/shared/location-cascade-picker";
import type { FormProfile } from "./types";

interface StepCategoryUnitsProps {
  /** ห้องที่ลงทะเบียนไว้ — บังคับครบ อาคาร/ชั้น/ห้อง ปุ่มถัดไปถึงจะกดได้ */
  onLocationChange: (ref: LocationRef) => void;
  code: string;
  onCodeChange: (code: string) => void;
  categoryId: string;
  /** เลือกหมวดหมู่ได้อย่างเดียว — สร้างหมวดหมู่ใหม่ทำที่หน้าตั้งค่า */
  onCategoryChange: (cat: CategoryOption) => void;
  /** ประเภทที่แบบการใช้งานในขั้น 1 อนุญาต — คอลัมน์ ประเภท โชว์เท่านี้ */
  allowedDispenseType?: DispenseType;
  issueUnitId: string;
  issueUnitName?: string;
  onIssueUnitChange: (id: string, name: string) => void;
  /** Category type code (profile.code) — used as code prefix */
  categoryType?: string;
  /** Profile flags driving builder/field visibility */
  profile?: FormProfile | null;
  onCodeMetaChange?: (meta: CodeMeta) => void;
  initialCodeMeta?: CodeMeta | null;
  /** Initial stock quantity for flat types (CON/DUR/KIT) */
  initialQty?: number;
  onInitialQtyChange?: (q: number) => void;
  /** Notified when initial-qty validity changes (true = valid) — gates Next. */
  onQtyValidChange?: (valid: boolean) => void;
  description?: string;
  onDescriptionChange?: (d: string) => void;
}

export function StepCategoryUnits({
  onLocationChange,
  code,
  onCodeChange,
  categoryId,
  onCategoryChange,
  allowedDispenseType,
  issueUnitId,
  issueUnitName: issueUnitNameProp = "",
  onIssueUnitChange,
  categoryType,
  profile,
  onCodeMetaChange,
  initialCodeMeta,
  initialQty = 1,
  onInitialQtyChange,
  onQtyValidChange,
  description,
  onDescriptionChange,
}: StepCategoryUnitsProps) {
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [qtyInvalid, setQtyInvalid] = useState(false);

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

  useEffect(() => {
    Promise.all([getCategories(), getProfiles()])
      .then(([cats, profs]) => { setCategories(cats); setProfiles(profs); })
      .catch(() => toast.error("โหลดหมวดหมู่ไม่สำเร็จ"));
  }, []);

  // ประเภทที่ขัดกับแบบการใช้งานที่เลือกไว้แล้วไม่ควรโผล่ให้เลือกซ้ำ
  const scopedProfiles = allowedDispenseType
    ? profiles.filter((p) => p.dispenseType === allowedDispenseType)
    : profiles;
  const scopedCategories = allowedDispenseType
    ? categories.filter((c) => c.profile?.dispenseType === allowedDispenseType)
    : categories;
  const selected = categories.find((c) => c.id === categoryId) ?? null;

  // When units finish loading, sync names for any IDs already set (e.g. after back-navigation)
  useEffect(() => {
    if (!units.length) return;
    if (issueUnitId) {
      const name = units.find((u) => u.id === issueUnitId)?.name ?? "";
      if (name) onIssueUnitChange(issueUnitId, name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units]);

  return (
    <div className="space-y-5">
      {/* Category — primary, drives code generation. cascade ประเภท → หมวดหมู่ย่อย ตัวเดียว
          กับแถบตัวกรองหน้าพัสดุ/รายงาน */}
      <div className="space-y-2">
        <Label required>หมวดหมู่</Label>
        <CategoryPicker
          profiles={scopedProfiles}
          categories={scopedCategories}
          value={{ profileId: selected?.profile?.id ?? "", categoryId: categoryId || null }}
          onChange={({ categoryId: picked }) => {
            const cat = categories.find((c) => c.id === picked);
            if (cat) onCategoryChange(cat);
          }}
          requireCategory
          className="h-10 w-full justify-start rounded-lg"
        />
      </div>

      {/* Code — auto-generates from category */}
      <div className="space-y-2">
        <Label htmlFor="item-code">รหัสพัสดุ</Label>
        {!categoryType ? (
          <Input id="item-code" placeholder="—" disabled className="bg-card text-muted-foreground" />
        ) : profile?.dispenseType === "ITEM" ? (
          <CodeBuilder
            prefix={categoryType}
            value={code}
            onChange={onCodeChange}
            copyCount={initialCodeMeta?.copyCount ?? 1}
            onCopyCountChange={(count) => onCodeMetaChange?.({ copyCount: count })}
            onMetaChange={onCodeMetaChange}
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
            <div className={cn("w-full rounded-lg border bg-card", qtyInvalid ? "border-destructive" : "border-border")}>
              <div className="flex items-center justify-between gap-4 px-3 py-2.5">
                <Label htmlFor="initial-qty" className="text-sm">จำนวนเริ่มต้น</Label>
                <NumericInput
                  id="initial-qty"
                  value={initialQty}
                  onCommit={(n) => onInitialQtyChange?.(n)}
                  min={1}
                  showBorderError={false}
                  onValidityChange={(v) => {
                    setQtyInvalid(!v);
                    onQtyValidChange?.(v);
                  }}
                  className="w-20 bg-background text-center text-gray-900"
                />
              </div>
            </div>
            {qtyInvalid && (
              <p className="text-xs text-destructive">กรุณาระบุจำนวนอย่างน้อย 1</p>
            )}
          </div>
        )}
      </div>

      {/* Unit */}
      {unitsLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="issue-unit-select" className="text-xs" required>หน่วยนับ</Label>
          <Select
            value={issueUnitId}
            onValueChange={(v) => {
              if (!v) return;
              const name = units.find((u) => u.id === v)?.name ?? "";
              onIssueUnitChange(v, name);
            }}
          >
            {/* SelectTrigger เป็น w-fit ตั้งต้น — ในฟอร์มนี้ทุกช่องเต็มความกว้าง */}
            <SelectTrigger id="issue-unit-select" className="w-full bg-card">
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
        </div>
      )}

      {/* ที่จัดเก็บ — บังคับ. ของเข้าคลังแล้วต้องมีที่วางเสมอ ("ไม่ระบุ" ไม่มีใครกลับมาแก้)
          ตัวที่ตอบว่า "ของอยู่ไหนจริงๆ" ยังเป็น DistributionTable ในหน้ารายละเอียด ฟิลด์นี้คือที่ตั้งต้น */}
      <div className="space-y-2">
        <Label className="text-xs" required>ที่จัดเก็บ</Label>
        <LocationCascadePicker initialLocationId={null} onChange={onLocationChange} />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="item-description" className="text-xs">คำอธิบาย</Label>
        <Textarea
          id="item-description"
          value={description ?? ""}
          onChange={(e) => onDescriptionChange?.(e.target.value)}
          rows={2}
          placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
          className="bg-card"
        />
      </div>
    </div>
  );
}
