"use client";

import type { ComponentProps } from "react";
import { useState } from "react";
import { ChevronDown, Search, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PROFILE_ICON_OPTIONS, PROFILE_COLOR_OPTIONS, profileIcon } from "@/lib/profile-icons";

interface IconColorPickerProps {
  icon: string;
  color: string;
  onIconChange: (icon: string) => void;
  onColorChange: (color: string) => void;
}

export function IconColorPicker({ icon, color, onIconChange, onColorChange }: IconColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const Current = profileIcon(icon);
  const colorLabel = PROFILE_COLOR_OPTIONS.find((c) => c.value === color)?.label ?? "";
  const filtered = PROFILE_ICON_OPTIONS.filter((o) =>
    o.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props: ComponentProps<"button">) => (
          <button
            {...props}
            type="button"
            className="flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            {/* Live preview: same rendering as the table/sidebar chip */}
            <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", color)}>
              <Current className="h-4 w-4" />
            </span>
            <span className="flex-1 truncate text-left text-foreground">
              {colorLabel} · {icon}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        )}
      />
      <PopoverContent align="start" className="w-72 p-3">
        {/* ── Color (theme first) ── */}
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">สี</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {PROFILE_COLOR_OPTIONS.map((c) => {
            const active = c.value === color;
            return (
              <button
                key={c.value}
                type="button"
                title={c.label}
                onClick={() => onColorChange(c.value)}
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-lg ring-2 ring-offset-1 ring-offset-popover transition",
                  active ? "ring-foreground" : "ring-transparent hover:ring-border",
                  c.value,
                )}
              >
                {active && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>

        {/* ── Icon ── */}
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">ไอคอน</p>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาไอคอน..."
            className="h-8 border-0 bg-muted pl-8 text-sm"
          />
        </div>
        <div className="grid max-h-52 grid-cols-6 gap-1 overflow-y-auto">
          {filtered.map((o) => {
            const Icon = profileIcon(o.value);
            const active = o.value === icon;
            return (
              <button
                key={o.value}
                type="button"
                title={o.label}
                onClick={() => {
                  onIconChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "grid aspect-square place-items-center rounded-md border transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-6 py-6 text-center text-xs text-muted-foreground">ไม่พบไอคอน</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
