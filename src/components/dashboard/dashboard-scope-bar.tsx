"use client";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getPublicCategories } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import type { DashboardScope } from "@/lib/dashboard-scope";
import type { DispenseType } from "@/generated/prisma/enums";

// Base UI Select has no "empty" value, so the unfiltered choice needs a sentinel rather
// than "" — it is translated back to undefined on the way into the scope.
const ALL = "all";

// ประเภท (CategoryProfile) → หมวดย่อย (CategoryType), both narrowed to the tab's
// DispenseType. One /api/categories fetch carries both levels: every category names its
// profile, so the profile list is just the distinct profiles of the categories in view.
//
// ponytail: a profile with zero categories never appears here. It also owns zero items,
// so filtering to it would show an empty dashboard either way.
export function DashboardScopeBar({
  type, profileId, categoryId, onChange,
}: {
  type: DispenseType;
  profileId?: string;
  categoryId?: string;
  onChange: (next: Omit<DashboardScope, "type">) => void;
}) {
  const { data: cats = [] } = useAsync(() => getPublicCategories(), []);

  const inType = cats.filter((c) => c.profile?.dispenseType === type);
  const profiles = [...new Map(inType.map((c) => [c.profile!.id, c.profile!])).values()];
  const subs = profileId ? inType.filter((c) => c.profile!.id === profileId) : inType;

  if (profiles.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={profileId ?? ALL}
        // Switching ประเภท drops the หมวดย่อย: the old one belongs to another profile and
        // would win over it (categoryId is the narrowest level in scopeItemWhere).
        onValueChange={(v) => onChange({ profileId: v === ALL ? undefined : (v as string) })}
      >
        <SelectTrigger className="h-8 w-auto min-w-[140px] bg-card text-sm">
          <SelectValue>{profiles.find((p) => p.id === profileId)?.name ?? "ทุกประเภท"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>ทุกประเภท</SelectItem>
          {profiles.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {subs.length > 1 && (
        <Select
          value={categoryId ?? ALL}
          onValueChange={(v) => onChange({ profileId, categoryId: v === ALL ? undefined : (v as string) })}
        >
          <SelectTrigger className="h-8 w-auto min-w-[140px] bg-card text-sm">
            <SelectValue>{subs.find((c) => c.id === categoryId)?.name ?? "ทุกหมวดย่อย"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>ทุกหมวดย่อย</SelectItem>
            {subs.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
