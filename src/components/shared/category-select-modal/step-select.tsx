"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Check, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getCategories } from "@/lib/api";
import type { CategoryOption } from "@/lib/api";
import { profileIcon } from "@/lib/profile-icons";

interface StepSelectProps {
  /** Currently selected category (if user went back from Step 2a) */
  selectedId: string | null;
  onSelectExisting: (cat: CategoryOption) => void;
  onSelectCreateNew: () => void;
  /** Only show categories whose profile id is in this list. If omitted, show all. */
  allowedProfileIds?: string[];
  /** Only show categories whose profile has this dispenseType. If omitted, show all. */
  allowedDispenseType?: "CONSUMABLE" | "COUNT" | "ITEM";
}

export function StepSelect({ selectedId, onSelectExisting, onSelectCreateNew, allowedProfileIds, allowedDispenseType }: StepSelectProps) {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCategories();
      setCategories(data);
    } catch {
      // parent handles toast
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const filtered = categories
    .filter((c) => !allowedProfileIds || (c.profile?.id && allowedProfileIds.includes(c.profile.id)))
    .filter((c) => !allowedDispenseType || c.profile?.dispenseType === allowedDispenseType)
    .filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="ค้นหาหมวดหมู่..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-card"
        />
      </div>

      {/* Category cards */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 && !search ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Tag className="h-8 w-8 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium text-foreground">ยังไม่มีหมวดหมู่</p>
            <p className="text-xs text-muted-foreground mt-0.5">สร้างหมวดหมู่แรกเพื่อจัดกลุ่มพัสดุ</p>
          </div>
          <button
            type="button"
            onClick={onSelectCreateNew}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10"
          >
            <Plus className="h-3.5 w-3.5" />
            สร้างหมวดหมู่
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Existing categories */}
          {filtered.map((cat) => {
            const Icon = profileIcon(cat.profile?.icon);
            const active = selectedId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectExisting(cat)}
                className={cn(
                  "group flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all",
                  active
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card hover:border-primary/40 hover:bg-primary/[0.02]",
                )}
              >
                {/* Icon */}
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground group-hover:bg-accent group-hover:text-accent-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {cat.name}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] px-1.5 py-0", cat.profile?.color ?? "")}
                    >
                      {cat.profile?.name ?? "—"}
                    </Badge>
                    {cat._count != null && (
                      <span className="text-xs text-muted-foreground">
                        {cat._count.items} รายการ
                      </span>
                    )}
                  </div>
                  {cat.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{cat.description}</p>
                  )}
                </div>

                {/* Check indicator */}
                <div
                  className={cn(
                    "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border",
                  )}
                >
                  {active && <Check className="h-3 w-3" />}
                </div>
              </button>
            );
          })}

          {/* No results for search */}
          {filtered.length === 0 && search && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              ไม่พบหมวดหมู่ที่ตรงกับ &ldquo;{search}&rdquo;
            </p>
          )}

          {/* Create new — always visible when categories exist */}
          <div className="pt-2">
            <div className="border-t border-dashed border-border" />
            <button
              type="button"
              onClick={onSelectCreateNew}
              className="group mt-2 flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-primary/30 p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/[0.02]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">สร้างหมวดหมู่ใหม่</div>
                <div className="text-xs text-muted-foreground">ไม่เจอที่ต้องการ? ตั้งชื่อเอง</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
