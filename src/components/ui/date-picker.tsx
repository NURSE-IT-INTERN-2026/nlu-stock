"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { fmtDate, TH_DATE } from "@/lib/format";

// Hand-rolled month-grid picker on top of the Base UI Popover — the app carries no date
// library, and click-to-pick a day is a small grid, not a reason to add one. Value is a
// local "YYYY-MM-DD" string so the form payload is unchanged from the old <input type=date>.
// Year is shown in พ.ศ. to match every other date in the app; the stored value stays ค.ศ.

const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const TH_DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

// Local calendar parts, NOT toISOString() — an evening date in +07 would roll to the next
// UTC day. Same lesson as lot-code.autoLotNumber.
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "24 ก.ค. 2569" — same Thai display every other date in the app uses. */
export const thaiDate = (d: Date) => fmtDate(d, TH_DATE);

// 6×7 grid of the given month; leading blanks pad to the first weekday (Sun-start).
function monthCells(view: Date): (Date | null)[] {
  const y = view.getFullYear();
  const m = view.getMonth();
  const startDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
  return cells;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "เลือกวันที่",
  className,
  clearable = true,
  min,
  disabled = false,
  id,
  invalid,
  describedBy,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  clearable?: boolean;
  /** "YYYY-MM-DD" floor — days before this are unpickable. */
  min?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const selected = value ? parseISODate(value) : null;
  const minDate = min ? parseISODate(min) : null;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => selected ?? new Date());
  const today = new Date();
  const belowMin = (d: Date) => minDate !== null && d < minDate && !sameDay(d, minDate);

  const pick = (d: Date) => {
    if (belowMin(d)) return;
    onChange(toISODate(d));
    setOpen(false);
  };
  const shiftMonth = (delta: number) =>
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger
        render={
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={cn(
              "flex w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm text-gray-900 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring",
              disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
              className,
            )}
          >
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
            <span className={cn("flex-1 truncate text-left", !selected && "text-muted-foreground")}>
              {selected ? thaiDate(selected) : placeholder}
            </span>
            {clearable && selected && (
              <span
                role="button"
                aria-label="ล้างวันที่"
                onClick={(e) => { e.stopPropagation(); onChange(""); }}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </span>
            )}
          </button>
        }
      />
      <PopoverContent align="start" className="w-auto gap-0 p-3">
        {/* Month nav */}
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="เดือนก่อนหน้า"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <ChevronLeft className="size-4" />
          </button>
          <div className="text-sm font-medium">{TH_MONTHS[view.getMonth()]} {view.getFullYear() + 543}</div>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="เดือนถัดไป"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <ChevronRight className="size-4" />
          </button>
        </div>

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 gap-0.5">
          {TH_DOW.map((d) => (
            <div key={d} className="grid h-8 place-items-center text-[11px] text-muted-foreground">{d}</div>
          ))}
          {monthCells(view).map((d, i) =>
            d === null ? (
              <div key={`b${i}`} className="h-8" />
            ) : (
              <button
                key={toISODate(d)}
                type="button"
                onClick={() => pick(d)}
                disabled={belowMin(d)}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-md text-sm tabular-nums transition-colors hover:bg-muted",
                  belowMin(d) && "pointer-events-none opacity-40",
                  selected && sameDay(d, selected) && "bg-primary text-primary-foreground hover:bg-primary",
                  (!selected || !sameDay(d, selected)) && sameDay(d, today) && "ring-1 ring-inset ring-primary/40",
                )}
              >
                {d.getDate()}
              </button>
            ),
          )}
        </div>

        {/* Quick action */}
        {!belowMin(today) && (
          <div className="mt-2 flex justify-end border-t border-border pt-2">
            <button type="button" onClick={() => pick(new Date())}
              className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10">
              วันนี้
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── self-check: npx tsx src/components/ui/date-picker.tsx ──
function assert(cond: boolean, msg: string): void {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
}
function selfCheck(): void {
  // ISO round-trip uses local parts (evening date must not roll to next day).
  const evening = new Date(2026, 6, 21, 23, 30);
  assert(toISODate(evening) === "2026-07-21", `evening stays local, got ${toISODate(evening)}`);
  assert(toISODate(new Date(2026, 0, 5)) === "2026-01-05", "zero-pad month/day");
  const rt = parseISODate("2026-07-21");
  assert(rt.getFullYear() === 2026 && rt.getMonth() === 6 && rt.getDate() === 21, "parse local");
  assert(toISODate(parseISODate("2026-02-28")) === "2026-02-28", "round-trip");
  // Thai พ.ศ. display.
  assert(thaiDate(new Date(2026, 6, 24)) === "24 ก.ค. 2569", `expected พ.ศ., got ${thaiDate(new Date(2026, 6, 24))}`);
  // Grid: July 2026 starts on a Wednesday (dow 3) → 3 leading blanks, 31 days = 34 cells.
  const cells = monthCells(new Date(2026, 6, 1));
  assert(cells.slice(0, 3).every((c) => c === null) && cells[3] !== null, "3 leading blanks for Jul 2026");
  assert(cells.filter((c) => c !== null).length === 31, "31 days in July");
  // min floor: the day before min is excluded, min itself and later are allowed.
  const min = parseISODate("2026-07-15");
  const below = (d: Date) => d < min && !sameDay(d, min);
  assert(below(new Date(2026, 6, 14)), "day before min is below");
  assert(!below(min), "min itself is not below");
  assert(!below(new Date(2026, 6, 16)), "day after min is not below");
  console.log("date-picker self-check OK");
}
if (process.argv[1]?.endsWith("date-picker.tsx")) selfCheck();
