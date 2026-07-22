"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Creatable combobox: styled Input with a dropdown of existing options that
 * also accepts a brand-new typed value. No cmdk dependency.
 */
export function Combobox({ value, onChange, options, placeholder, className, id }: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  const isNew = q !== "" && !options.some((o) => o.toLowerCase() === q);

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { window.setTimeout(() => setOpen(false), 120); }}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && (filtered.length > 0 || isNew) && (
        <div className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-border bg-card p-1 shadow-md">
          {filtered.map((o) => (
            <button
              type="button"
              key={o}
              onMouseDown={(e) => { e.preventDefault(); onChange(o); setOpen(false); }}
              className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted", value === o && "bg-primary/5")}
            >
              <span className="truncate">{o}</span>
              {value === o && <Check className="size-3.5 shrink-0 text-primary" />}
            </button>
          ))}
          {isNew && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(value.trim()); setOpen(false); }}
              className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm text-primary hover:bg-primary/5"
            >
              <Plus className="size-3.5 shrink-0" /> เพิ่ม “{value.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
