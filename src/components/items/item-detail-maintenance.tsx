"use client";

import { useMemo } from "react";
import { Wrench, CalendarDays, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAINT_TYPE_LABELS, MAINT_RESULT_LABELS, labelFor, type MaintenanceType, type MaintenanceResult } from "@/lib/constants";

interface MaintenanceRecord {
  id: string;
  type: string;
  result: string;
  performedAt: string;
  issue: string | null;
  description: string | null;
  cost: number | null;
  performer: { name: string };
  attachmentUrls: string[];
}

interface Props {
  item: {
    id: string;
    model: string | null;
    purchaseDate: string | null;
    purchasePrice: number | null;
    vendorCompany: string | null;
    vendorContact: string | null;
    vendorPhone: string | null;
    warrantyMonths: number;
    maintenanceCycleMonths: number;
    lastMaintenanceDate: string | null;
    nextMaintenanceDate: string | null;
  };
  maintenanceRecords: MaintenanceRecord[];
  canAct: boolean;
  onRecordMaintenance: () => void;
}

function getMaintenanceStatus(nextDate: string | null): { label: string; variant: "default" | "secondary" | "destructive" } {
  if (!nextDate) return { label: "ไม่มีข้อมูล", variant: "secondary" };
  const now = new Date();
  const next = new Date(nextDate);
  const diffDays = (next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return { label: "เลยรอบ", variant: "destructive" };
  if (diffDays <= 30) return { label: "ใกล้ถึงรอบ", variant: "secondary" };
  return { label: "ปกติ", variant: "default" };
}

export function ItemDetailMaintenance({ item, maintenanceRecords, canAct, onRecordMaintenance }: Props) {
  const maintStatus = useMemo(
    () => getMaintenanceStatus(item.nextMaintenanceDate),
    [item.nextMaintenanceDate],
  );

  const statusTone: "success" | "warning" | "destructive" =
    maintStatus.variant === "destructive" ? "destructive" : maintStatus.variant === "secondary" ? "warning" : "success";

  const assetFields = [
    item.model && { label: "รุ่น", value: item.model },
    item.purchaseDate && { label: "วันที่ซื้อ", value: new Date(item.purchaseDate).toLocaleDateString("th-TH") },
    item.purchasePrice != null && { label: "ราคา", value: `฿${item.purchasePrice.toLocaleString()}` },
    item.vendorCompany && { label: "บริษัท", value: item.vendorCompany },
    item.vendorContact && { label: "ตัวแทน", value: item.vendorContact },
    item.vendorPhone && { label: "เบอร์โทร", value: item.vendorPhone },
    item.warrantyMonths > 0 && { label: "รับประกัน", value: `${item.warrantyMonths} เดือน` },
    { label: "รอบบำรุงรักษา", value: `${item.maintenanceCycleMonths} เดือน` },
    item.lastMaintenanceDate && { label: "ครั้งล่าสุด", value: new Date(item.lastMaintenanceDate).toLocaleDateString("th-TH") },
    item.nextMaintenanceDate && { label: "ครั้งถัดไป", value: new Date(item.nextMaintenanceDate).toLocaleDateString("th-TH") },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <SectionHeader
        eyebrow="การซ่อมบำรุง"
        title="แผน & ประวัติซ่อมบำรุง"
        right={canAct ? (
          <button
            onClick={onRecordMaintenance}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition font-medium whitespace-nowrap"
          >
            <Wrench className="size-3.5" /> บันทึกการซ่อม
          </button>
        ) : undefined}
      />

      {/* ── Stat cards ── */}
      <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 border-b border-border">
        <StatCard
          label="รอบถัดไป"
          value={item.nextMaintenanceDate ? new Date(item.nextMaintenanceDate).toLocaleDateString("th-TH") : "—"}
          icon={CalendarDays}
        />
        <StatCard label="จำนวนการซ่อมบำรุง" value={`${maintenanceRecords.length} ครั้ง`} icon={Wrench} />
        <StatCard label="สถานะ" value={maintStatus.label} icon={ShieldAlert} tone={statusTone} />
      </div>

      {/* ── Fixed asset info ── */}
      <div className="p-4 sm:p-5 border-b border-border">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">ข้อมูลครุภัณฑ์</div>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          {assetFields.map((f) => (
            <div key={f.label}>
              <dt className="text-muted-foreground text-xs">{f.label}</dt>
              <dd className="font-medium mt-0.5">{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ── Maintenance history ── */}
      <div className="p-4 sm:p-5">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">ประวัติการซ่อมบำรุง</div>
        {maintenanceRecords.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted-foreground">ยังไม่มีประวัติการซ่อมบำรุง</p>
        ) : (
          <ul className="space-y-3">
            {maintenanceRecords.map((rec) => (
              <li
                key={rec.id}
                className="grid grid-cols-[auto_1fr] gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-border bg-muted/20"
              >
                <div className="size-10 shrink-0 rounded-lg bg-primary/5 border border-primary/10 grid place-items-center text-primary">
                  <Wrench className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <CalendarDays className="size-3" />
                      {new Date(rec.performedAt).toLocaleDateString("th-TH")}
                    </span>
                    <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full border bg-muted text-foreground border-border">
                      {labelFor(MAINT_TYPE_LABELS, rec.type as MaintenanceType)}
                    </span>
                    <span className={cn(
                      "text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full border",
                      rec.result === "AVAILABLE"
                        ? "bg-success/10 text-success-700 border-success/20"
                        : "bg-primary/10 text-primary border-primary/20",
                    )}>
                      {labelFor(MAINT_RESULT_LABELS, rec.result as MaintenanceResult)}
                    </span>
                  </div>
                  {rec.issue && <div className="text-sm font-medium mt-1">{rec.issue}</div>}
                  {rec.description && <div className="text-sm text-muted-foreground mt-0.5">{rec.description}</div>}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    โดย {rec.performer.name}{rec.cost != null ? ` · ฿${rec.cost.toLocaleString()}` : ""}
                  </div>
                  {rec.attachmentUrls.length > 0 && (
                    <div className="flex gap-2 mt-1.5">
                      {rec.attachmentUrls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                          {url.endsWith(".pdf") ? `PDF ${i + 1}` : `รูป ${i + 1}`}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function SectionHeader({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="px-4 sm:px-5 py-4 border-b border-border grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{eyebrow}</div>}
        <h2 className="text-lg font-semibold leading-tight mt-0.5 truncate">{title}</h2>
      </div>
      {right}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone = "primary" }: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "primary" | "success" | "warning" | "destructive";
}) {
  const toneClass = {
    primary: "bg-primary/5 text-primary border-primary/10",
    success: "bg-success/10 text-success-700 border-success/20",
    warning: "bg-warning/10 text-warning-700 border-warning/20",
    destructive: "bg-destructive/10 text-destructive border-destructive/20",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 grid grid-cols-[auto_1fr] items-center gap-3">
      <div className={cn("size-10 shrink-0 rounded-lg grid place-items-center border", toneClass)}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold leading-tight truncate">{value}</div>
      </div>
    </div>
  );
}
