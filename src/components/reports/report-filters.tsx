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
  CategoryPicker, LocationPicker, type LocationFilter,
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
  /** ตัวแรกในแถวตัวกรอง — ที่ของ chip เลือก segment. มันคือตัวกรองอย่างหนึ่งเหมือนกัน
   *  การปล่อยให้ลอยอยู่นอกการ์ดทำให้อ่านเป็นหัวเรื่องที่ไม่มีบ้าน */
  leading?: ReactNode;
  /** ทับกรอบการ์ดของตัวเอง เวลาถูกวางอยู่ในการ์ดใบใหญ่แล้ว */
  className?: string;
}

// 150px เดิมเหลือที่ให้ข้อความ 74px แต่ "31 ธ.ค. 2569" กว้าง 87px — วันที่จึงถูกตัดเป็น
// "31 ธ.ค. 2…" ทุกครั้งที่เดือนหรือวันเป็นสองหลัก. 176px เหลือที่ให้ข้อความ 100px ซึ่งพอสำหรับ
// วันที่ยาวที่สุดที่ thaiDate สร้างได้ บวกที่เผื่อไว้เล็กน้อย.
// บนมือถือกว้างเต็มแถว ไม่ใช่ครึ่งแถว: จอ 375px หารสองแล้วเหลือที่ให้ข้อความ 59px ซึ่งตัดวันที่
// ทุกกรณี — สองช่องเรียงกันจึงแสดงเต็มไม่ได้เลย ต้องซ้อนกัน
/** ปุ่ม cascade ของหน้าพัสดุเกิดมา h-9 rounded-lg — แถวตัวกรองรายงานเป็นชิป h-8 rounded-full */
const pickerCls = "h-8 rounded-full";

/** location เป็น object: ว่าง = ไม่ได้กรอง. ใช้ทั้งตัวนับและตอนตัดสินใจว่าจะเก็บค่าลง state มั้ย */
function locActive(loc?: LocationFilter): boolean {
  return !!(loc && (loc.building || loc.floor || loc.room || loc.detail));
}

const dateInputCls = "h-8 w-full min-w-0 sm:w-44 rounded-full border-border bg-background text-sm";

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
      <SelectTrigger className="min-w-[120px] max-w-full flex-1 sm:flex-none gap-2 rounded-full border-border bg-background">
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
        className="h-8 rounded-full border-border bg-background pl-8 text-sm"
      />
    </div>
  );
}

export function ReportFilters({ config, values, onChange, actions, leading, className }: ReportFiltersProps) {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  // 639 ไม่ใช่ 767 ของ useIsMobile: การ์ดนี้สลับเป็นแถวเดียวที่ `sm:` — จุดที่ตัวกรองเลิกซ้อนกัน
  // คือจุดเดียวกับที่ไม่ต้องยุบเป็นปุ่มแล้ว
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

  // นับเฉพาะตัวกรองที่มองเห็นอยู่จริง — segment ที่ไม่มีช่องวันที่ (ภาพนิ่ง) ยังถือค่าวันที่ของ
  // segment ก่อนหน้าไว้ใน state และจะทำให้ปุ่ม "ล้างตัวกรอง" โผล่มาโดยไม่มีอะไรบนจอให้ล้าง
  const dateActive = config.dateRange || config.yearQuick;
  const activeCount = [
    dateActive ? values.dateFrom : undefined, dateActive ? values.dateTo : undefined,
    values.profileId, values.categoryId,
    locActive(values.location), values.staff, values.recipient, values.usageType, values.status,
    values.year && values.year !== String(currentYear) ? values.year : undefined,
  ].filter(Boolean).length;

  // ponytail: ตัวกรองชุดเดียว วาดสองที่ — แถวบนการ์ดบนจอกว้าง, ใน bottom sheet บนมือถือ.
  // ค่าเปลี่ยนทันทีทั้งสองทาง ไม่มี draft state ให้ Apply: ตารางอยู่หลัง sheet อยู่แล้ว
  // ปุ่ม "ดูผลลัพธ์" จึงแค่ปิดแผ่น ไม่ต้องมีสำเนาค่าอีกชุดให้หลุดกัน
  const controls = (
    <>
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

      {config.categories && (
        <CategoryPicker
          className={pickerCls}
          profiles={profiles}
          categories={categories}
          value={{ profileId: values.profileId ?? "", categoryId: values.categoryId ?? null }}
          onChange={({ profileId, categoryId }) =>
            onChange({ ...values, profileId: profileId || undefined, categoryId: categoryId ?? undefined })
          }
        />
      )}

      {config.locations && (
        <LocationPicker
          className={pickerCls}
          locations={locations}
          value={values.location ?? {}}
          onChange={(loc) => onChange({ ...values, location: locActive(loc) ? loc : undefined })}
        />
      )}

      {config.staffSearch && (
        <FilterSearch
          value={values.staff ?? ""}
          placeholder={config.staffSearch}
          onCommit={(v) => onChange({ ...values, staff: v.trim() || undefined })}
        />
      )}

      {config.recipientSearch && (
        <FilterSearch
          value={values.recipient ?? ""}
          placeholder={config.recipientSearch}
          onCommit={(v) => onChange({ ...values, recipient: v.trim() || undefined })}
        />
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
    </>
  );

  // ตัวกรองชั้นสอง: อยู่แค่บางรายงาน และเป็นตัวที่คนเปิดดูเป็นครั้งคราว ไม่ใช่ตัวที่ตั้งไว้ทุกครั้ง
  // อย่างช่วงวันที่/หมวดหมู่/ผู้เบิก. ซ่อนไว้หลังปุ่มเพื่อให้แถวแรกอ่านได้จบบนจอ 1440 โดยไม่ต้องเลื่อน
  const advancedKeys = [
    config.usageTypes ? values.usageType : undefined,
    config.statusOptions ? values.status : undefined,
  ];
  const hasAdvanced = !!(config.usageTypes || config.statusOptions);
  const advancedCount = advancedKeys.filter(Boolean).length;

  const advancedControls = (
    <>
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
              old records (and is still written by api/items/[id]/recover). */}
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
    </>
  );

  return (
    <div data-testid="report-filters" className={cn("rounded-2xl border border-border/60 bg-card p-3 sm:p-4", className)}>
      {/* ตัวกรองเป็นคอลัมน์ที่ยืดหยุ่นทางซ้าย ปุ่ม export เกาะขวาบนคงที่ — ไม่ได้อยู่ในสายเดียวกับ
          ตัวกรอง เพราะพอตัวกรองล้นบรรทัด ปุ่มที่ ml-auto จะโดนดันลงไปนั่งท้ายแถวสองพร้อมช่องโหว่
          กลางแถว. แยกคอลัมน์แล้วตัวกรองขึ้นบรรทัดใหม่ในเขตของตัวเอง ปุ่มไม่ขยับ */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        {/* gap-y เล็กกว่า gap-x: ระยะห่างแนวตั้งบวกกับความสูงว่างในตัวปุ่มเอง แถวที่ขึ้นบรรทัดใหม่
            จึงดูหลุดจากแถวแรกทั้งที่ gap เท่ากัน */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
          {/* basis-full บนมือถือ: ราง segment กับตัวกรองที่เหลือเบียดกันในบรรทัดเดียวแล้วป้ายไทยหด
              จนอ่านไม่ออก — จอกว้างค่อยนั่งแถวเดียวกันแบบพอดีตัว */}
          {leading && <div className="min-w-0 basis-full sm:basis-auto">{leading}</div>}
          {/* บนมือถือตัวกรองทุกช่องกว้างเต็มแถว ซ้อนกันหกบรรทัดกินจอไปครึ่งหนึ่งก่อนถึงข้อมูล —
              ยุบเป็นปุ่มเดียวที่บอกจำนวนตัวกรองที่เปิดอยู่ แล้วเปิดเป็นแผ่นเลื่อนขึ้นมาแทน */}
          {isMobile ? (
            // ปุ่มตัวกรองนั่งแถวเดียวกับ Excel/PDF: ทั้งสามเป็นปุ่มเปิดของอย่างอื่น ไม่ใช่ค่าที่ต้องอ่าน
            <div className="flex w-full items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSheetOpen(true)}
                className="h-8 flex-1 justify-center gap-2 rounded-full"
              >
                <SlidersHorizontal className="size-4" />
                ตัวกรอง
                {activeCount > 0 && (
                  <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">
                    {activeCount}
                  </span>
                )}
              </Button>
              {actions && <div className="flex-[2] [&_button]:rounded-full">{actions}</div>}
            </div>
          ) : (
            <>
              {controls}
              {hasAdvanced && (
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button variant="outline" size="sm" className="h-8 gap-2 rounded-full" />
                    }
                  >
                    <SlidersHorizontal className="size-4 text-muted-foreground" />
                    ตัวกรองเพิ่มเติม
                    {advancedCount > 0 && (
                      <span className="inline-flex size-4.5 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">
                        {advancedCount}
                      </span>
                    )}
                  </PopoverTrigger>
                  {/* บล็อกธรรมดา ไม่ใช่ flex: ช่องพวกนี้มี flex-1 ไว้แบ่งที่ในแถว ซึ่งกลายเป็น
                      "ยืดความสูง" ทันทีที่พ่อเป็น flex-col */}
                  <PopoverContent align="start" className="w-64">
                    <div className="space-y-2.5 [&>*]:w-full">{advancedControls}</div>
                  </PopoverContent>
                </Popover>
              )}
      {/* ล้างตัวกรองอยู่ท้ายแถวตัวกรอง ไม่ใช่ข้างปุ่ม export — มันล้างตัวกรอง ไม่ได้ส่งออกอะไร
          และการนั่งรวมกับ export ทำให้ก้อนขวาบนกว้างจนตัวกรองเหลือที่ไม่พอบรรทัดเดียว */}
      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({})}
          className="h-7 w-full rounded-full text-primary hover:text-primary hover:bg-primary/10 sm:w-auto"
        >
          <X className="size-3.5" />
          ล้างตัวกรอง
        </Button>
      )}
            </>
          )}
        </div>

        {/* ปุ่มในนี้เป็นเม็ดยาทรงเดียวกับ select ทั้งแถว: ExportButtons ถูกใช้นอกหน้ารายงานด้วย
            จึงบังคับทรงจากตรงนี้ที่เดียว ไม่ใช่ไปเปลี่ยนปุ่มให้ทุกที่ */}
        {actions && !isMobile && (
          <div className="shrink-0 sm:ml-2 [&_button]:rounded-full">{actions}</div>
        )}
      </div>

      {isMobile && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl">
            <SheetHeader className="pb-0">
              <SheetTitle>ตัวกรอง</SheetTitle>
            </SheetHeader>
            {/* [&>*]:w-full: ช่องพวกนี้เป็น w-fit/flex-1 ซึ่งแปลว่า "แบ่งที่ในแถว" — พอเรียงเป็น
                คอลัมน์มันจึงหดตามเนื้อหาแทนที่จะเต็มแผ่น */}
            <div className="flex flex-col gap-3 overflow-y-auto px-4 [&>*]:w-full">
              {controls}
              {advancedControls}
            </div>
            <SheetFooter className="flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => onChange({})}
                disabled={activeCount === 0}
                className="flex-1 rounded-full"
              >
                ล้างตัวกรอง
              </Button>
              <Button onClick={() => setSheetOpen(false)} className="flex-1 rounded-full">
                ดูผลลัพธ์
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
