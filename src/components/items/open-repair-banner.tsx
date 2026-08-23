"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, MapPin, Send, Wrench } from "lucide-react";
import { fmtDate, TH_DATE } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getOpenRepairs, type OpenRepairCase } from "@/lib/api";

// "ของชิ้นนี้กำลังมีเรื่องอะไรอยู่" — answered above the timeline, not inside it. The history
// below is append-only and mixes ยืม/คืน/ชำรุด/ซ่อม into one column on purpose; reconstructing
// "ยังอยู่ที่ร้าน ตั้งแต่วันที่ 20" out of three of those rows is the work this card removes.
//
// Renders nothing when there is no open job — the quiet case is the common one, and an empty
// "ไม่มีงานซ่อม" panel on every item page is noise charged to every reader.
const STAGE = {
  DAMAGED: {
    label: "รอส่งซ่อม",
    icon: Send,
    // -700 steps are light-card values; every one carries its dark step (11px text, no AA discount).
    chip: "bg-warning/15 text-warning-700 dark:text-warning-200",
    frame: "border-warning/30 bg-warning/5",
  },
  UNDER_REPAIR: {
    label: "กำลังซ่อม",
    icon: Wrench,
    chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    frame: "border-sky-500/30 bg-sky-500/5",
  },
} as const;

const VENUE = { INTERNAL: "ซ่อมภายใน", EXTERNAL: "ส่งซ่อมภายนอก" } as const;

export function OpenRepairBanner({ itemId, subItemId, unit, refreshKey }: {
  itemId: string;
  /** Piece view — scope the card to that one copy. */
  subItemId?: string;
  unit?: string;
  /** Bumped by the page whenever it refetches, so a just-filed แจ้งชำรุด shows up here too. */
  refreshKey?: number;
}) {
  const [cases, setCases] = useState<OpenRepairCase[]>([]);

  useEffect(() => {
    let alive = true;
    getOpenRepairs(itemId, subItemId)
      .then((d) => alive && setCases(d.cases))
      .catch(() => alive && setCases([]));
    return () => {
      alive = false;
    };
  }, [itemId, subItemId, refreshKey]);

  if (cases.length === 0) return null;

  return (
    <section className="mb-6 space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          การซ่อมที่กำลังดำเนินการ
          <span className="ml-2 tabular-nums text-foreground">{cases.length}</span>
        </h2>
        <Link
          href="/repairs"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          ดูทั้งหมด <ArrowRight className="size-3" />
        </Link>
      </div>
      {cases.map((c) => {
        const meta = STAGE[c.stage];
        const Icon = meta.icon;
        // A piece is one thing and says its รหัสย่อย; qty stock says how many units are out.
        const subject = c.kind === "PIECE" ? c.subCode : `${c.qty}${unit ? ` ${unit}` : ""}`;
        const at = c.repairSentAt ?? c.reportedAt;
        return (
          <div key={`${c.kind}${c.id}`} className={cn("rounded-xl border px-4 py-3", meta.frame)}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium", meta.chip)}>
                <Icon className="size-3" />
                {meta.label}
              </span>
              {subject && <span className="font-mono text-muted-foreground">{subject}</span>}
              {c.repairVenue && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <MapPin className="size-3" />
                  {VENUE[c.repairVenue]}
                </span>
              )}
            </div>
            {c.damageNote && <p className="mt-1.5 text-sm font-medium leading-snug">{c.damageNote}</p>}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {at && (
                <span className="tabular-nums">
                  {c.repairSentAt ? "ส่งซ่อม" : "แจ้งชำรุด"} {fmtDate(at, TH_DATE)}
                </span>
              )}
              {c.repairNote && <span className="text-foreground">{c.repairNote}</span>}
              {c.by && <span>โดย {c.by}</span>}
            </div>
          </div>
        );
      })}
    </section>
  );
}
