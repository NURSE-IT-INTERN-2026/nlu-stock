"use client";

import * as React from "react";
import {
  Search, QrCode, Layers, MapPin, Activity, Bell, X, Check, SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { STATUS_COLORS, STATUS_LABELS, type ItemStatus } from "@/lib/constants";
import { statusOptionsFor } from "@/lib/status-utils";
import type { CategoryOption, LocationOption, ProfileOption } from "@/lib/api";
import {
  CategoryPicker, LocationPicker, FilterButton, formatLocation, type LocationFilter,
} from "@/components/shared/filter-pickers";

export type PresetKey = "lowStock" | "nearExpiry" | "overdueMaint" | "onLoan";

export interface FilterState {
  query: string;
  profileId: string;
  categoryId: string | null;
  status: ItemStatus[];
  location: LocationFilter;
  preset: PresetKey | null;
}

export const EMPTY_FILTER: FilterState = {
  query: "", profileId: "", categoryId: null, status: [], location: {}, preset: null,
};

export interface ItemsFilterBarProps {
  profiles: ProfileOption[];
  categories: CategoryOption[];
  locations: LocationOption[];
  value: FilterState;
  onChange: (next: FilterState) => void;
  resultCount?: number;
  onScanQR: () => void;
  className?: string;
  hideScan?: boolean;
  // When provided, renders a "ยืมอยู่" toggle (onLoan lives on /items, not /alerts).
  onLoanCount?: number;
  // Optional trailing action rendered next to the scan button (e.g. "ประกอบชุด").
  trailingAction?: React.ReactNode;
  // Registry view (/settings): offer every status, including written-off, and don't
  // narrow by profile — an admin auditing the register must be able to ask "was there
  // ever one of these?". /items stays the operational view.
  allStatuses?: boolean;
}

const ALL_STATUS_KEYS = Object.keys(STATUS_LABELS) as ItemStatus[];

// Presets arrive by link only (?lowStock=true …) — there is no picker for them here, so all
// this needs to carry is the wording of the chip that says one is on.
const PRESET_LABELS: Record<PresetKey, string> = {
  lowStock: "ต่ำกว่าขั้นต่ำ",
  nearExpiry: "ใกล้หมดอายุ",
  overdueMaint: "บำรุงเกินกำหนด",
  onLoan: "ยืมอยู่",
};

export function ItemsFilterBar({
  profiles, categories, locations, value, onChange, resultCount, onScanQR, className, hideScan, onLoanCount, trailingAction, allStatuses,
}: ItemsFilterBarProps) {
  const scopedCategories = value.profileId
    ? categories.filter((c) => c.profile?.id === value.profileId)
    : categories;
  const locLabel = formatLocation(value.location);
  // Which statuses make sense depends on the selected profile (CONSUMABLE has no lifecycle).
  const statusOptions = allStatuses
    ? ALL_STATUS_KEYS
    : statusOptionsFor(profiles.find((p) => p.id === value.profileId)?.dispenseType);

  const activeFiltersCount =
    (value.profileId ? 1 : 0) +
    (locLabel ? 1 : 0) +
    value.status.length +
    (value.preset ? 1 : 0);

  const update = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });

  return (
    <div className={cn("rounded-2xl border border-border/60 bg-card p-2.5 sm:p-4 space-y-2 sm:space-y-3", className)}>
      {/* Row 1: search + scan — search fills the row, scan is icon-only on mobile to save vertical space */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={value.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="ค้นหารหัส / ชื่อพัสดุ…"
            className="h-11 sm:h-12 pl-9 sm:pl-10 pr-9 text-base rounded-xl"
          />
          {value.query && (
            <button
              type="button"
              onClick={() => update({ query: "" })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
              aria-label="ล้างคำค้น"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        {!hideScan && (
          <Button type="button" onClick={onScanQR} aria-label="สแกน QR" className="h-11 sm:h-12 w-11 sm:w-auto px-0 sm:px-4 rounded-xl gap-2 shrink-0 justify-center">
            <QrCode className="size-5" />
            <span className="font-medium hidden sm:inline">สแกน QR</span>
          </Button>
        )}
        {trailingAction && (
          <div className="w-full sm:w-auto shrink-0">{trailingAction}</div>
        )}
      </div>

      {/* Filter pickers row */}
      <div className="flex flex-wrap items-center gap-2">
        <CategoryPicker
          profiles={profiles}
          categories={categories}
          value={{ profileId: value.profileId, categoryId: value.categoryId }}
          onChange={({ profileId, categoryId }) => {
            // Drop status picks the new profile can never match (e.g. ชำรุด on a consumable).
            // The registry view offers everything, so nothing to prune there.
            if (allStatuses) return update({ profileId, categoryId });
            const allowed = statusOptionsFor(profiles.find((p) => p.id === profileId)?.dispenseType);
            update({ profileId, categoryId, status: value.status.filter((s) => allowed.includes(s)) });
          }}
        />
        <LocationPicker value={value.location} locations={locations} onChange={(loc) => update({ location: loc })} />
        <StatusPicker
          options={statusOptions}
          value={value.status}
          onChange={(s) => update({ status: s })}
          onLoanActive={typeof onLoanCount === "number" ? value.preset === "onLoan" : undefined}
          onLoanCount={onLoanCount ?? undefined}
          onLoanToggle={typeof onLoanCount === "number" ? () => update({ preset: value.preset === "onLoan" ? null : "onLoan" }) : undefined}
        />
        <div className="basis-full sm:basis-auto flex items-center gap-3 text-sm text-muted-foreground sm:ml-auto">
          {typeof resultCount === "number" && (
            <span className="tabular-nums">
              พบ <span className="font-semibold text-foreground">{resultCount.toLocaleString()}</span> รายการ
            </span>
          )}
          {(activeFiltersCount > 0 || value.query) && (
            <Button variant="ghost" size="sm" onClick={() => onChange({ ...EMPTY_FILTER })} className="h-8 text-primary hover:text-primary hover:bg-primary/10">
              <X className="size-3.5" />
              ล้างทั้งหมด
            </Button>
          )}
        </div>
      </div>

      {/* Row 4: active chips */}
      {(value.profileId || value.categoryId || locLabel || value.status.length > 0 || value.preset) && (
        <>
          <Separator className="bg-border/60" />
          <div className="flex flex-wrap items-center gap-1.5">
            <SlidersHorizontal className="size-3.5 text-muted-foreground mr-1" />
            {value.profileId && (
              <ActiveChip
                icon={<Layers className="size-3" />}
                label={
                  (profiles.find((p) => p.id === value.profileId)?.name ?? "") +
                  (value.categoryId ? ` / ${scopedCategories.find((c) => c.id === value.categoryId)?.name ?? ""}` : "")
                }
                onRemove={() => update({ profileId: "", categoryId: null })}
              />
            )}
            {locLabel && (
              <ActiveChip icon={<MapPin className="size-3" />} label={locLabel} onRemove={() => update({ location: {} })} />
            )}
            {value.status.map((s) => (
              <ActiveChip key={s} label={STATUS_LABELS[s] ?? s} onRemove={() => update({ status: value.status.filter((x) => x !== s) })} />
            ))}
            {value.preset && (
              <ActiveChip tone="alert" icon={<Bell className="size-3" />} label={PRESET_LABELS[value.preset]} onRemove={() => update({ preset: null })} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Active chip ───
function ActiveChip({ label, onRemove, icon, tone = "default" }: { label: string; onRemove: () => void; icon?: React.ReactNode; tone?: "default" | "alert" }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-full text-xs font-medium border",
      tone === "alert" ? "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30" : "bg-primary/10 text-foreground border-primary/20",
    )}>
      {icon}
      {label}
      <button type="button" onClick={onRemove} className="ml-0.5 rounded-full p-0.5 hover:bg-black/10" aria-label={`ลบ ${label}`}>
        <X className="size-3" />
      </button>
    </span>
  );
}

// ─── Status (multi) + on-loan toggle ───
function StatusPicker({ options, value, onChange, onLoanActive, onLoanCount, onLoanToggle }: {
  options: ItemStatus[];
  value: ItemStatus[];
  onChange: (v: ItemStatus[]) => void;
  onLoanActive?: boolean;
  onLoanCount?: number;
  onLoanToggle?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const toggle = (k: ItemStatus) => onChange(value.includes(k) ? value.filter((s) => s !== k) : [...value, k]);
  const totalCount = value.length + (onLoanActive ? 1 : 0);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props: React.ComponentProps<"button">) => (
          <FilterButton {...props} active={totalCount > 0} icon={Activity} count={totalCount || undefined}>สถานะ</FilterButton>
        )}
      />
      <PopoverContent align="start" className="w-64 p-2">
        {onLoanToggle && (
          <>
            <div className="flex items-center gap-2 px-1 py-1.5 mb-1.5">
              <span className="flex-1 text-sm font-medium">ยืมอยู่</span>
              {onLoanCount! > 0 && (
                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold tabular-nums">{onLoanCount}</span>
              )}
              <Switch checked={!!onLoanActive} onCheckedChange={onLoanToggle} aria-label="ยืมอยู่" />
            </div>
            <div className="h-px bg-border mb-1.5" />
          </>
        )}
        <div className="text-xs font-medium text-muted-foreground px-1 pb-1">เลือกได้หลายรายการ</div>
        <div className="space-y-0.5">
          {options.map((k) => {
            const active = value.includes(k);
            return (
              <button key={k} onClick={() => toggle(k)} className={cn(
                "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm text-left transition-colors",
                active ? "bg-primary/10 text-foreground font-medium" : "hover:bg-muted text-foreground/85",
              )}>
                <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[k] }} />
                <span className="flex-1 min-w-0 truncate">{STATUS_LABELS[k]}</span>
                {active && <Check className="size-4 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
        {value.length > 0 && (
          <button className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground py-1 rounded-md hover:bg-muted" onClick={() => onChange([])}>ล้างสถานะ</button>
        )}
      </PopoverContent>
    </Popover>
  );
}

