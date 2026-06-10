"use client";

import { RecentDispenseTable } from "./recent-dispense-table";
import { RecentReceiveTable } from "./recent-receive-table";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { Button } from "@/components/ui/button";
import { useRecentDispense, useRecentReceive } from "@/hooks/use-dashboard-queries";

export function DashboardTables() {
  const dispenseQuery = useRecentDispense();
  const receiveQuery = useRecentReceive();

  const loading = dispenseQuery.isLoading || receiveQuery.isLoading;
  const error = dispenseQuery.error?.message ?? receiveQuery.error?.message ?? null;

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="animate-fade-in text-center py-8">
        <p className="text-destructive mb-2">{error}</p>
        <Button
          variant="outline"
          onClick={() => {
            dispenseQuery.refetch();
            receiveQuery.refetch();
          }}
        >
          โหลดใหม่
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in grid gap-3 lg:grid-cols-2">
      <RecentDispenseTable data={dispenseQuery.data ?? []} />
      <RecentReceiveTable data={receiveQuery.data ?? []} />
    </div>
  );
}

/** @deprecated Use DashboardTables */
export const DashboardCharts = DashboardTables;
