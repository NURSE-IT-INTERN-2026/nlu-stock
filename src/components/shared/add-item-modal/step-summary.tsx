"use client";

import { Badge } from "@/components/ui/badge";
import { USAGE_OPTIONS } from "./types";

interface StepSummaryProps {
  name: string;
  usageType: string | null;
  code: string;
  categoryName: string;
  issueUnitName: string;
  subUnitName: string;
  conversionFactor: number;
}

export function StepSummary({
  name,
  usageType,
  code,
  categoryName,
  issueUnitName,
  subUnitName,
  conversionFactor,
}: StepSummaryProps) {
  const usageLabel = USAGE_OPTIONS.find((o) => o.id === usageType)?.title ?? "—";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">ตรวจสอบข้อมูลก่อนสร้างพัสดุ</p>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">สรุป</div>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="ชื่อพัสดุ" value={name || "—"} />
          <Row label="รหัส" value={code || "—"} />
          <Row label="รูปแบบใช้งาน" value={usageLabel} />
          <Row label="หมวดหมู่" value={categoryName || "—"} />
          <Row
            label="หน่วย"
            value={
              issueUnitName
                ? conversionFactor > 1
                  ? `1 ${issueUnitName} = ${conversionFactor} ${subUnitName || issueUnitName}`
                  : issueUnitName
                : "—"
            }
          />
        </dl>
      </div>
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
