"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Layers, MapPin, Users, Activity, ListChecks,
  CalendarRange, Wrench, X, Boxes, Package, Beaker, Hammer,
  Building2, Monitor, BookOpen, Puzzle, Search, type LucideIcon,
} from "lucide-react";
import { USAGE_TYPE_LABELS } from "@/lib/constants";
import { fmtDate, TH_DATE } from "@/lib/format";
import {
  getPublicCategories, getPublicLocations, getUsers, getProfiles,
} from "@/lib/api";
import type { ProfileOption } from "@/lib/api";

// profile.icon string → lucide component (mirrors items-filter-bar)
const PROFILE_ICONS: Record<string, LucideIcon> = {
  Package, Beaker, Hammer, Building2, Monitor, BookOpen, Puzzle, Boxes,
};

export interface FilterValues {
  dateFrom?: string;
  dateTo?: string;
  profileId?: string;
  categoryId?: string;
  locationId?: string;
  staffId?: string;
  // ออกจากคลัง: contains-match over the columns เหตุผล is rendered from (lib/constants
  // recipientLabel) — รหัสวิชา, ชื่อวิชา, รายละเอียดการนำไปใช้, and the legacy typed name.
  recipient?: string;
  usageType?: string;
  status?: string;
  loanStatus?: string; // ออกจากคลัง: "open" | "overdue" (export only — the tab drives it via `status`)
  kind?: string; // ออกจากคลัง: consume | borrow | inuse (export only — the segment drives it)
  // ฝั่งของ tab ที่แบ่งเป็นสองก้อน — มูลค่าคงคลัง: consumable | durable,
  // ค่าใช้จ่ายรายปี: consumable | other. (export only — the segment drives it)
  side?: string;
  year?: string;
  maintenanceType?: string;
  from?: string; // status-log previousStatus (export only — not rendered)
  to?: string;   // status-log newStatus (export only — not rendered)
}

export interface FilterConfig {
  dateRange?: boolean;
  /** ปุ่มลัดเลือกทั้งปี — เขียนทับ dateFrom/dateTo เป็น 1 ม.ค.–31 ธ.ค. ของปีที่เลือก.
   *  ไม่ใช่ตัวกรอง `year` (ค่าแยกของค่าใช้จ่ายรายปี) — อันนี้เป็นแค่มือที่กรอก date picker ให้ */
  yearQuick?: boolean;
  profiles?: boolean;
  categories?: boolean;
  locations?: boolean;
  staff?: boolean;
  /** Free-text เหตุผล box. The placeholder names what can be typed into it — "ค้นหาเหตุผล"
   *  alone hides that a รหัสวิชา matches too, and รหัสวิชา is what people search by. */
  recipientSearch?: string;
  usageTypes?: boolean;
  statusOptions?: { value: string; label: string }[];
  year?: boolean;
  maintenanceType?: boolean;
}

// ponytail: ทุก tab ที่เป็น ledger เปิดมาที่ "ปีนี้ทั้งปี" 1 ม.ค. – 31 ธ.ค. ไม่ใช่ทั้งชีวิตของระบบ —
// กด "ล้างตัวกรอง" แล้วได้ทั้งหมด. อยู่ที่เดียวเพื่อไม่ให้แต่ละ tab ตั้งช่วงเริ่มต้นไม่เท่ากัน
// แล้วตัวเลขเทียบกันไม่ได้.
export function defaultDateFilters(): FilterValues {
  const year = new Date().getFullYear();
  return {
    dateFrom: `${year}-01-01`,
    dateTo: `${year}-12-31`,
  };
}

/** "ตั้งแต่ 11 พ.ค. 2569" / "ทุกช่วงเวลา" — สำหรับบรรทัดใต้ตัวเลขในแถบสรุป */
export function periodLabel(values: FilterValues): string {
  if (!values.dateFrom && !values.dateTo) return "ทุกช่วงเวลา";
  const from = values.dateFrom ? `ตั้งแต่ ${fmtDate(new Date(values.dateFrom), TH_DATE)}` : "";
  const to = values.dateTo ? `ถึง ${fmtDate(new Date(values.dateTo), TH_DATE)}` : "";
  return [from, to].filter(Boolean).join(" ");
}

interface ReportFiltersProps {
  config: FilterConfig;
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  actions?: ReactNode;
  /** แถวบนสุดในการ์ดใบเดียวกัน — ที่ของ chip เลือก segment. มันคือตัวกรองอย่างหนึ่งเหมือนกัน
   *  การปล่อยให้ลอยอยู่นอกการ์ดทำให้อ่านเป็นหัวเรื่องที่ไม่มีบ้าน */
  leading?: ReactNode;
}

interface Option {
  id: string;
  name: string;
  code?: string;
}

interface CategoryLite extends Option {
  profile?: { id: string } | null;
}

// 150px เดิมเหลือที่ให้ข้อความ 74px แต่ "31 ธ.ค. 2569" กว้าง 87px — วันที่จึงถูกตัดเป็น
// "31 ธ.ค. 2…" ทุกครั้งที่เดือนหรือวันเป็นสองหลัก. 176px เหลือที่ให้ข้อความ 100px ซึ่งพอสำหรับ
// วันที่ยาวที่สุดที่ thaiDate สร้างได้ บวกที่เผื่อไว้เล็กน้อย.
// บนมือถือกว้างเต็มแถว ไม่ใช่ครึ่งแถว: จอ 375px หารสองแล้วเหลือที่ให้ข้อความ 59px ซึ่งตัดวันที่
// ทุกกรณี — สองช่องเรียงกันจึงแสดงเต็มไม่ได้เลย ต้องซ้อนกัน
const dateInputCls = "h-8 w-full min-w-0 sm:w-44 rounded-lg border-border bg-background text-sm";

function FilterSelect({
  icon: Icon,
  value,
  placeholder,
  onValueChange,
  selectedLabel,
  children,
}: {
  icon: LucideIcon;
  value: string;
  placeholder: string;
  onValueChange: (v: string) => void;
  selectedLabel?: string;
  children: ReactNode;
}) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v ?? "")}>
      <SelectTrigger className="h-9 min-w-[120px] max-w-full flex-1 sm:flex-none gap-2 rounded-lg border-border bg-background">
        <Icon className="size-4 text-muted-foreground shrink-0" />
        {/* ponytail: pass explicit label as children — Base UI Select.Value falls back to the
          raw value (id) when it can't resolve from unmounted popup items. Every other select
          in the app does this; FilterSelect was the lone outlier showing ids. */}
        <SelectValue placeholder={placeholder}>{selectedLabel ?? placeholder}</SelectValue>
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

/**
 * เหตุผล is typed free-hand at the cart, so it gets a search box rather than a select.
 * Debounced: the tab refetches on every filter change and a keystroke-per-request would put
 * one page-load of the whole ledger behind each letter.
 */
function FilterSearch({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder: string;
  onCommit: (v: string) => void;
}) {
  const [text, setText] = useState(value);

  // Re-sync when the value changes from outside (ล้างตัวกรอง, switching segment). Done during
  // render, not in an effect: an effect would paint the stale text for a frame first.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value);
  }

  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onCommit(text), 300);
    return () => clearTimeout(t);
  }, [text, value, onCommit]);

  return (
    <div className="relative w-full sm:w-[190px]">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 rounded-lg border-border bg-background pl-8 text-sm"
      />
    </div>
  );
}

export function ReportFilters({ config, values, onChange, actions, leading }: ReportFiltersProps) {
  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [staff, setStaff] = useState<Option[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);

  useEffect(() => {
    if (config.profiles || config.categories) {
      getPublicCategories().then(setCategories).catch(() => {});
    }
    if (config.profiles) {
      getProfiles()
        .then((data) => setProfiles([...data].sort((a, b) => a.sortOrder - b.sortOrder)))
        .catch(() => {});
    }
    if (config.locations) {
      getPublicLocations().then((data) => setLocations(data as Option[])).catch(() => {});
    }
    if (config.staff) {
      getUsers().then((data) => setStaff(data as Option[])).catch(() => {});
    }
  }, [config.profiles, config.categories, config.locations, config.staff]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  // นับเฉพาะตัวกรองที่มองเห็นอยู่จริง — segment ที่ไม่มีช่องวันที่ (ภาพนิ่ง) ยังถือค่าวันที่ของ
  // segment ก่อนหน้าไว้ใน state และจะทำให้ปุ่ม "ล้างตัวกรอง" โผล่มาโดยไม่มีอะไรบนจอให้ล้าง
  const dateActive = config.dateRange || config.yearQuick;
  const activeCount = [
    dateActive ? values.dateFrom : undefined, dateActive ? values.dateTo : undefined,
    values.profileId, values.categoryId,
    values.locationId, values.staffId, values.recipient, values.usageType, values.status,
    values.maintenanceType,
    values.year && values.year !== String(currentYear) ? values.year : undefined,
  ].filter(Boolean).length;

  const activeProfile = profiles.find((p) => p.id === values.profileId);
  const ProfileIcon = activeProfile ? (PROFILE_ICONS[activeProfile.icon] ?? Boxes) : Layers;
  const scopedCategories = values.profileId
    ? categories.filter((c) => c.profile?.id === values.profileId)
    : categories;

  return (
    <div data-testid="report-filters" className="rounded-2xl border border-border/60 bg-card p-3 sm:p-4">
      {/* chip ซ้าย ปุ่ม export ขวา: แถวที่มีของอยู่ข้างเดียวอ่านเป็นที่ว่างครึ่งการ์ด และ export
          ก็เป็นของทั้งชุดข้อมูลที่ chip เลือกอยู่ ไม่ใช่ของตัวกรองบรรทัดล่าง */}
      {leading && (
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border/60 pb-3">
          {/* basis-full บนมือถือ: ราง segment กับปุ่ม export เบียดกันในบรรทัดเดียวแล้วป้ายไทยหด
              จนอ่านไม่ออก — จอกว้างค่อยแบ่งบรรทัดเดียวกัน โดย segment กินที่ที่เหลือทั้งหมด */}
          <div className="min-w-0 basis-full sm:flex-1">{leading}</div>
          <div className="w-full shrink-0 sm:w-auto">{actions}</div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {config.yearQuick && (() => {
          // ปีที่ "เลือกอยู่" อ่านย้อนจากค่าใน date picker — ไม่มี state ของตัวเอง จึงไม่มีวัน
          // เถียงกับ picker: พิมพ์ช่วงเองเมื่อไรป้ายก็ตกเป็น "กำหนดเอง" เอง
          const selected = years.find(
            (y) => values.dateFrom === `${y}-01-01` && values.dateTo === `${y}-12-31`,
          );
          return (
            <FilterSelect
              icon={CalendarRange}
              value={selected ?? "custom"}
              placeholder="ปี"
              selectedLabel={selected ? `พ.ศ. ${Number(selected) + 543}` : "กำหนดเอง"}
              onValueChange={(v) => {
                if (v === "custom") return;
                onChange({ ...values, dateFrom: `${v}-01-01`, dateTo: `${v}-12-31` });
              }}
            >
              {years.map((y) => (
                <SelectItem key={y} value={y}>{`พ.ศ. ${Number(y) + 543}`}</SelectItem>
              ))}
            </FilterSelect>
          );
        })()}
        {config.dateRange && (
          // ซ้อนบนมือถือ เรียงกันบนจอกว้าง. "ถึง" ต้องอยู่ต่อไปแม้ตอนซ้อน — พอเลือกวันแล้ว
          // placeholder "จากวันที่/ถึงวันที่" ถูกแทนที่ด้วยตัววันที่ ไม่มีอะไรเหลือบอกว่าช่องไหนคือช่องไหน
          <div className="flex w-full flex-col items-stretch gap-1.5 sm:w-auto sm:flex-row sm:items-center">
            <DatePicker
              value={values.dateFrom ?? ""}
              onChange={(v) => onChange({ ...values, dateFrom: v || undefined })}
              placeholder="จากวันที่"
              className={dateInputCls}
            />
            <span className="text-center text-xs text-muted-foreground sm:text-left">ถึง</span>
            <DatePicker
              value={values.dateTo ?? ""}
              onChange={(v) => onChange({ ...values, dateTo: v || undefined })}
              placeholder="ถึงวันที่"
              className={dateInputCls}
            />
          </div>
        )}

        {config.profiles && (
          <FilterSelect
            icon={ProfileIcon}
            value={values.profileId ?? "all"}
            placeholder="ทุกประเภท"
            selectedLabel={values.profileId ? profiles.find((p) => p.id === values.profileId)?.name : undefined}
            onValueChange={(v) =>
              onChange({ ...values, profileId: v === "all" ? undefined : String(v), categoryId: undefined })
            }
          >
            <SelectItem value="all">ทุกประเภท</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </FilterSelect>
        )}

        {config.categories && (
          <FilterSelect
            icon={Layers}
            value={values.categoryId ?? "all"}
            placeholder="ทุกหมวดหมู่"
            selectedLabel={values.categoryId ? scopedCategories.find((c) => c.id === values.categoryId)?.name : undefined}
            onValueChange={(v) => onChange({ ...values, categoryId: v === "all" ? undefined : String(v) })}
          >
            <SelectItem value="all">ทุกหมวดหมู่</SelectItem>
            {scopedCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </FilterSelect>
        )}

        {config.locations && (
          <FilterSelect
            icon={MapPin}
            value={values.locationId ?? "all"}
            placeholder="ทุกสถานที่"
            selectedLabel={values.locationId ? locations.find((l) => l.id === values.locationId)?.name : undefined}
            onValueChange={(v) => onChange({ ...values, locationId: v === "all" ? undefined : String(v) })}
          >
            <SelectItem value="all">ทุกสถานที่</SelectItem>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </FilterSelect>
        )}

        {config.staff && (
          <FilterSelect
            icon={Users}
            value={values.staffId ?? "all"}
            placeholder="ผู้เบิก"
            selectedLabel={values.staffId ? staff.find((s) => s.id === values.staffId)?.name : undefined}
            onValueChange={(v) => onChange({ ...values, staffId: v === "all" ? undefined : String(v) })}
          >
            <SelectItem value="all">ผู้เบิกทุกคน</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </FilterSelect>
        )}

        {config.recipientSearch && (
          <FilterSearch
            value={values.recipient ?? ""}
            placeholder={config.recipientSearch}
            onCommit={(v) => onChange({ ...values, recipient: v.trim() || undefined })}
          />
        )}

        {config.usageTypes && (
          <FilterSelect
            icon={Activity}
            value={values.usageType ?? "all"}
            placeholder="ประเภทการใช้งาน"
            selectedLabel={values.usageType ? USAGE_TYPE_LABELS[values.usageType] : undefined}
            onValueChange={(v) => onChange({ ...values, usageType: v === "all" ? undefined : String(v) })}
          >
            <SelectItem value="all">ทุกประเภท</SelectItem>
            {/* LABELS, not OPTIONS: a filter has to reach every value the data holds,
                including OTHER, which is retired from the เบิก form but still sits in
                old records (and is still written by api/items/[id]/recover-loss). */}
            {Object.entries(USAGE_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </FilterSelect>
        )}

        {config.statusOptions && (
          <FilterSelect
            icon={ListChecks}
            value={values.status ?? "all"}
            placeholder="สถานะ"
            selectedLabel={values.status ? config.statusOptions?.find((o) => o.value === values.status)?.label : undefined}
            onValueChange={(v) => onChange({ ...values, status: v === "all" ? undefined : String(v) })}
          >
            <SelectItem value="all">ทุกสถานะ</SelectItem>
            {config.statusOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </FilterSelect>
        )}

        {config.year && (
          // The value stays CE because that is what the dates in the database are; only the
          // label is พ.ศ. Showing ค.ศ. here was the one place in the app that did — every
          // date beside it renders through TH_DATE as พ.ศ.
          <FilterSelect
            icon={CalendarRange}
            value={values.year ?? String(currentYear)}
            placeholder="ปี"
            selectedLabel={`พ.ศ. ${Number(values.year ?? currentYear) + 543}`}
            onValueChange={(v) => onChange({ ...values, year: String(v) })}
          >
            {years.map((y) => (
              <SelectItem key={y} value={y}>{`พ.ศ. ${Number(y) + 543}`}</SelectItem>
            ))}
          </FilterSelect>
        )}

        {config.maintenanceType && (
          <FilterSelect
            icon={Wrench}
            value={values.maintenanceType ?? "all"}
            placeholder="ประเภท"
            selectedLabel={
              values.maintenanceType === "PREVENTIVE" ? "ตรวจบำรุง (Preventive)"
              : values.maintenanceType === "CORRECTIVE" ? "ซ่อมแซม (Corrective)"
              : undefined
            }
            onValueChange={(v) => onChange({ ...values, maintenanceType: v === "all" ? undefined : String(v) })}
          >
            <SelectItem value="all">ทุกประเภท</SelectItem>
            <SelectItem value="PREVENTIVE">ตรวจบำรุง (Preventive)</SelectItem>
            <SelectItem value="CORRECTIVE">ซ่อมแซม (Corrective)</SelectItem>
          </FilterSelect>
        )}

        {/* Actions (export) + reset — full width & evenly split on mobile, pushed right on desktop.
            มี leading เมื่อไร export ย้ายขึ้นไปอยู่แถวบนกับ chip แล้ว เหลือแค่ปุ่มล้างตัวกรอง */}
        <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:items-center">
          {!leading && actions}
          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange({})}
              className="h-8 w-full text-primary hover:text-primary hover:bg-primary/10 sm:w-auto"
            >
              <X className="size-3.5" />
              ล้างตัวกรอง
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
