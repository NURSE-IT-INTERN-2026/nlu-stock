"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { searchItemsAI } from "@/lib/api";
import { useDebounce } from "@/hooks/use-debounce";
import type { UsageType } from "./types";
import type { SimilarItem } from "./types";
import { USAGE_OPTIONS } from "./types";

interface StepItemDetailsProps {
  name: string;
  onNameChange: (name: string) => void;
  usageType: UsageType | null;
  onUsageTypeChange: (type: UsageType) => void;
  onSelectExisting?: (item: SimilarItem) => void;
}

export function StepItemDetails({
  name,
  onNameChange,
  usageType,
  onUsageTypeChange,
  onSelectExisting,
}: StepItemDetailsProps) {
  const [similar, setSimilar] = useState<SimilarItem[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const debouncedName = useDebounce(name, 500);
  const router = useRouter();

  // receive context: select existing. settings context: navigate to item detail.
  const isReceiveMode = !!onSelectExisting;
  const handleConfirm = useCallback((item: SimilarItem) => {
    if (onSelectExisting) {
      onSelectExisting(item);
    } else {
      router.push(`/items/${item.id}`);
    }
  }, [onSelectExisting, router]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) { setSimilar([]); return; }
    setSimilarLoading(true);
    try {
      const data = await searchItemsAI({ q: q.trim(), limit: 5 });
      const items = (data.items ?? []).map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        category: { name: r.categoryName, profile: { dispenseType: r.categoryType as "CONSUMABLE" | "COUNT" | "ITEM" } },
      }));
      setSimilar(items);
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
        <Label htmlFor="item-name">ชื่อพัสดุ <span className="text-destructive">*</span></Label>
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
                พบพัสดุที่ชื่อคล้ายกัน
              </div>
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                {isReceiveMode
                  ? "ถ้าใช่ — กดที่รายการเพื่อเลือกรับเข้าเลย ไม่ต้องสร้างใหม่. ถ้าไม่ใช่ — กรอกข้อมูลด้านล่างต่อไปได้เลย"
                  : "ถ้าใช่ — กดที่รายการเพื่อเปิดดูรายละเอียดพัสดุนี้. ถ้าไม่ใช่ — กรอกข้อมูลด้านล่างต่อไปได้เลย"}
              </p>
              <div className="space-y-1.5">
                {similar.slice(0, 3).map((item) => {
                  const isConfirming = confirmingId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-lg border bg-card text-sm overflow-hidden",
                        isConfirming
                          ? "border-primary"
                          : "border-border cursor-pointer hover:border-primary/50 transition-colors",
                      )}
                      onClick={() => !isConfirming && setConfirmingId(item.id)}
                    >
                      <div className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{item.code}</span>
                          <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {item.category?.name}
                        </Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="flex-1 font-medium text-foreground">{item.name}</span>
                        </div>
                      {isConfirming && (
                        <div className="flex items-center justify-between border-t border-primary/20 bg-primary/5 px-3 py-2">
                          <span className="text-xs text-foreground">
                            {isReceiveMode
                              ? <>ต้องการเพิ่มพัสดุ <strong>{item.name}</strong> ใช่หรือไม่?</>
                              : <>ต้องการตรวจสอบพัสดุใช่หรือไม่?</>}
                          </span>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={(e) => { e.stopPropagation(); setConfirmingId(null); }}
                            >
                              ยกเลิก
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              onClick={(e) => { e.stopPropagation(); handleConfirm(item); }}
                            >
                              ยืนยัน
                            </Button>
                          </div>
                        </div>
                      )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Usage type picker */}
      <div className="space-y-3">
        <div>
          <Label id="usage-group-label">ของชิ้นนี้ใช้งานยังไง? <span className="text-destructive">*</span></Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            เลือกรูปแบบการใช้งานเพื่อกำหนดวิธีติดตามสต็อก
          </p>
        </div>
        <div role="radiogroup" aria-labelledby="usage-group-label" className="grid gap-2">
          {USAGE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = usageType === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => onUsageTypeChange(opt.id)}
                className={cn(
                  "group flex items-start gap-3 rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
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
