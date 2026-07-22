"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useSession } from "@/components/layout/auth-guard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { refreshDashboard } from "@/hooks/use-async";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "สวัสดีตอนเช้า";
  if (h < 17) return "สวัสดีตอนบ่าย";
  return "สวัสดีตอนเย็น";
}

function formatTimestamp(d: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function DashboardGreeting() {
  const { user } = useSession();
  const router = useRouter();
  const greeting = getGreeting();
  const firstName = user?.name?.split(" ")[0] ?? "ผู้ใช้งาน";

  // ponytail: last-refreshed moment (not a ticking wall-clock) — avoids implying
  // freshness the data may not have. Refresh pulls server data + invalidates cache.
  const [lastRefreshed, setLastRefreshed] = useState<Date>(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => {
    setRefreshing(true);
    refreshDashboard();
    router.refresh();
    setLastRefreshed(new Date());
    window.setTimeout(() => setRefreshing(false), 600);
  }, [router]);

  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-2xl flex items-baseline gap-2 flex-wrap">
          <span className="font-normal text-muted-foreground">{greeting}, </span>
          <span className="font-bold text-foreground">{firstName}</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          สถานะพัสดุในคลังล่าสุดประจำวัน
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          อัปเดตล่าสุด: {formatTimestamp(lastRefreshed)}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={refresh}
        disabled={refreshing}
        className="shrink-0"
      >
        <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
        รีเฟรช
      </Button>
    </div>
  );
}
