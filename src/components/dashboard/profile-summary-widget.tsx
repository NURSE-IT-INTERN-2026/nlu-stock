"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { profileIcon } from "@/lib/profile-icons";
import { getDashboardProfileSummary } from "@/lib/api";
import { useAsync, useDashboardRefreshNonce } from "@/hooks/use-async";
import { Dot, SegmentBar, SectionTitle } from "./primitives";

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
  { key: "ok", label: "พร้อมใช้", cls: "bg-success" },
  { key: "low", label: "ใกล้หมด", cls: "bg-warning" },
  { key: "out", label: "หมด", cls: "bg-danger-500" },
] as const;

export function ProfileSummaryWidget() {
  const nonce = useDashboardRefreshNonce();
  const { data: rows = [], isLoading: loading } = useAsync(
    async () => (await getDashboardProfileSummary()) as Row[],
    [nonce],
  );

  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <section className="animate-rise overflow-hidden rounded-2xl border bg-card shadow-lg shadow-black/[0.04]">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-secondary/40 px-4 py-3">
        <SectionTitle title="แยกตามประเภทพัสดุ" />
        {!loading && rows.length > 0 && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            รวม {total.toLocaleString("th-TH")} รายการ
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-4 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Skeleton className="size-8 rounded-lg" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">ไม่มีข้อมูล</p>
      ) : (
        <div className="divide-y">
          {rows.map((r, i) => {
            const Icon = profileIcon(r.icon);
            // "สุขภาพคลัง" is the share of items that are neither low nor out — the one number
            // that says whether this profile needs restocking at a glance.
            const health = r.count > 0 ? Math.round((r.ok / r.count) * 100) : 0;
            return (
              <Link
                key={r.profileId}
                href={`/items?profile=${r.profileId}`}
                // Three columns on desktop (identity · composition · total); on mobile the bar
                // drops to its own full-width row so the Thai profile name keeps its space.
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-3.5 transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[minmax(140px,200px)_minmax(0,1fr)_72px]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className={`inline-grid size-8 shrink-0 place-items-center rounded-lg border border-current/20 shadow-sm ${r.color}`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="truncate text-sm font-semibold text-foreground">{r.profileName}</span>
                </span>

                <div className="order-3 col-span-2 min-w-0 md:order-none md:col-span-1">
                  <SegmentBar
                    delay={i * 80}
                    segments={STATUS.map((s) => ({
                      value: r[s.key],
                      className: s.cls,
                      title: `${s.label}: ${r[s.key].toLocaleString("th-TH")}`,
                    }))}
                  />
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
                    {STATUS.map((s) => (
                      <span key={s.key} className="inline-flex items-center gap-1">
                        <Dot className={s.cls} /> {r[s.key].toLocaleString("th-TH")} {s.label}
                      </span>
                    ))}
                    <span className="ml-auto hidden font-semibold sm:inline">สุขภาพคลัง {health}%</span>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-lg font-bold tabular-nums">{r.count.toLocaleString("th-TH")}</p>
                  <p className="text-[10px] text-muted-foreground">รายการ</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
