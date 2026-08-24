"use client";

import {
  DIALOG_SHELL, DIALOG_BODY,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { tokenTint, tokenVar, type Token } from "./report-kit";
import type { UsageMonthGroup } from "@/lib/usage-groups";

/**
 * รายละเอียดของหนึ่งแท่งในกราฟ — กราฟตอบว่าอันไหนเยอะ กล่องนี้ตอบว่าอันนั้น "อะไรบ้าง".
 *
 * ใช้ทั้งกับเดือน (กลุ่มการใช้งาน → วิชา/กิจกรรม/ห้อง → พัสดุ) และกับหนึ่งวิชา (เดือน → พัสดุ)
 * เพราะสองอย่างนี้เป็นต้นไม้รูปเดียวกัน ต่างแค่ว่าอะไรเป็นแกน — เขียนสองกล่องคนละชุดแล้วมันจะ
 * เพี้ยนกันเอง. ชั้นในสุดใช้ <details> ของเบราว์เซอร์ ไม่ใช่ state — เปิดพร้อมกันกี่แถวก็ได้
 * และปุ่มกับคีย์บอร์ดมาให้ฟรี.
 */
function GroupBlock({ group, token }: { group: UsageMonthGroup; token: Token }) {
  return (
    <section className="space-y-1.5">
      <div
        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg px-3 py-2"
        style={{ backgroundColor: tokenTint(token, 12) }}
      >
        <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
        {/* สองตัวเลขพอ — เดิมมี rows.length ต่อท้ายว่า "N รายการ" ซึ่งอ่านชนกับ "N ครั้ง" ข้างหน้า */}
        <p className="text-xs text-muted-foreground tabular-nums">
          {group.totalQuantity.toLocaleString()} หน่วย · {group.records.toLocaleString()} ครั้ง
        </p>
      </div>

      <div className="divide-y divide-border rounded-lg border">
        {group.rows.map((row) => (
          <details key={row.key} className="group/row px-3 py-2">
            <summary className="flex cursor-pointer list-none items-start gap-2 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open/row:rotate-90" />
              <div className="min-w-0 flex-1">
                <p className="text-sm break-words">{row.label}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {row.totalQuantity.toLocaleString()} หน่วย · {row.records.toLocaleString()} ครั้ง ·{" "}
                  ใช้พัสดุ {row.items.length.toLocaleString()} ชนิด
                </p>
              </div>
            </summary>

            <ul className="mt-1.5 ml-6 space-y-1 border-l border-border pl-3">
              {row.items.map((it) => (
                <li key={it.code} className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                  <span className="min-w-0 break-words">
                    <span className="font-mono text-muted-foreground">{it.code}</span> {it.name}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    <span className="font-semibold text-foreground">{it.quantity.toLocaleString()}</span>{" "}
                    {it.unit} · {it.records.toLocaleString()} ครั้ง
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}

export interface UsageDetail {
  title: string;
  subtitle: string;
  groups: UsageMonthGroup[];
  empty: string;
}

export function UsageDetailDialog({
  detail,
  token,
  onClose,
}: {
  detail: UsageDetail | null;
  token: Token;
  onClose: () => void;
}) {
  if (!detail) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[680px]">
        <div className={DIALOG_SHELL}>
          <DialogHeader
            className="shrink-0 border-b border-border px-5 py-4 pr-14"
            style={{ borderBottomColor: `color-mix(in oklab, ${tokenVar[token]} 30%, transparent)` }}
          >
            <DialogTitle className="text-base font-semibold">{detail.title}</DialogTitle>
            <DialogDescription className="text-xs">{detail.subtitle}</DialogDescription>
          </DialogHeader>

          <div className={cn(DIALOG_BODY, "space-y-4 bg-secondary/40 px-5 py-5")}>
            {detail.groups.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{detail.empty}</p>
            ) : (
              detail.groups.map((g) => <GroupBlock key={g.group} group={g} token={token} />)
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
