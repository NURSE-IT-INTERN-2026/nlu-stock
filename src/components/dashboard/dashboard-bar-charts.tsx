"use client";

import { TopDispenseChart } from "./top-dispense-chart";
import { UsageBySubjectChart } from "./usage-by-subject-chart";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useTopDispense, useUsageBySubject } from "@/hooks/use-dashboard-queries";

function ChartGhost({ variant }: { variant: "horizontal" | "vertical" }) {
  return (
    <Card>
      <CardHeader className="pb-2 shrink-0">
        <Skeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        {variant === "horizontal" ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3 w-24 shrink-0" />
              <Skeleton
                className="h-6 rounded-sm"
                style={{ width: `${85 - i * 15}%` }}
              />
            </div>
          ))
        ) : (
          <div className="flex items-end justify-around gap-2 h-[240px]">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton
                key={i}
                className="w-full rounded-t-sm"
                style={{ height: `${85 - i * 12}%` }}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardBarCharts() {
  const topQuery = useTopDispense();
  const usageQuery = useUsageBySubject();

  const loading = topQuery.isLoading || usageQuery.isLoading;
  const error = topQuery.error?.message ?? usageQuery.error?.message ?? null;

  if (loading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 min-h-[340px]">
        <ChartGhost variant="horizontal" />
        <ChartGhost variant="vertical" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-fade-in text-center py-8">
        <p className="text-destructive mb-2">{error}</p>
        <Button
          variant="outline"
          onClick={() => {
            topQuery.refetch();
            usageQuery.refetch();
          }}
        >
          โหลดใหม่
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in grid gap-3 md:grid-cols-2 h-full min-h-[340px]">
      <TopDispenseChart data={topQuery.data ?? []} />
      <UsageBySubjectChart data={usageQuery.data ?? []} />
    </div>
  );
}
