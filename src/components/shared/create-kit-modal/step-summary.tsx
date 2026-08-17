"use client";

import type { ComponentRow } from "./types";

interface StepSummaryProps {
  kitName: string;
  kitCode: string;
  issueUnitName: string;
  components: ComponentRow[];
}

/**
 * สรุปสูตรชุด before saving. No stock moves here — this writes the recipe, and สร้างสูตรแล้ว
 * the sets get built one at a time from the kit's own page (ประกอบชุด).
 */
export function StepSummary({ kitName, kitCode, issueUnitName, components }: StepSummaryProps) {
  const maxSets = components.length
    ? Math.min(...components.map((c) => Math.floor(c.availableQty / c.quantity)))
    : 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">ตรวจสอบสูตรชุดก่อนบันทึก — ยังไม่ตัดสต๊อก</p>

      <div className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
        <Section label="ข้อมูลชุด">
          <Row label="ชื่อชุด" value={kitName || "—"} />
          <Row label="รหัสชุด" value={kitCode || "—"} />
          <Row label="หน่วยนับ" value={issueUnitName || "—"} />
          <Row label="ประกอบได้ตอนนี้" value={`${maxSets} ชุด`} />
        </Section>

        <Section label={`ส่วนประกอบต่อ 1 ชุด (${components.length})`}>
          {components.map((c) => (
            <div key={c.componentItemId} className="flex items-start justify-between gap-4">
              <dt className="min-w-0 flex-1">
                <span className="text-foreground">{c.name}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">{c.code}</span>
              </dt>
              <dd className="text-right font-medium tabular-nums text-foreground">
                {c.quantity} {c.unitName}
                <span className="block text-xs font-normal text-muted-foreground">(คงเหลือ {c.availableQty})</span>
              </dd>
            </div>
          ))}
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
