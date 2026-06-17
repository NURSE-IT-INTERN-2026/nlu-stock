"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, Sparkles, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { searchCategories, getProfiles } from "@/lib/api";
import type { CategoryOption, ProfileOption } from "@/lib/api";
import { useDebounce } from "@/hooks/use-debounce";
import { profileIcon } from "@/lib/profile-icons";

interface StepCreateNameProps {
  name: string;
  onNameChange: (name: string) => void;
  profileId: string;
  onProfileChange: (id: string) => void;
  onSelectSimilar: (cat: CategoryOption) => void;
}

export function StepCreateName({
  name,
  onNameChange,
  profileId,
  onProfileChange,
  onSelectSimilar,
}: StepCreateNameProps) {
  const [similar, setSimilar] = useState<CategoryOption[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const debouncedName = useDebounce(name, 300);

  useEffect(() => {
    getProfiles()
      .then((ps) => setProfiles(ps.filter((p) => p.isActive)))
      .catch(() => setProfiles([]));
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSimilar([]); return; }
    setSimilarLoading(true);
    try {
      const results = await searchCategories(q);
      setSimilar(results.filter((r) => r.name.toLowerCase() !== q.toLowerCase()));
    } catch {
      setSimilar([]);
    }
    setSimilarLoading(false);
  }, []);

  useEffect(() => { doSearch(debouncedName); }, [debouncedName, doSearch]);

  return (
    <div className="space-y-6">
      {/* Name input */}
      <div className="space-y-2">
        <Label htmlFor="new-cat-name">ชื่อหมวดหมู่ <span className="text-destructive">*</span></Label>
        <Input
          id="new-cat-name"
          placeholder="เช่น อุปกรณ์ทำความสะอาด"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="bg-card"
          autoFocus
        />
      </div>

      {/* Inline similar categories */}
      {name.trim() && (
        <div className="space-y-2">
          {similarLoading ? (
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-3 w-32" />
            </div>
          ) : similar.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                <Sparkles className="h-3 w-3" />
                พบหมวดหมู่ที่คล้ายกัน — ลองใช้ของเดิม?
              </div>
              <div className="space-y-1.5">
                {similar.slice(0, 3).map((cat) => {
                  const Icon = profileIcon(cat.profile?.icon);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => onSelectSimilar(cat)}
                      className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition hover:border-primary/40 hover:bg-primary/[0.02]"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 font-medium text-foreground">{cat.name}</span>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] px-1.5 py-0", cat.profile?.color ?? "")}
                      >
                        {cat.profile?.name ?? "—"}
                      </Badge>
                      <span className="text-[10px] text-primary whitespace-nowrap">ใช้อันนี้</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Profile picker */}
      <div className="space-y-3">
        <div>
          <Label>ประเภท <span className="text-destructive">*</span></Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            เลือกประเภทหมวดหมู่เพื่อกำหนดวิธีจัดการ
          </p>
        </div>
        {profiles.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Skeleton className="h-3 w-3 rounded-full" /> กำลังโหลดประเภท...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {profiles.map((p) => {
              const Icon = profileIcon(p.icon);
              const active = profileId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onProfileChange(p.id)}
                  className={cn(
                    "group flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all",
                    active
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card hover:border-primary/40 hover:bg-primary/[0.02]",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground group-hover:bg-accent group-hover:text-accent-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground">
                      {p.name}
                    </div>
                  </div>
                  {active && (
                    <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
