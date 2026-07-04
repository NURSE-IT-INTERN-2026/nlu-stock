"use client";

import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ComponentRow } from "./types";

interface StepAssembleProps {
  kitName: string;
  kitCode: string;
  issueUnitName: string;
  components: ComponentRow[];
  assembleQty: number;
  onAssembleQtyChange: (q: number) => void;
}

export function StepAssemble({
  kitName,
  kitCode,
  issueUnitName,
  components,
  assembleQty,
  onAssembleQtyChange,
}: StepAssembleProps) {
  const hasShortage = components.some((c) => c.quantity * assembleQty > c.availableQty);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">ระบุจำนวนชุดที่จะประกอบ แล้วตรวจสอบสรุปก่อนยืนยัน</p>

      {/* จำนวนที่ประกอบ */}
      <div className="rounded-xl border border-primary/20 bg-primary/[0.02] px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="assemble-qty" className="text-sm font-medium">จำนวนชุดที่จะประกอบ</Label>
          <Input
            id="assemble-qty"
            type="number"
            min={1}
            value={assembleQty}
            onChange={(e) => onAssembleQtyChange(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-24 bg-background text-center text-base font-semibold tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">ชุด</p>
      </div>

      {hasShortage && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>ส่วนประกอบบางรายการมีจำนวนไม่พอ การประกอบจะไม่สำเร็จ — ลดจำนวนชุดหรือเพิ่มสต๊อกก่อน</span>
        </div>
      )}

      <div className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
        {/* ข้อมูลชุด */}
        <Section label="ข้อมูลชุด">
          <Row label="ชื่อชุด" value={kitName || "—"} />
          <Row label="รหัสชุด" value={kitCode || "—"} />
          <Row label="หน่วยนับ" value={issueUnitName || "—"} />
          <Row label="จะได้รับ" value={`${assembleQty} ${issueUnitName || "ชุด"}`} />
        </Section>

        {/* ส่วนประกอบที่ใช้ */}
        <Section label={`ส่วนประกอบที่จะใช้ (${components.length})`}>
          {components.map((c) => {
            const total = c.quantity * assembleQty;
            const short = total > c.availableQty;
            return (
              <div key={c.componentItemId} className="flex items-start justify-between gap-4">
                <dt className="min-w-0 flex-1">
                  <span className="text-foreground">{c.name}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{c.code}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.quantity} {c.unitName}/ชุด × {assembleQty} ชุด
                  </span>
                </dt>
                <dd className={cn(
                  "text-right font-medium tabular-nums",
                  short ? "text-destructive" : "text-foreground",
                )}>
                  −{total} {c.unitName}
                  <span className="block text-xs font-normal text-muted-foreground">(คงเหลือ {c.availableQty})</span>
                </dd>
              </div>
            );
          })}
        </Section>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <div className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-foreground">{label}</div>
      <dl className="space-y-1.5">{children}</dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
