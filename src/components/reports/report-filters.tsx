"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  CalendarDays, Layers, MapPin, Users, Activity, ListChecks,
  CalendarRange, Wrench, X, Boxes, Package, Beaker, Hammer,
  Building2, Monitor, BookOpen, Puzzle, type LucideIcon,
} from "lucide-react";
import { USAGE_TYPE_OPTIONS } from "@/lib/constants";
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
  usageType?: string;
  status?: string;
  year?: string;
  maintenanceType?: string;
  from?: string; // status-log previousStatus (export only — not rendered)
  to?: string;   // status-log newStatus (export only — not rendered)
}

export interface FilterConfig {
  dateRange?: boolean;
  profiles?: boolean;
  categories?: boolean;
  locations?: boolean;
  staff?: boolean;
  usageTypes?: boolean;
  statusOptions?: { value: string; label: string }[];
  year?: boolean;
  maintenanceType?: boolean;
}

interface ReportFiltersProps {
  config: FilterConfig;
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  actions?: ReactNode;
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

const dateInputCls = "h-8 flex-1 min-w-0 sm:flex-none sm:w-[150px] rounded-lg border-border bg-background text-sm";

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

  const activeCount = [
    values.dateFrom, values.dateTo, values.profileId, values.categoryId,
    values.locationId, values.staffId, values.usageType, values.status,
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
      <div className="flex flex-wrap items-center gap-2">
        {leading}
        {config.dateRange && (
          <div className="flex w-full items-center gap-1.5 sm:w-auto">
            <CalendarDays className="size-4 text-muted-foreground shrink-0" />
            <Input
              type="date"
              value={values.dateFrom ?? ""}
              onChange={(e) => onChange({ ...values, dateFrom: e.target.value || undefined })}
              className={dateInputCls}
              aria-label="จากวันที่"
            />
            <span className="text-xs text-muted-foreground">ถึง</span>
            <Input
              type="date"
              value={values.dateTo ?? ""}
              onChange={(e) => onChange({ ...values, dateTo: e.target.value || undefined })}
              className={dateInputCls}
              aria-label="ถึงวันที่"
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

        {config.usageTypes && (
          <FilterSelect
            icon={Activity}
            value={values.usageType ?? "all"}
            placeholder="ประเภทการใช้งาน"
            selectedLabel={values.usageType ? USAGE_TYPE_OPTIONS.find((o) => o.value === values.usageType)?.label : undefined}
            onValueChange={(v) => onChange({ ...values, usageType: v === "all" ? undefined : String(v) })}
          >
            <SelectItem value="all">ทุกประเภท</SelectItem>
            {USAGE_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
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
          <FilterSelect
            icon={CalendarRange}
            value={values.year ?? String(currentYear)}
            placeholder="ปี"
            selectedLabel={values.year}
            onValueChange={(v) => onChange({ ...values, year: String(v) })}
          >
            {years.map((y) => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
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

        {/* Actions (export) + reset — full width & evenly split on mobile, pushed right on desktop */}
        <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:items-center">
          {actions}
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
