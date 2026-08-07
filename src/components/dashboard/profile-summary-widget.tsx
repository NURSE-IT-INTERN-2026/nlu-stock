"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { profileIcon } from "@/lib/profile-icons";
import { getDashboardProfileSummary } from "@/lib/api";
import { useAsync, useDashboardRefreshNonce } from "@/hooks/use-async";

interface Row {
  profileId: string;
  profileName: string;
  icon: string;
  color: string;
  count: number;
  ok: number;
  low: number;
  out: number;
}

// Stock-status segments: พร้อมใช้ / ใกล้หมด / หมด. Semantic colors, independent of the
// profile's own color (which stays on the icon badge).
const STATUS = [
  { key: "ok", label: "พร้อมใช้", bar: "bg-emerald-500", dot: "bg-emerald-500" },
  { key: "low", label: "ใกล้หมด", bar: "bg-amber-500", dot: "bg-amber-500" },
  { key: "out", label: "หมด", bar: "bg-red-500", dot: "bg-red-500" },
] as const;

export function ProfileSummaryWidget() {
  const nonce = useDashboardRefreshNonce();
  const { data: rows = [], isLoading: loading } = useAsync(
    async () => (await getDashboardProfileSummary()) as Row[],
    [nonce],
  );

  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <Card className="h-full w-full">
      <CardHeader className="border-b py-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold text-foreground">
            แยกตามประเภทพัสดุ
          </CardTitle>
          {!loading && rows.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
              รวม {total.toLocaleString("th-TH")} รายการ
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-[30px] rounded-lg" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">ไม่มีข้อมูล</p>
        ) : (
          <div className="space-y-1">
            {rows.map((r) => {
              const Icon = profileIcon(r.icon);
              return (
                <Link
                  key={r.profileId}
                  href={`/items?profile=${r.profileId}`}
                  className="block rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={`inline-flex items-center justify-center border shadow-sm shrink-0 border-current/20 ${r.color}`}
                        style={{ width: 30, height: 30, borderRadius: 8 }}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="text-sm font-medium text-foreground truncate">{r.profileName}</span>
                    </span>
                    <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
                      {r.count.toLocaleString("th-TH")}
                    </span>
                  </div>

                  {/* Per-profile status composition — normalized to this profile's own total */}
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                    {STATUS.map((s) => {
                      const val = r[s.key];
                      const pct = r.count > 0 ? (val / r.count) * 100 : 0;
                      if (pct === 0) return null;
                      return (
                        <div
                          key={s.key}
                          className={`h-full ${s.bar}`}
                          style={{ width: `${pct}%`, minWidth: 3 }}
                          title={`${s.label}: ${val.toLocaleString("th-TH")} (${Math.round(pct)}%)`}
                        />
                      );
                    })}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                    {STATUS.map((s) => (
                      <span key={s.key} className="inline-flex items-center gap-1">
                        <span className={`size-1.5 rounded-full ${s.dot}`} />
                        {r[s.key].toLocaleString("th-TH")} {s.label}
                      </span>
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
