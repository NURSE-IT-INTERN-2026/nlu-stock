"use client";

import { StatusOverviewChart } from "./status-overview-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStatusOverview } from "@/hooks/use-dashboard-queries";

export function StatusOverviewWidget() {
  const { data, isLoading, error, refetch } = useStatusOverview();

  if (isLoading) {
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

  if (error) {
    return (
      <Card className="animate-fade-in h-full">
        <CardHeader>
          <p className="text-sm font-semibold text-foreground">สถานะภาพรวม</p>
        </CardHeader>
        <CardContent className="text-center py-6">
          <p className="text-sm text-destructive mb-2">{error.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            โหลดใหม่
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="animate-fade-in">
      <StatusOverviewChart data={data ?? []} />
    </div>
  );
}
