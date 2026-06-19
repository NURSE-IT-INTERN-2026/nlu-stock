"use client";

import * as React from "react";
import {
  Search, QrCode, Layers, MapPin, Activity, Bell, X, ChevronRight, Check,
  Boxes, Package, Beaker, Hammer, Building2, Monitor, BookOpen, Puzzle,
  SlidersHorizontal, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { STATUS_LABELS, STATUS_PILLS } from "@/lib/constants";
import type { CategoryOption, LocationOption, ProfileOption } from "@/lib/api";

// Map profile.icon string → lucide component. Unknown → Boxes fallback.
const PROFILE_ICONS: Record<string, LucideIcon> = {
  Package, Beaker, Hammer, Building2, Monitor, BookOpen, Puzzle, Boxes,
};

export type PresetKey = "lowStock" | "nearExpiry" | "overdueMaint" | "onLoan";

export interface LocationFilter {
  building?: string;
  floor?: string;
  room?: string;
  detail?: string | null;
}

export interface FilterState {
  query: string;
  profileId: string;
  categoryId: string | null;
  status: string[];
  location: LocationFilter;
  preset: PresetKey | null;
}

export const EMPTY_FILTER: FilterState = {
  query: "", profileId: "", categoryId: null, status: [], location: {}, preset: null,
};

// locationLabel (constants) requires all fields; ours are optional, so format locally.
function formatLocation(loc: LocationFilter): string | null {
  const parts = [loc.building, loc.floor, loc.room, loc.detail].filter(Boolean);
  return parts.length ? parts.join(" / ") : null;
}

export interface ItemsFilterBarProps {
  profiles: ProfileOption[];
  categories: CategoryOption[];
  locations: LocationOption[];
  alerts: { lowStock: number; nearExpiry: number; overdueMaintenance: number };
  value: FilterState;
  onChange: (next: FilterState) => void;
  resultCount?: number;
  onScanQR: () => void;
  className?: string;
}

const STATUS_KEYS = Object.keys(STATUS_LABELS);

const PRESETS: { key: PresetKey; label: string; countKey: "lowStock" | "nearExpiry" | "overdueMaintenance"; activeCls: string; badgeCls: string }[] = [
  { key: "lowStock", label: "สต๊อกต่ำ", countKey: "lowStock", activeCls: "bg-orange-500 text-white", badgeCls: "bg-white/25" },
  { key: "nearExpiry", label: "ใกล้หมดอายุ", countKey: "nearExpiry", activeCls: "bg-warning text-warning-foreground", badgeCls: "bg-black/10" },
  { key: "overdueMaint", label: "บำรุงเกินกำหนด", countKey: "overdueMaintenance", activeCls: "bg-destructive text-destructive-foreground", badgeCls: "bg-white/25" },
];

export function ItemsFilterBar({
  profiles, categories, locations, alerts, value, onChange, resultCount, onScanQR, className,
}: ItemsFilterBarProps) {
  const scopedCategories = value.profileId
    ? categories.filter((c) => c.profile?.id === value.profileId)
    : categories;
  const locLabel = formatLocation(value.location);

  const activeFiltersCount =
    (value.categoryId ? 1 : 0) +
    (locLabel ? 1 : 0) +
    value.status.length +
    (value.preset ? 1 : 0);

  const update = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });

  return (
    <div className={cn("rounded-2xl border border-border/60 bg-card p-3 sm:p-4 space-y-3", className)}>
      {/* Row 1: search + scan — stack on narrow screens so the search bar keeps full width */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-0 basis-full sm:basis-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={value.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="ค้นหารหัส, ชื่อพัสดุ, หรือสแกน QR…"
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
        <Button type="button" onClick={onScanQR} className="h-11 sm:h-12 px-3 sm:px-4 rounded-xl gap-2 shrink-0 w-full sm:w-auto justify-center">
          <QrCode className="size-5" />
          <span className="font-medium">สแกน QR</span>
        </Button>
      </div>

      {/* Row 2: profile tabs — 2-col grid, all visible (no scroll) */}
      <div className="grid grid-cols-2 gap-2">
          <ProfileTab
            active={!value.profileId}
            onClick={() => update({ profileId: "", categoryId: null })}
            icon={Boxes}
            label="ทุกประเภท"
          />
          {profiles.map((p) => (
            <ProfileTab
              key={p.id}
              active={value.profileId === p.id}
              activeColor={p.color}
              icon={PROFILE_ICONS[p.icon] ?? Boxes}
              label={p.name}
              onClick={() => update({ profileId: p.id, categoryId: null })}
            />
          ))}
      </div>

      {/* Row 3: filter pickers */}
      <div className="flex flex-wrap items-center gap-2">
        <SubcategoryPicker
          options={scopedCategories}
          value={value.categoryId}
          disabled={scopedCategories.length === 0}
          onChange={(id) => update({ categoryId: id })}
        />
        <LocationPicker value={value.location} locations={locations} onChange={(loc) => update({ location: loc })} />
        <StatusPicker value={value.status} onChange={(s) => update({ status: s })} />
        <AlertPicker value={value.preset} alerts={alerts} onChange={(p) => update({ preset: p })} />

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
            {value.categoryId && (
              <ActiveChip label={`หมวด: ${scopedCategories.find((c) => c.id === value.categoryId)?.name ?? ""}`} onRemove={() => update({ categoryId: null })} />
            )}
            {locLabel && (
              <ActiveChip icon={<MapPin className="size-3" />} label={locLabel} onRemove={() => update({ location: {} })} />
            )}
            {value.status.map((s) => (
              <ActiveChip key={s} label={STATUS_LABELS[s] ?? s} onRemove={() => update({ status: value.status.filter((x) => x !== s) })} />
            ))}
            {value.preset && (
              <ActiveChip tone="alert" icon={<Bell className="size-3" />} label={PRESETS.find((p) => p.key === value.preset)?.label ?? ""} onRemove={() => update({ preset: null })} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Profile tab ───
function ProfileTab({ active, activeColor, icon: Icon, label, onClick }: { active: boolean; activeColor?: string; icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 h-12 px-3 rounded-lg text-sm font-medium border transition-colors min-w-0",
        active
          ? activeColor
            ? cn(activeColor, "border-transparent font-semibold shadow-sm ring-1 ring-black/5")
            : "bg-primary text-primary-foreground border-transparent shadow-sm"
          : "bg-background text-foreground/80 border-border hover:bg-muted",
      )}
    >
      <Icon className="size-6 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

// ─── Active chip ───
function ActiveChip({ label, onRemove, icon, tone = "default" }: { label: string; onRemove: () => void; icon?: React.ReactNode; tone?: "default" | "alert" }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-full text-xs font-medium border",
      tone === "alert" ? "bg-orange-500/15 text-orange-600 border-orange-500/30" : "bg-primary/10 text-foreground border-primary/20",
    )}>
      {icon}
      {label}
      <button type="button" onClick={onRemove} className="ml-0.5 rounded-full p-0.5 hover:bg-black/10" aria-label={`ลบ ${label}`}>
        <X className="size-3" />
      </button>
    </span>
  );
}

// ─── Filter trigger button ───
function FilterButton({ active, icon: Icon, children, count, ...rest }: { active?: boolean; icon: React.ElementType; children: React.ReactNode; count?: number } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 disabled:pointer-events-none",
        active ? "bg-primary/10 border-primary/40 text-foreground" : "bg-background border-border text-foreground/80 hover:bg-muted",
        rest.className,
      )}
    >
      <Icon className="size-4 text-muted-foreground" />
      {children}
      {count ? (
        <span className="ml-0.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold tabular-nums">{count}</span>
      ) : null}
    </button>
  );
}

// ─── Subcategory ───
function SubcategoryPicker({ options, value, onChange, disabled }: { options: CategoryOption[]; value: string | null; onChange: (id: string | null) => void; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((c) => c.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={(props: React.ComponentProps<"button">) => (
          <FilterButton {...props} active={!!value} icon={Layers}>{selected?.name ?? "หมวดหมู่ย่อย"}</FilterButton>
        )}
      />
      <PopoverContent align="start" className="w-60 p-1.5">
        <button className="w-full text-left text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md hover:bg-muted" onClick={() => { onChange(null); setOpen(false); }}>
          ทุกหมวดหมู่ย่อย
        </button>
        <div className="h-px bg-border my-1" />
        <ScrollArea className="max-h-64">
          {options.map((o) => (
            <button key={o.id} className={cn("w-full text-left text-sm px-2 py-2 rounded-md flex items-center justify-between hover:bg-muted", value === o.id && "bg-primary/10 text-foreground")} onClick={() => { onChange(o.id); setOpen(false); }}>
              {o.name}
              {value === o.id && <Check className="size-4 text-primary" />}
            </button>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// ─── Status (multi) ───
function StatusPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = React.useState(false);
  const toggle = (k: string) => onChange(value.includes(k) ? value.filter((s) => s !== k) : [...value, k]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props: React.ComponentProps<"button">) => (
          <FilterButton {...props} active={value.length > 0} icon={Activity} count={value.length || undefined}>สถานะ</FilterButton>
        )}
      />
      <PopoverContent align="start" className="w-64 p-2">
        <div className="text-xs font-medium text-muted-foreground px-1 pb-1.5">เลือกได้หลายรายการ</div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_KEYS.map((k) => {
            const active = value.includes(k);
            return (
              <button key={k} onClick={() => toggle(k)} className={cn(
                "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs font-medium border transition",
                active ? `${STATUS_PILLS[k]} ring-2 ring-primary/30` : "bg-background border-border text-foreground/70 hover:bg-muted",
              )}>
                {active && <Check className="size-3" />}
                {STATUS_LABELS[k]}
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

// ─── Alerts (single preset, inline) ───
function AlertPicker({ value, alerts, onChange }: { value: PresetKey | null; alerts: ItemsFilterBarProps["alerts"]; onChange: (p: PresetKey | null) => void }) {
  return (
    <div className="inline-flex items-center gap-1.5 h-9 pl-2 pr-1 rounded-lg border border-border bg-background">
      <Bell className="size-4 text-orange-500" />
      <span className="text-sm font-medium text-foreground/80 mr-0.5 hidden sm:inline">Alerts</span>
      {PRESETS.map((a) => {
        const active = value === a.key;
        const count = alerts[a.countKey];
        return (
          <button key={a.key} type="button" onClick={() => onChange(active ? null : a.key)} className={cn(
            "inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium transition",
            active ? a.activeCls : "bg-orange-500/15 text-orange-600 hover:brightness-95",
          )}>
            {a.label}
            {count > 0 && (
              <span className={cn("inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-bold tabular-nums", active ? a.badgeCls : "bg-white text-orange-600")}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Location cascade ───
// Group flat LocationOption[] into a tree: building → floor → room → detail.
function buildTree(locations: LocationOption[]) {
  const buildings = new Map<string, Map<string, Map<string, Set<string>>>>();
  for (const l of locations) {
    if (!buildings.has(l.building)) buildings.set(l.building, new Map());
    const floors = buildings.get(l.building)!;
    if (!floors.has(l.floor)) floors.set(l.floor, new Map());
    const rooms = floors.get(l.floor)!;
    if (!rooms.has(l.room)) rooms.set(l.room, new Set());
    if (l.detail) rooms.get(l.room)!.add(l.detail);
  }
  return buildings;
}

function LocationPicker({ value, locations, onChange }: { value: LocationFilter; locations: LocationOption[]; onChange: (loc: LocationFilter) => void }) {
  const [open, setOpen] = React.useState(false);
  const label = formatLocation(value);
  const [draft, setDraft] = React.useState<LocationFilter>(value);
  React.useEffect(() => { if (open) setDraft(value); }, [open, value]);

  const tree = React.useMemo(() => buildTree(locations), [locations]);
  const buildings = [...tree.keys()];
  const floors = draft.building ? [...(tree.get(draft.building)?.keys() ?? [])] : [];
  const rooms = draft.building && draft.floor ? [...(tree.get(draft.building)?.get(draft.floor)?.keys() ?? [])] : [];
  const details = draft.building && draft.floor && draft.room ? [...(tree.get(draft.building)?.get(draft.floor)?.get(draft.room) ?? [])] : [];

  const apply = (loc: LocationFilter) => { onChange(loc); setOpen(false); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props: React.ComponentProps<"button">) => (
          <FilterButton {...props} active={!!label} icon={MapPin}>{label ?? "สถานที่"}</FilterButton>
        )}
      />
      <PopoverContent align="start" sideOffset={6} className="w-[min(92vw,640px)] max-h-[85vh] p-0 overflow-hidden flex flex-col">
        {/* breadcrumb */}
        <div className="flex items-center gap-1 flex-wrap px-3 py-2.5 bg-muted/50 border-b border-border text-xs shrink-0">
          <MapPin className="size-3.5 text-primary" />
          <Crumb label="ทั่วทุกที่" active={!draft.building} onClick={() => setDraft({})} />
          {draft.building && (<><ChevronRight className="size-3 text-muted-foreground" /><Crumb label={draft.building} active={!draft.floor} onClick={() => setDraft({ building: draft.building })} /></>)}
          {draft.floor && (<><ChevronRight className="size-3 text-muted-foreground" /><Crumb label={draft.floor} active={!draft.room && !draft.detail} onClick={() => setDraft({ building: draft.building, floor: draft.floor })} /></>)}
          {draft.room && (<><ChevronRight className="size-3 text-muted-foreground" /><Crumb label={`ห้อง ${draft.room}`} active={!draft.detail} onClick={() => setDraft({ building: draft.building, floor: draft.floor, room: draft.room })} /></>)}
          {draft.detail && (<><ChevronRight className="size-3 text-muted-foreground" /><span className="font-medium truncate max-w-[120px]">{draft.detail}</span></>)}
        </div>

        {/* cascade columns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border flex-1 min-h-0">
          <CascadeColumn title="อาคาร">
            {buildings.map((b) => (
              <CascadeRow key={b} label={b} selected={draft.building === b} hasChildren onClick={() => setDraft({ building: b })} />
            ))}
          </CascadeColumn>
          <CascadeColumn title="ชั้น" empty={!draft.building}>
            {floors.map((f) => (
              <CascadeRow key={f} label={f} selected={draft.floor === f} hasChildren onClick={() => setDraft({ building: draft.building, floor: f })} />
            ))}
          </CascadeColumn>
          <CascadeColumn title="ห้อง" empty={!draft.floor}>
            {rooms.map((r) => (
              <CascadeRow key={r} label={`ห้อง ${r}`} selected={draft.room === r} hasChildren onClick={() => setDraft({ building: draft.building, floor: draft.floor, room: r })} />
            ))}
          </CascadeColumn>
          <CascadeColumn title="รายละเอียด" empty={!draft.room}>
            {details.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">คลิก &quot;ใช้ตัวกรอง&quot; เพื่อกรองทั้งห้อง</div>
            ) : details.map((d) => (
              <CascadeRow key={d} label={d} selected={draft.detail === d} onClick={() => apply({ building: draft.building, floor: draft.floor, room: draft.room, detail: d })} />
            ))}
          </CascadeColumn>
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-border bg-muted/30 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => apply({})} className="h-8 text-muted-foreground">ล้างสถานที่</Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="h-8">ยกเลิก</Button>
            <Button size="sm" onClick={() => apply(draft)} className="h-8">ใช้ตัวกรองนี้</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Crumb({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("px-1.5 py-0.5 rounded hover:bg-background", active ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</button>
  );
}

function CascadeColumn({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="flex flex-col min-h-0 overflow-hidden">
      <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-border bg-background shrink-0">{title}</div>
      {empty ? (
        <div className="flex-1 min-h-0 flex items-center justify-center px-3 text-center text-xs text-muted-foreground/70">เลือกระดับก่อนหน้า</div>
      ) : (
        <ScrollArea className="flex-1 min-h-0"><div className="py-1">{children}</div></ScrollArea>
      )}
    </div>
  );
}

function CascadeRow({ label, selected, onClick, hasChildren }: { label: string; selected?: boolean; onClick: () => void; hasChildren?: boolean }) {
  return (
    <button onClick={onClick} className={cn("w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors", selected ? "bg-primary/10 text-foreground font-medium" : "hover:bg-muted text-foreground/85")}>
      <span className="flex-1 truncate">{label}</span>
      {selected && <Check className="size-3.5 text-primary shrink-0" />}
      {hasChildren && !selected && <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />}
    </button>
  );
}
