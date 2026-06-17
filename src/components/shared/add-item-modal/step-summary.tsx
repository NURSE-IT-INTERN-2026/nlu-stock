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
  subUnitName: string;
  conversionFactor: number;
  codeMeta?: CodeMeta | null;
  initialQty?: number;
}

export function StepSummary({
  name,
  usageType,
  code,
  categoryName,
  categoryType,
  issueUnitName,
  subUnitName,
  conversionFactor,
  codeMeta,
  initialQty = 0,
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
        </Section>

        {/* Section: หมวดหมู่ */}
        <Section label="หมวดหมู่">
          <Row label="ชื่อหมวดหมู่" value={categoryName || "—"} />
        </Section>

        {/* Section: หน่วย */}
        <Section label="หน่วย">
          <Row label="อัตราแปลง (หน่วยเบิก = จำนวน หน่วยย่อย)" value={issueUnitName ? `1 ${issueUnitName} = ${conversionFactor} ${subUnitName || issueUnitName}` : "—"} />
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
