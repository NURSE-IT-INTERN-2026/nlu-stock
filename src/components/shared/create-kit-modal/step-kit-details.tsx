"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getUnits } from "@/lib/api";
import type { UnitOption } from "@/lib/api";
import type { KitFormState } from "./types";

interface StepKitDetailsProps {
  form: KitFormState;
  onUpdate: (patch: Partial<KitFormState>) => void;
}

export function StepKitDetails({ form, onUpdate }: StepKitDetailsProps) {
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);

  const fetchUnits = useCallback(async () => {
    if (units.length > 0) return;
    setUnitsLoading(true);
    try {
      const data = await getUnits();
      setUnits(data);
      // default unit = "ชุด" ถ้ามี
      const setUnit = data.find((u) => u.name === "ชุด");
      if (setUnit) onUpdate({ issueUnitId: setUnit.id, issueUnitName: setUnit.name });
    } catch {
      /* silent */
    }
    setUnitsLoading(false);
  }, [units.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // preview code: NLU-KIT-NNN (server generate จริง ณ submit)
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/items/suggest-code?prefix=KIT`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!cancelled && d?.suggestedCode) onUpdate({ code: d.suggestedCode as string });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

  return (
    <div className="space-y-5">
      {/* ชื่อชุด */}
      <div className="space-y-2">
        <Label htmlFor="kit-name">ชื่อชุด <span className="text-destructive">*</span></Label>
        <Input
          id="kit-name"
          placeholder="เช่น ชุดประกอบวิชาเคมี ม.4"
          value={form.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="bg-card"
          autoFocus
        />
      </div>

      {/* รหัส (auto, KIT เสมอ) */}
      <div className="space-y-2">
        <Label htmlFor="kit-code">รหัสชุด</Label>
        {form.code ? (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <span className="text-xs text-muted-foreground">รหัสที่จะได้ (สร้างอัตโนมัติ):</span>
            <p className="text-sm font-mono font-semibold text-foreground">{form.code}</p>
          </div>
        ) : (
          <div className="h-9 rounded-md border bg-muted animate-pulse" />
        )}
        <p className="text-xs text-muted-foreground">ชุดประกอบวิชาใช้รหัส NLU-KIT-NNN เสมอ</p>
      </div>

      {/* หน่วย */}
      {unitsLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="kit-unit-select" className="text-xs">หน่วยนับ (ของชุด) <span className="text-destructive">*</span></Label>
          <Select
            value={form.issueUnitId}
            onValueChange={(v) => {
              if (!v) return;
              const name = units.find((u) => u.id === v)?.name ?? "";
              onUpdate({ issueUnitId: v, issueUnitName: name });
            }}
          >
            <SelectTrigger id="kit-unit-select" className="bg-card">
              <span className={form.issueUnitId ? "text-foreground" : "text-muted-foreground"}>
                {form.issueUnitId
                  ? ((units.find((u) => u.id === form.issueUnitId)?.name ?? form.issueUnitName) || "เลือก")
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
    </div>
  );
}
