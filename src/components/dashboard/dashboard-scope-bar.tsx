"use client";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getPublicCategories } from "@/lib/api";
import { useAsync, useDashboardRefreshNonce } from "@/hooks/use-async";
import type { DashboardScope } from "@/lib/dashboard-scope";
import type { DispenseKind } from "@/lib/dispense-kind";
import type { DispenseType } from "@/generated/prisma/enums";

// Base UI Select has no "empty" value, so the unfiltered choice needs a sentinel rather
// than "" — it is translated back to undefined on the way into the scope.
const ALL = "all";

// Client-safe mirror of kindDispenseTypes: lib/dispense-kind-where is server-only (it pulls
// the Prisma runtime), and a bare mapping is all the picker needs. consume owns CONSUMABLE;
// ยืม and นำไปใช้งาน share the two durable types — loanType, not dispenseType, splits them.
const KIND_TYPES: Record<DispenseKind, DispenseType[]> = {
  consume: ["CONSUMABLE"],
  borrow: ["COUNT", "ITEM"],
  inuse: ["COUNT", "ITEM"],
};

// ประเภท (CategoryProfile) → หมวดย่อย (CategoryType), both narrowed to the tab's kind. One
// /api/categories fetch carries both levels: every category names its profile, so the profile
// list is just the distinct profiles of the categories in view.
//
// ประเภทโผล่ที่นี่ได้เพราะหมวดย่อยตัวใดตัวหนึ่งของมันอ้างถึง — ทุกประเภทจึงมีตัวตั้งต้นติดมา
// หนึ่งตัวเสมอตั้งแต่ตอนสร้าง (ดู POST /api/settings/profiles). ประเภทที่ศูนย์หมวดย่อยคือของเก่า
// ก่อนกติกานั้น และรับพัสดุไม่ได้อยู่แล้ว
export function DashboardScopeBar({
  kind, profileId, categoryId, onChange,
}: {
  kind: DispenseKind;
  profileId?: string;
  categoryId?: string;
  onChange: (next: Omit<DashboardScope, "kind">) => void;
}) {
  const nonce = useDashboardRefreshNonce();
  // Fold in the dashboard refresh nonce so the รีเฟรช button pulls a newly added ประเภท
  // without a full page reload.
  const { data: cats = [] } = useAsync(() => getPublicCategories(), [nonce]);

  const types = KIND_TYPES[kind];
  const inType = cats.filter((c) => c.profile != null && types.includes(c.profile.dispenseType));
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
