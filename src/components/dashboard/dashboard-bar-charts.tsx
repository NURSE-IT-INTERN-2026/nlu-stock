"use client";

import { useState, useEffect } from "react";
import { TopDispenseChart } from "./top-dispense-chart";
import { UsageBySubjectChart } from "./usage-by-subject-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface TopDispenseData { code: string; name: string; totalQuantity: number }
interface UsageSubjectData { usageType: string | null; label: string; totalQuantity: number }

function ChartGhost({ title, variant }: { title: string; variant: "horizontal" | "vertical" }) {
  return (
    <Card>
      <CardHeader className="pb-2 shrink-0">
        <Skeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        {variant === "horizontal" ? (
          // Mimic horizontal bar chart rows
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
          // Mimic vertical bar chart columns
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
  const [topDispense, setTopDispense] = useState<TopDispenseData[]>([]);
  const [usageBySubject, setUsageBySubject] = useState<UsageSubjectData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard/top-dispense").then((r) => r.json()),
      fetch("/api/dashboard/usage-by-subject").then((r) => r.json()),
    ]).then(([top, usage]) => {
      setTopDispense(top);
      setUsageBySubject(usage);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 h-full">
        <ChartGhost title="Top Dispensed This Month" variant="horizontal" />
        <ChartGhost title="Usage by Type This Month" variant="vertical" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 h-full">
      <TopDispenseChart data={topDispense} />
      <UsageBySubjectChart data={usageBySubject} />
    </div>
  );
}
