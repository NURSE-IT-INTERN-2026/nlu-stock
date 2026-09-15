"use client";

import * as React from "react";
import {
  Layers, MapPin, ChevronRight, Check, Boxes, Package, Beaker, Hammer,
  Building2, Monitor, BookOpen, Puzzle, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CategoryOption, LocationOption, ProfileOption } from "@/lib/api";

// ปุ่มกรองชุดเดียวที่ /items, /dispense และหน้ารายงานใช้ร่วมกัน — ห้ามเขียน Select แบนซ้ำในหน้าใดหน้าหนึ่ง.

// Map profile.icon string → lucide component. Unknown → Boxes fallback.
const PROFILE_ICONS: Record<string, LucideIcon> = {
  Package, Beaker, Hammer, Building2, Monitor, BookOpen, Puzzle, Boxes,
};

export interface LocationFilter {
  building?: string;
  floor?: string;
  room?: string;
  detail?: string | null;
}


// locationLabel (constants) requires all fields; ours are optional, so format locally.
export function formatLocation(loc: LocationFilter): string | null {
  const parts = [loc.building, loc.floor, loc.room, loc.detail].filter(Boolean);
  return parts.length ? parts.join(" / ") : null;
}

// ─── Filter trigger button ───
export function FilterButton({ active, icon: Icon, children, count, ...rest }: { active?: boolean; icon: React.ElementType; children: React.ReactNode; count?: number } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 disabled:pointer-events-none",
        // พื้นขาว (bg-card) ไม่ใช่ bg-background: ปุ่มนี้วางบนพื้นหน้า (settings/reports) ด้วย
        // ซึ่ง bg-background จะกลืนหายไปกับพื้นข้างใต้ — bg-card เท่ากับ Input ที่วางข้างกัน
        active ? "bg-primary/10 border-primary/40 text-foreground" : "bg-card border-border text-foreground/80 hover:bg-muted",
        rest.className,
      )}
    >
      <Icon className="size-4 text-muted-foreground shrink-0" />
      <span className="min-w-0 max-w-[150px] truncate">{children}</span>
      {count ? (
        <span className="ml-0.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold tabular-nums">{count}</span>
      ) : null}
    </button>
  );
}

// ─── Category cascade (profile → subcategory) ───
// 2-level cascade mirroring LocationPicker. No schema change: CategoryType.profileId already holds main→sub.
export function CategoryPicker({ profiles, categories, value, onChange, className, requireCategory }: {
  profiles: ProfileOption[];
  categories: CategoryOption[];
  value: { profileId: string; categoryId: string | null };
  onChange: (next: { profileId: string; categoryId: string | null }) => void;
  /** แถวตัวกรองของรายงานเป็นปุ่ม h-8 rounded-full — ปุ่มตั้งต้นเป็น h-9 rounded-lg ของหน้าพัสดุ */
  className?: string;
  /** ฟอร์มต้องได้หมวดหมู่ย่อยเสมอ ไม่ใช่ตัวกรองที่หยุดแค่ประเภทได้ — ตัดทางลัด
   *  "เลือกประเภทอย่างเดียว" กับปุ่มล้างค่าออก เหลือทางเดียวคือคลิกหมวดหมู่ย่อย */
  requireCategory?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [draftProfile, setDraftProfile] = React.useState<string>(value.profileId);
  const [draftCategory, setDraftCategory] = React.useState<string | null>(value.categoryId);
  React.useEffect(() => { if (open) { setDraftProfile(value.profileId); setDraftCategory(value.categoryId); } }, [open, value.profileId, value.categoryId]);

  const profile = profiles.find((p) => p.id === draftProfile) ?? null;
  const subsOf = (profileId: string) => categories.filter((c) => c.profile?.id === profileId);
  const scoped = draftProfile ? subsOf(draftProfile) : categories;
  // ฟอร์มต้องจบที่หมวดหมู่ย่อยเสมอ ประเภทที่ไม่มีหมวดย่อยเลยจึงเลือกไม่ได้ — ปล่อยให้กดคือพาเข้า
  // คอลัมน์ว่างที่ไม่มีปุ่มยืนยันให้กดออก (footer ซ่อนทั้งล้างและใช้ตัวกรองในโหมดนี้). ตัวกรองยัง
  // โชว์ครบเหมือนเดิม: หยุดแค่ประเภทเป็นคำตอบที่ใช้ได้ของมัน
  const shownProfiles = requireCategory ? profiles.filter((p) => subsOf(p.id).length > 0) : profiles;

  const selProfile = profiles.find((p) => p.id === value.profileId);
  // ประเภทที่มีหมวดย่อยตัวเดียวคือตัวตั้งต้นที่ระบบสร้างให้ (ดู POST /api/settings/profiles) —
  // คนใช้ไม่เคยเห็นมันตอนเลือก จึงไม่ควรโผล่ในป้ายว่า "ยา / ยา"
  const label = selProfile
    ? (value.categoryId && subsOf(selProfile.id).length > 1
        ? `${selProfile.name} / ${categories.find((c) => c.id === value.categoryId)?.name ?? ""}`
        : selProfile.name)
    : null;

  const apply = (p: string, c: string | null) => { onChange({ profileId: p, categoryId: c }); setOpen(false); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props: React.ComponentProps<"button">) => (
          <FilterButton {...props} className={cn(props.className, className)} active={!!value.profileId} icon={Layers}>{label ?? "หมวดหมู่"}</FilterButton>
        )}
      />
      <PopoverContent align="start" sideOffset={6} className="w-[min(92vw,480px)] max-h-[70vh] p-0 overflow-hidden flex flex-col">
        {/* breadcrumb */}
        <div className="flex items-center gap-1 flex-wrap px-3 py-2.5 bg-muted/50 border-b border-border text-xs shrink-0">
          <Layers className="size-3.5 text-primary" />
          <Crumb label="ทุกหมวดหมู่" active={!draftProfile} onClick={() => { setDraftProfile(""); setDraftCategory(null); }} />
          {draftProfile && (
            <>
              <ChevronRight className="size-3 text-muted-foreground" />
              <Crumb label={profile?.name ?? draftProfile} active={!draftCategory} onClick={() => setDraftCategory(null)} />
            </>
          )}
        </div>

        {/* cascade columns */}
        <div className="grid grid-cols-2 divide-x divide-border flex-1 min-h-0">
          <CascadeColumn title="ประเภท">
            {shownProfiles.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">ยังไม่มีประเภทที่มีหมวดหมู่ย่อย</div>
            ) : shownProfiles.map((p) => {
              const PIcon = PROFILE_ICONS[p.icon] ?? Boxes;
              return (
                <button key={p.id} onClick={() => {
                  // ชั้นสองมีอะไรให้เลือกจริงก็ต่อเมื่อมีหมวดย่อยตั้งแต่สองตัวขึ้นไป: ตัวเดียว = ตัวตั้งต้น
                  // ที่ระบบสร้างให้ตอนสร้างประเภท, ศูนย์ตัว = ประเภทเก่าก่อนกติกานั้น (โหมดฟอร์มกรอง
                  // ทิ้งไปแล้วที่ shownProfiles). ทั้งสองกรณีจบที่นี่
                  const subs = subsOf(p.id);
                  if (subs.length <= 1) {
                    apply(p.id, subs[0]?.id ?? null);
                    return;
                  }
                  setDraftProfile(p.id); setDraftCategory(null);
                }} className={cn("w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors", draftProfile === p.id ? "bg-primary/10 text-foreground font-medium" : "hover:bg-muted text-foreground/85")}>
                  <PIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 min-w-0 truncate">{p.name}</span>
                  {draftProfile === p.id && <Check className="size-3.5 text-primary shrink-0" />}
                </button>
              );
            })}
          </CascadeColumn>
          <CascadeColumn title="หมวดหมู่ย่อย" empty={!draftProfile}>
            {scoped.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">ไม่มีหมวดหมู่ย่อย</div>
            ) : scoped.map((c) => (
              <CascadeRow key={c.id} label={c.name} selected={draftCategory === c.id} onClick={() => apply(draftProfile, c.id)} />
            ))}
          </CascadeColumn>
        </div>

        {/* footer */}
        {/* ฟอร์มเลือกเสร็จตอนคลิกหมวดหมู่ย่อย ปุ่มยืนยันจะไม่มีอะไรให้ยืนยันเพิ่ม */}
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-border bg-muted/30 shrink-0">
          {requireCategory ? <span /> : (
            <Button variant="ghost" size="sm" onClick={() => apply("", null)} className="h-8 text-muted-foreground">ล้างหมวดหมู่</Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="h-8">ยกเลิก</Button>
            {!requireCategory && (
              <Button size="sm" onClick={() => apply(draftProfile, draftCategory)} className="h-8">ใช้ตัวกรองนี้</Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
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

export function LocationPicker({ value, locations, onChange, className }: { value: LocationFilter; locations: LocationOption[]; onChange: (loc: LocationFilter) => void; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const label = formatLocation(value);
  const [draft, setDraft] = React.useState<LocationFilter>(value);
  // ผูกกับสี่ช่อง ไม่ใช่กับตัว object เหมือน CategoryPicker ข้างบน: ผู้เรียกที่ยังไม่ได้ตั้งตัวกรอง
  // ส่ง `values.location ?? {}` ซึ่งเป็น object ใหม่ทุก render (ดู report-filters) — ผูกกับ object
  // แปลว่า parent re-render ครั้งใดก็ตามที่ป็อปอัพยังเปิดอยู่จะล้างที่ผู้ใช้ไล่เลือกค้างไว้ทิ้ง
  const { building, floor, room, detail } = value;
  React.useEffect(() => {
    if (open) setDraft({ building, floor, room, detail });
  }, [open, building, floor, room, detail]);

  const tree = React.useMemo(() => buildTree(locations), [locations]);
  const buildings = [...tree.keys()];
  const floors = draft.building ? [...(tree.get(draft.building)?.keys() ?? [])] : [];
  const rooms = draft.building && draft.floor ? [...(tree.get(draft.building)?.get(draft.floor)?.keys() ?? [])] : [];
  const details = draft.building && draft.floor && draft.room ? [...(tree.get(draft.building)?.get(draft.floor)?.get(draft.room) ?? [])] : [];

  // click a dead-end level (no children) → apply immediately, like a leaf
  const floorsOf = (b?: string) => b ? [...(tree.get(b)?.keys() ?? [])] : [];
  const roomsOf = (b?: string, f?: string) => b && f ? [...(tree.get(b)?.get(f)?.keys() ?? [])] : [];
  const detailsOf = (b?: string, f?: string, r?: string) => b && f && r ? [...(tree.get(b)?.get(f)?.get(r) ?? [])] : [];

  const apply = (loc: LocationFilter) => { onChange(loc); setOpen(false); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props: React.ComponentProps<"button">) => (
          <FilterButton {...props} className={cn(props.className, className)} active={!!label} icon={MapPin}>{label ?? "สถานที่"}</FilterButton>
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
            {buildings.map((b) => {
              const kids = floorsOf(b);
              return <CascadeRow key={b} label={b} selected={draft.building === b} hasChildren={kids.length > 0} onClick={() => kids.length === 0 ? apply({ building: b }) : setDraft({ building: b })} />;
            })}
          </CascadeColumn>
          <CascadeColumn title="ชั้น" empty={!draft.building}>
            {floors.map((f) => {
              const kids = roomsOf(draft.building, f);
              return <CascadeRow key={f} label={f} selected={draft.floor === f} hasChildren={kids.length > 0} onClick={() => kids.length === 0 ? apply({ building: draft.building, floor: f }) : setDraft({ building: draft.building, floor: f })} />;
            })}
          </CascadeColumn>
          <CascadeColumn title="ห้อง" empty={!draft.floor}>
            {rooms.map((r) => {
              const kids = detailsOf(draft.building, draft.floor, r);
              return <CascadeRow key={r} label={r ? `ห้อง ${r}` : "ไม่มีห้อง"} selected={draft.room === r} hasChildren={kids.length > 0} onClick={() => kids.length === 0 ? apply({ building: draft.building, floor: draft.floor, room: r }) : setDraft({ building: draft.building, floor: draft.floor, room: r })} />;
            })}
          </CascadeColumn>
          <CascadeColumn title="รายละเอียด" empty={!draft.room}>
            {details.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">กด ใช้ตัวกรอง เพื่อกรองทั้งห้อง</div>
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
    // ชื่อคอลัมน์เป็น aria-label ด้วย: ประเภทกับหมวดหมู่ย่อยมีชื่อซ้ำกันได้ (ครุภัณฑ์/ครุภัณฑ์)
    // แยกกันไม่ออกถ้าไม่บอกว่าปุ่มอยู่คอลัมน์ไหน
    <div className="flex flex-col min-h-0 overflow-hidden" role="group" aria-label={title}>
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
