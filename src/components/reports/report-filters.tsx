"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { USAGE_TYPE_OPTIONS } from "@/lib/constants";

export interface FilterValues {
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  locationId?: string;
  staffId?: string;
  usageType?: string;
  itemId?: string;
  status?: string;
  year?: string;
  maintenanceType?: string;
}

export interface FilterConfig {
  dateRange?: boolean;
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
}

interface Option {
  id: string;
  name: string;
  code?: string;
}

export function ReportFilters({ config, values, onChange }: ReportFiltersProps) {
  const [categories, setCategories] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [staff, setStaff] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]); // kept for compat but unused

  useEffect(() => {
    if (config.categories) {
      fetch("/api/categories")
        .then((r) => r.json())
        .then((data) => setCategories(data))
        .catch(() => {});
    }
    if (config.locations) {
      fetch("/api/locations")
        .then((r) => r.json())
        .then((data) => setLocations(data))
        .catch(() => {});
    }
    if (config.staff) {
      fetch("/api/users")
        .then((r) => r.json())
        .then((data) => setStaff(data))
        .catch(() => {});
    }
    // usageTypes is static, no fetch needed
  }, [config.categories, config.locations, config.staff]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  return (
    <div className="flex flex-wrap items-end gap-3 mb-4">
      {config.dateRange && (
        <>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">From</label>
            <Input
              type="date"
              value={values.dateFrom ?? ""}
              onChange={(e) => onChange({ ...values, dateFrom: e.target.value || undefined })}
              className="h-9 w-36"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <Input
              type="date"
              value={values.dateTo ?? ""}
              onChange={(e) => onChange({ ...values, dateTo: e.target.value || undefined })}
              className="h-9 w-36"
            />
          </div>
        </>
      )}

      {config.categories && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Category</label>
          <Select
            value={values.categoryId ?? "all"}
            onValueChange={(v) =>
              onChange({ ...values, categoryId: v === "all" ? undefined : String(v) })
            }
          >
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {config.locations && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Location</label>
          <Select
            value={values.locationId ?? "all"}
            onValueChange={(v) =>
              onChange({ ...values, locationId: v === "all" ? undefined : String(v) })
            }
          >
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {config.staff && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Staff</label>
          <Select
            value={values.staffId ?? "all"}
            onValueChange={(v) =>
              onChange({ ...values, staffId: v === "all" ? undefined : String(v) })
            }
          >
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {config.usageTypes && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Usage Type</label>
          <Select
            value={values.usageType ?? "all"}
            onValueChange={(v) =>
              onChange({ ...values, usageType: v === "all" ? undefined : String(v) })
            }
          >
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {USAGE_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {config.statusOptions && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <Select
            value={values.status ?? "all"}
            onValueChange={(v) =>
              onChange({ ...values, status: v === "all" ? undefined : String(v) })
            }
          >
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {config.statusOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {config.year && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Year</label>
          <Select
            value={values.year ?? String(currentYear)}
            onValueChange={(v) => onChange({ ...values, year: String(v) })}
          >
            <SelectTrigger className="h-9 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {config.maintenanceType && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Type</label>
          <Select
            value={values.maintenanceType ?? "all"}
            onValueChange={(v) =>
              onChange({ ...values, maintenanceType: v === "all" ? undefined : String(v) })
            }
          >
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="PREVENTIVE">Preventive</SelectItem>
              <SelectItem value="CORRECTIVE">Corrective</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="h-9"
        onClick={() => onChange({})}
      >
        <Search className="h-3.5 w-3.5 mr-1" />
        Reset
      </Button>
    </div>
  );
}
