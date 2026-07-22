"use client";

import { USAGE_OPTIONS } from "./types";
import type { CodeMeta } from "./code-builder";

interface StepSummaryProps {
  name: string;
  usageType: string | null;
  code: string;
  categoryName: string;
  categoryType?: string;
  issueUnitName: string;
  codeMeta?: CodeMeta | null;
  initialQty?: number;
  description?: string;
}

export function StepSummary({
  name,
  usageType,
  code,
  categoryName,
  categoryType,
  issueUnitName,
  codeMeta,
  initialQty = 0,
  description,
}: StepSummaryProps) {
  const usageLabel = USAGE_OPTIONS.find((o) => o.id === usageType)?.title ?? "—";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">ตรวจสอบข้อมูลก่อนสร้างพัสดุ</p>

      <div className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
        {/* Section: ข้อมูลพื้นฐาน */}
        <Section label="ข้อมูลพื้นฐาน">
          <Row label="ชื่อพัสดุ" value={name || "—"} />
          <Row label="รหัสพัสดุ" value={code || "—"} />
          <Row label="รูปแบบใช้งาน" value={usageLabel} />
          {description && <Row label="คำอธิบาย" value={description} />}
        </Section>

        {/* Section: หมวดหมู่ */}
        <Section label="หมวดหมู่">
          <Row label="ชื่อหมวดหมู่" value={categoryName || "—"} />
        </Section>

        {/* Section: หน่วย */}
        <Section label="หน่วย">
          <Row label="หน่วยนับ" value={issueUnitName || "—"} />
          {codeMeta?.isSet && codeMeta.setSize > 1 && <Row label="จำนวนต่อชุด" value={`${codeMeta.setSize}`} />}
          {codeMeta && codeMeta.copyCount > 1 && (
            <Row label="จำนวนชิ้น" value={`${codeMeta.copyCount} ${issueUnitName || "รายการ"}`} />
          )}
          {initialQty > 0 && (
            <Row label="จำนวนเริ่มต้น" value={`${initialQty} ${issueUnitName || "รายการ"}`} />
          )}
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
