"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DatePicker, parseISODate, thaiDate } from "@/components/ui/date-picker";
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
  Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-is-mobile";
import {
  Activity, ListChecks, CalendarRange, X, Search, SlidersHorizontal, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { USAGE_TYPE_LABELS } from "@/lib/constants";
import { fmtDate, TH_DATE } from "@/lib/format";
import {
  getPublicCategories, getPublicLocations, getProfiles,
} from "@/lib/api";
import type { CategoryOption, LocationOption, ProfileOption } from "@/lib/api";
import {
  CategoryPicker, LocationPicker, formatLocation, type LocationFilter,
} from "@/components/shared/filter-pickers";

export interface FilterValues {
  dateFrom?: string;
  dateTo?: string;
  profileId?: string;
  categoryId?: string;
  /** cascade อาคาร/ชั้น/ห้อง/จุด — ชุดเดียวกับหน้ารายการพัสดุ ไม่ใช่ id ของ location เดี่ยว */
  location?: LocationFilter;
  /** ชื่อคนที่กดบันทึกรายการ — contains-match ไม่ใช่ id. ตาราง users โตตามจำนวน นศ. ที่เคย
   *  ยืมเอง (หลักพัน) ดรอปดาวน์รายชื่อจึงโหลดทั้งก้อนมานั่งรอไม่ไหว */
  staff?: string;
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
  from?: string; // status-log previousStatus (export only — not rendered)
  to?: string;   // status-log newStatus (export only — not rendered)
}

export interface FilterConfig {
  dateRange?: boolean;
  /** ปุ่มลัดเลือกทั้งปี — เขียนทับ dateFrom/dateTo เป็น 1 ม.ค.–31 ธ.ค. ของปีที่เลือก.
   *  ไม่ใช่ตัวกรอง `year` (ค่าแยกของค่าใช้จ่ายรายปี) — อันนี้เป็นแค่มือที่กรอก date picker ให้ */
  yearQuick?: boolean;
  /** ปุ่ม cascade ประเภท → หมวดย่อย (ปุ่มเดียว สองชั้น) */
  categories?: boolean;
  locations?: boolean;
  /** ช่องค้นหาชื่อผู้ดำเนินการ — ค่าที่ใส่คือ placeholder */
  staffSearch?: string;
  /** Free-text เหตุผล box. The placeholder names what can be typed into it — "ค้นหาเหตุผล"
   *  alone hides that a รหัสวิชา matches too, and รหัสวิชา is what people search by. */
  recipientSearch?: string;
  usageTypes?: boolean;
  statusOptions?: { value: string; label: string }[];
  year?: boolean;
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
  /** ตัวแรกในแถวบนสุด — ที่ของ chip เลือก segment. มันคือตัวกรองอย่างหนึ่งเหมือนกัน
   *  การปล่อยให้ลอยอยู่นอกการ์ดทำให้อ่านเป็นหัวเรื่องที่ไม่มีบ้าน */
  leading?: ReactNode;
  /** ทับกรอบการ์ดของตัวเอง เวลาถูกวางอยู่ในการ์ดใบใหญ่แล้ว */
  className?: string;
}

/** ทรงของ select ตอนนั่งเรียงในแถว: สูงเท่าชิปอื่น กว้างพอให้ป้ายไทยไม่ถูกตัด */
const selectInlineCls = "h-8 w-auto min-w-[8.5rem]";

/** location เป็น object: ว่าง = ไม่ได้กรอง. ใช้ทั้งตัวนับและตอนตัดสินใจว่าจะเก็บค่าลง state มั้ย */
function locActive(loc?: LocationFilter): boolean {
  return !!(loc && (loc.building || loc.floor || loc.room || loc.detail));
}

const th = (iso?: string) => (iso ? thaiDate(parseISODate(iso)) : null);

/** "1 ม.ค. 2569 – 31 ธ.ค. 2569" — ป้ายบนปุ่มช่วงวันที่ และบนชิปสรุป */
function rangeLabel(values: FilterValues): string {
  const from = th(values.dateFrom);
  const to = th(values.dateTo);
  if (from && to) return `${from} – ${to}`;
  if (from) return `ตั้งแต่ ${from}`;
  if (to) return `ถึง ${to}`;
  return "ทุกช่วงเวลา";
}

function FilterSelect({
  icon: Icon,
  value,
  placeholder,
  onValueChange,
  selectedLabel,
  className,
  children,
}: {
  icon: LucideIcon;
  value: string;
  placeholder: string;
  onValueChange: (v: string) => void;
  selectedLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v ?? "")}>
      <SelectTrigger className={cn("w-full gap-2 rounded-full border-border bg-background", className)}>
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
  className,
}: {
  value: string;
  placeholder: string;
  onCommit: (v: string) => void;
  className?: string;
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
    <div className={cn("relative w-full min-w-0", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 rounded-full border-border bg-background pl-8 text-sm"
      />
    </div>
  );
}

/** ช่วงวันที่ยุบเหลือปุ่มเดียวที่อ่านออกว่ากรองช่วงไหนอยู่ — สองช่องเรียงกันกับคำว่า "ถึง"
 *  กินความกว้างครึ่งแถวเพื่อบอกเรื่องเดียว และบนมือถือต้องซ้อนกันสามบรรทัด */
function DateRangeButton({
  values,
  onChange,
  years,
  quick,
}: {
  values: FilterValues;
  onChange: (v: FilterValues) => void;
  years: string[];
  quick: boolean;
}) {
  const picked = !!(values.dateFrom || values.dateTo);
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-full justify-start gap-2 rounded-full font-normal sm:w-auto"
          />
        }
      >
        <CalendarRange className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !picked && "text-muted-foreground")}>
          {rangeLabel(values)}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        {quick && (
          <div className="flex flex-wrap gap-1.5">
            {years.map((y) => {
              const on = values.dateFrom === `${y}-01-01` && values.dateTo === `${y}-12-31`;
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => onChange({ ...values, dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` })}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {`พ.ศ. ${Number(y) + 543}`}
                </button>
              );
            })}
          </div>
        )}
        <FieldLabel label="จากวันที่">
          <DatePicker
            value={values.dateFrom ?? ""}
            onChange={(v) => onChange({ ...values, dateFrom: v || undefined })}
            placeholder="จากวันที่"
            className="h-8 rounded-md"
          />
        </FieldLabel>
        <FieldLabel label="ถึงวันที่">
          <DatePicker
            value={values.dateTo ?? ""}
            onChange={(v) => onChange({ ...values, dateTo: v || undefined })}
            placeholder="ถึงวันที่"
            className="h-8 rounded-md"
          />
        </FieldLabel>
        {picked && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 self-end text-primary hover:bg-primary/10 hover:text-primary"
            onClick={() => onChange({ ...values, dateFrom: undefined, dateTo: undefined })}
          >
            ล้างช่วงวันที่
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/** ตัวกรองที่เปิดอยู่หนึ่งตัว — ป้ายที่อ่านรู้เรื่องบวกวิธีเอาออก */
interface Chip {
  key: string;
  label: string;
  clear: () => void;
}

export function ReportFilters({ config, values, onChange, actions, leading, className }: ReportFiltersProps) {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  // 639 ไม่ใช่ 767 ของ useIsMobile: การ์ดนี้สลับเป็นแถวเดียวที่ `sm:` — จุดที่ตัวกรองเลิกซ้อนกัน
  // คือจุดเดียวกับที่แผ่นเลื่อนเลิกคุ้มกว่า popover
  const isMobile = useIsMobile(639);

  useEffect(() => {
    // ปุ่มหมวดหมู่เป็น cascade ประเภท → หมวดย่อย จึงต้องมีทั้งสองชุดเสมอ ไม่ใช่แค่หมวดย่อย
    if (config.categories) {
      getPublicCategories().then(setCategories).catch(() => {});
      getProfiles()
        .then((data) => setProfiles([...data].sort((a, b) => a.sortOrder - b.sortOrder)))
        .catch(() => {});
    }
    if (config.locations) {
      getPublicLocations().then(setLocations).catch(() => {});
    }
  }, [config.categories, config.locations]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  // แถวหลักถือแค่สองอย่างที่คนแตะทุกครั้ง: ช่วงเวลา กับช่องค้นหา. เหตุผล/วิชา มาก่อนชื่อผู้ดำเนินการ
  // เพราะเป็นตัวที่คนพิมพ์หาจริง — ตัวที่เหลือลงไปอยู่หลังปุ่ม "ตัวกรอง"
  const primarySearch = config.recipientSearch
    ? ({ key: "recipient", placeholder: config.recipientSearch } as const)
    : config.staffSearch
      ? ({ key: "staff", placeholder: config.staffSearch } as const)
      : null;

  const dateActive = config.dateRange || config.yearQuick;

  // ── ตัวกรองชั้นสอง ──────────────────────────────────────────────────────
  // ชุดเดียว วาดสองทรง: `inline` = ชิปเรียงต่อในแถวบนจอกว้างที่ยังมีที่เหลือ,
  // ไม่ inline = ช่องเต็มความกว้างพร้อมป้ายกำกับ ในแผ่นเลื่อนบนมือถือ
  const secondary = (inline: boolean) => {
    const wrap = (label: string, node: ReactNode) =>
      inline ? node : <FieldLabel label={label}>{node}</FieldLabel>;
    return (
    <>
      {config.categories && wrap("ประเภท / หมวดหมู่",
        <CategoryPicker
          className={cn("h-8 rounded-full", !inline && "w-full")}
          profiles={profiles}
          categories={categories}
          value={{ profileId: values.profileId ?? "", categoryId: values.categoryId ?? null }}
          onChange={({ profileId, categoryId }) =>
            onChange({ ...values, profileId: profileId || undefined, categoryId: categoryId ?? undefined })
          }
        />,
      )}

      {config.locations && wrap("สถานที่",
        <LocationPicker
          className={cn("h-8 rounded-full", !inline && "w-full")}
          locations={locations}
          value={values.location ?? {}}
          onChange={(loc) => onChange({ ...values, location: locActive(loc) ? loc : undefined })}
        />,
      )}

      {config.staffSearch && primarySearch?.key !== "staff" && wrap("ผู้ดำเนินการ",
        <FilterSearch
          value={values.staff ?? ""}
          placeholder={config.staffSearch}
          onCommit={(v) => onChange({ ...values, staff: v.trim() || undefined })}
          className={cn(inline && "w-48")}
        />,
      )}

      {config.usageTypes && wrap("ประเภทการใช้งาน",
        <FilterSelect
          icon={Activity}
          value={values.usageType ?? "all"}
          placeholder="ทุกประเภท"
          selectedLabel={values.usageType ? USAGE_TYPE_LABELS[values.usageType] : undefined}
          onValueChange={(v) => onChange({ ...values, usageType: v === "all" ? undefined : String(v) })}
          className={cn(inline && selectInlineCls)}
        >
          <SelectItem value="all">ทุกประเภท</SelectItem>
          {/* LABELS, not OPTIONS: a filter has to reach every value the data holds,
              including OTHER, which is retired from the เบิก form but still sits in
              old records (and is still written by api/items/[id]/recover). */}
          {Object.entries(USAGE_TYPE_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>{label}</SelectItem>
          ))}
        </FilterSelect>,
      )}

      {config.statusOptions && wrap("สถานะ",
        <FilterSelect
          icon={ListChecks}
          value={values.status ?? "all"}
          placeholder="ทุกสถานะ"
          selectedLabel={values.status ? config.statusOptions?.find((o) => o.value === values.status)?.label : undefined}
          onValueChange={(v) => onChange({ ...values, status: v === "all" ? undefined : String(v) })}
          className={cn(inline && selectInlineCls)}
        >
          <SelectItem value="all">ทุกสถานะ</SelectItem>
          {config.statusOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </FilterSelect>,
      )}
      </>
    );
  };

  const hasSecondary = !!(
    config.categories || config.locations || config.usageTypes || config.statusOptions ||
    (config.staffSearch && primarySearch?.key !== "staff")
  );

  // ชิปแถวล่างพูดแทนตัวกรองที่ถูกซ่อนอยู่หลังปุ่มเท่านั้น — ช่วงวันที่กับช่องค้นหาอ่านค่าตัวเอง
  // ได้อยู่แล้วบนแถวหลัก การทำชิปซ้ำอีกใบคือความรกที่เพิ่งย้ายที่
  const chips: Chip[] = [];
  if (values.profileId) {
    const name = profiles.find((p) => p.id === values.profileId)?.name;
    chips.push({
      key: "profile",
      label: `ประเภท: ${name ?? values.profileId}`,
      // หมวดย่อยเป็นลูกของประเภท — ปล่อยไว้ลอยๆ จะกรองด้วยค่าที่ไม่มีปุ่มไหนแสดงอยู่
      clear: () => onChange({ ...values, profileId: undefined, categoryId: undefined }),
    });
  }
  if (values.categoryId) {
    const name = categories.find((c) => c.id === values.categoryId)?.name;
    chips.push({
      key: "category",
      label: `หมวดหมู่: ${name ?? values.categoryId}`,
      clear: () => onChange({ ...values, categoryId: undefined }),
    });
  }
  if (values.location && locActive(values.location)) {
    chips.push({
      key: "location",
      label: `สถานที่: ${formatLocation(values.location) ?? ""}`,
      clear: () => onChange({ ...values, location: undefined }),
    });
  }
  if (values.staff && primarySearch?.key !== "staff") {
    chips.push({
      key: "staff",
      label: `ผู้ดำเนินการ: ${values.staff}`,
      clear: () => onChange({ ...values, staff: undefined }),
    });
  }
  if (config.usageTypes && values.usageType) {
    chips.push({
      key: "usageType",
      label: USAGE_TYPE_LABELS[values.usageType] ?? values.usageType,
      clear: () => onChange({ ...values, usageType: undefined }),
    });
  }
  if (config.statusOptions && values.status) {
    const label = config.statusOptions.find((o) => o.value === values.status)?.label;
    chips.push({
      key: "status",
      label: label ?? values.status,
      clear: () => onChange({ ...values, status: undefined }),
    });
  }

  // นับเฉพาะตัวกรองที่มองเห็นอยู่จริง — segment ที่ไม่มีช่องวันที่ (ภาพนิ่ง) ยังถือค่าวันที่ของ
  // segment ก่อนหน้าไว้ใน state และจะทำให้ปุ่ม "ล้างทั้งหมด" โผล่มาโดยไม่มีอะไรบนจอให้ล้าง
  const activeCount =
    chips.length +
    [
      dateActive ? values.dateFrom : undefined, dateActive ? values.dateTo : undefined,
      primarySearch ? values[primarySearch.key] : undefined,
      values.year && values.year !== String(currentYear) ? values.year : undefined,
    ].filter(Boolean).length;

  const panelBtnCls = "h-8 shrink-0 gap-2 rounded-full";
  const panelLabel = (
    <>
      <SlidersHorizontal className="size-4 text-muted-foreground" />
      ตัวกรอง
      {chips.length > 0 && (
        <span className="inline-flex size-4.5 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">
          {chips.length}
        </span>
      )}
    </>
  );

  return (
    <div
      data-testid="report-filters"
      className={cn("flex flex-col gap-2 rounded-2xl border border-border/60 bg-card p-3 sm:p-4", className)}
    >
      {/* แถวบน: ตัวเลือก segment กับปุ่มส่งออก — สองอย่างที่ไม่ใช่ "ค่าที่กรอง" แต่เป็นตัวเลือกว่า
          กำลังดูรายงานอะไร และจะเอาออกไปยังไง */}
      {(leading || actions) && (
        <div className="flex items-center gap-2">
          {/* flex-1 ไม่ใช่ w-fit: รางกินที่ที่เหลือทั้งแถว โดยยังนั่งบรรทัดเดียวกับปุ่มส่งออกทุกความกว้าง
              — รางเองมี overflow-x-auto อยู่แล้ว จอแคบจึงเลื่อนแทนที่จะหักปุ่มลงบรรทัดใหม่ */}
          {leading && <div className="min-w-0 flex-1">{leading}</div>}
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}

      {/* แถวหลัก: ช่วงเวลา + ค้นหา + ปุ่มตัวกรองที่เหลือ. บนมือถือช่วงเวลาขึ้นบรรทัดของตัวเอง
          เพราะวันที่เต็มรูปแบบสองตัวไม่พอดีครึ่งจอ 375px */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {config.year ? (
          <div className="w-full sm:w-44">
            {/* The value stays CE because that is what the dates in the database are; only the
                label is พ.ศ. Showing ค.ศ. here was the one place in the app that did — every
                date beside it renders through TH_DATE as พ.ศ. */}
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
          </div>
        ) : dateActive ? (
          <DateRangeButton
            values={values}
            onChange={onChange}
            years={years}
            quick={!!config.yearQuick}
          />
        ) : null}

        {primarySearch && (
          <div className="min-w-0 flex-1 sm:min-w-[11rem]">
            <FilterSearch
              value={values[primarySearch.key] ?? ""}
              placeholder={primarySearch.placeholder}
              onCommit={(v) => onChange({ ...values, [primarySearch.key]: v.trim() || undefined })}
            />
          </div>
        )}

        {/* จอกว้างยังมีที่เหลือทั้งแถว — กางตัวกรองที่เหลือไว้เลย ไม่ต้องซ่อนหลังปุ่มให้ต้องกดหา.
            ยุบเป็นปุ่มเดียว + แผ่นเลื่อน เฉพาะตอนที่ที่หมดจริงคือบนมือถือ */}
        {hasSecondary &&
          (isMobile ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className={panelBtnCls}
                onClick={() => setPanelOpen(true)}
              >
                {panelLabel}
              </Button>
              <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
                <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl">
                  <SheetHeader className="pb-0">
                    <SheetTitle>ตัวกรอง</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-3 overflow-y-auto px-4">{secondary(false)}</div>
                  <SheetFooter className="flex-row gap-2">
                    <Button
                      variant="outline"
                      onClick={() => onChange({})}
                      disabled={activeCount === 0}
                      className="flex-1 rounded-full"
                    >
                      ล้างทั้งหมด
                    </Button>
                    <Button onClick={() => setPanelOpen(false)} className="flex-1 rounded-full">
                      ดูผลลัพธ์
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            </>
          ) : (
            secondary(true)
          ))}

        {/* ล้างตัวกรองท้ายแถว ไม่ใช่ในแถบสรุป — บนจอกว้างค่าที่กรองอยู่อ่านได้จากตัวช่องเองแล้ว */}
        {!isMobile && activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({})}
            className="h-8 shrink-0 rounded-full px-2 text-primary hover:bg-primary/10 hover:text-primary"
          >
            ล้างทั้งหมด
          </Button>
        )}
      </div>

      {/* แถวสรุป: บอกว่าอะไรถูกกรองอยู่บ้างโดยไม่ต้องเปิดแผ่นตัวกรองดู — มีเฉพาะตอนที่ตัวกรอง
          ถูกซ่อนอยู่จริง ไม่งั้นเป็นการพูดซ้ำสิ่งที่ช่องข้างบนบอกอยู่แล้ว */}
      {isMobile && chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
          {chips.length > 0 && <span className="text-xs text-muted-foreground">กำลังกรอง:</span>}
          {chips.map((c) => (
            <span
              key={c.key}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground"
            >
              {c.label}
              <button
                type="button"
                onClick={c.clear}
                aria-label={`ลบตัวกรอง ${c.label}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-primary/15 hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChange({})}
            className="ml-auto text-xs font-medium text-primary hover:underline"
          >
            ล้างทั้งหมด
          </button>
        </div>
      )}
    </div>
  );
}
