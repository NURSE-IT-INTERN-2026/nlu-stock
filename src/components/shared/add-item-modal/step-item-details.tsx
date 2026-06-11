"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, Sparkles, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CATEGORY_COLORS } from "@/lib/constants";
import { searchDispenseItems } from "@/lib/api";
import { useDebounce } from "@/hooks/use-debounce";
import type { UsageType } from "./types";
import { USAGE_OPTIONS } from "./types";

interface SimilarItem {
  id: string;
  code: string;
  name: string;
  category: { name: string; category: string };
}

interface StepItemDetailsProps {
  name: string;
  onNameChange: (name: string) => void;
  usageType: UsageType | null;
  onUsageTypeChange: (type: UsageType) => void;
}

export function StepItemDetails({
  name,
  onNameChange,
  usageType,
  onUsageTypeChange,
}: StepItemDetailsProps) {
  const [similar, setSimilar] = useState<SimilarItem[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const debouncedName = useDebounce(name, 300);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) { setSimilar([]); return; }
    setSimilarLoading(true);
    try {
      const data = await searchDispenseItems({ q, limit: "5" });
      const items = (data.items ?? []) as SimilarItem[];
      // Filter out exact match
      setSimilar(items.filter((r) => r.name.toLowerCase() !== q.toLowerCase()));
    } catch {
      setSimilar([]);
    }
    setSimilarLoading(false);
  }, []);

  useEffect(() => { doSearch(debouncedName); }, [debouncedName, doSearch]);

  return (
    <div className="space-y-6">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="item-name">ชื่อพัสดุ</Label>
        <Input
          id="item-name"
          placeholder="เช่น ปากกาลูกลื่น, สว่านไฟฟ้า"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="bg-card"
          autoFocus
        />
      </div>

      {/* Inline similar items */}
      {name.trim().length >= 2 && (
        <div className="space-y-2">
          {similarLoading ? (
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-3 w-40" />
            </div>
          ) : similar.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                <Sparkles className="h-3 w-3" />
                พบพัสดุที่ชื่อคล้ายกัน — เป็นของเดิมหรือเปล่า?
              </div>
              <div className="space-y-1.5">
                {similar.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                  >
                    <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 font-medium text-foreground">{item.name}</span>
                    <span className="text-xs text-muted-foreground">{item.code}</span>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] px-1.5 py-0", CATEGORY_COLORS[item.category?.category as keyof typeof CATEGORY_COLORS] ?? "")}
                    >
                      {item.category?.name}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Usage type picker */}
      <div className="space-y-3">
        <div>
          <Label>ของชิ้นนี้ใช้งานยังไง?</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            เลือกรูปแบบการใช้งานเพื่อกำหนดวิธีติดตามสต็อก
          </p>
        </div>
        <div className="grid gap-2">
          {USAGE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = usageType === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onUsageTypeChange(opt.id)}
                className={cn(
                  "group flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
                  active
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card hover:border-primary/40 hover:bg-primary/[0.02]",
                )}
              >
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
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">{opt.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{opt.desc}</div>
                </div>
                <div
                  className={cn(
                    "mt-1 flex h-4 w-4 items-center justify-center rounded-full border transition-colors",
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
        </div>
      </div>
    </div>
  );
}
