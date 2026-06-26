"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { profileIcon } from "@/lib/profile-icons";
import { getDashboardProfileSummary } from "@/lib/api";

interface Row {
  profileId: string;
  profileName: string;
  icon: string;
  color: string;
  count: number;
}

export function ProfileSummaryWidget() {
  const { data: rows = [], isLoading: loading } = useQuery({
    queryKey: ["dashboard", "profile-summary"],
    queryFn: async () => (await getDashboardProfileSummary()) as Row[],
  });

  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <Card className="h-full w-full">
      <CardHeader className="border-b py-3">
        <CardTitle className="text-base font-semibold text-foreground">
          แยกตามประเภทพัสดุ
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">ไม่มีข้อมูล</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const Icon = profileIcon(r.icon);
              const textCls = r.color.split(" ").filter((c) => c.startsWith("text-")).join(" ");
              return (
                <Link
                  key={r.profileId}
                  href={`/items?profile=${r.profileId}`}
                  className="block rounded-lg border border-border/60 bg-card px-3 py-2.5 transition-colors hover:border-primary/50 hover:bg-accent"
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={`inline-flex items-center justify-center border shadow-sm shrink-0 border-current/20 ${r.color}`}
                        style={{ width: 38, height: 38, borderRadius: 10 }}
                      >
                        <Icon className="size-5" />
                      </span>
                      <span className="font-medium text-foreground truncate">{r.profileName}</span>
                    </span>
                    <span className="font-semibold text-foreground tabular-nums shrink-0 ml-2">
                      {r.count}
                      <span className="text-muted-foreground font-normal ml-1">
                        ({total > 0 ? Math.round((r.count / total) * 100) : 0}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-current transition-all ${textCls}`}
                      style={{ width: `${total > 0 ? (r.count / total) * 100 : 0}%` }}
                    />
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
