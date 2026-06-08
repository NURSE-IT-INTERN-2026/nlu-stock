"use client";

import { useState, useEffect } from "react";
import { StatusOverviewChart } from "./status-overview-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getDashboardStatusOverview } from "@/lib/api";

export function StatusOverviewWidget() {
  const [data, setData] = useState<{ status: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardStatusOverview()
      .then((d) => { setData(d as { status: string; count: number }[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return <StatusOverviewChart data={data} />;
}
