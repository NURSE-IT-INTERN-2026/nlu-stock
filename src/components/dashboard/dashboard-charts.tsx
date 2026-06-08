"use client";

import { useState, useEffect } from "react";
import { RecentDispenseTable } from "./recent-dispense-table";
import { RecentReceiveTable } from "./recent-receive-table";
import { TopDispenseChart } from "./top-dispense-chart";
import { UsageBySubjectChart } from "./usage-by-subject-chart";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { Button } from "@/components/ui/button";
import { getDashboardTopDispense, getDashboardUsageBySubject, getDashboardRecentDispense, getDashboardRecentReceive } from "@/lib/api";

interface DispenseRecord {
  id: string; dispensedAt: string; quantity: number;
  item: { id: string; code: string; name: string };
  staff: { name: string };
  usageType: string | null;
  usageNote: string | null;
}
interface ReceiveRecord {
  id: string; receivedAt: string; quantity: number;
  item: { id: string; code: string; name: string };
  receiver: { name: string };
}
interface TopDispenseData { code: string; name: string; totalQuantity: number }
interface UsageSubjectData { usageType: string | null; label: string; totalQuantity: number }

export function DashboardCharts() {
  const [dispenseData, setDispenseData] = useState<DispenseRecord[]>([]);
  const [receiveData, setReceiveData] = useState<ReceiveRecord[]>([]);
  const [topDispense, setTopDispense] = useState<TopDispenseData[]>([]);
  const [usageBySubject, setUsageBySubject] = useState<UsageSubjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [dispense, receive, top, usage] = await Promise.all([
          getDashboardRecentDispense(),
          getDashboardRecentReceive(),
          getDashboardTopDispense(),
          getDashboardUsageBySubject(),
        ]);

        setDispenseData(dispense as DispenseRecord[]);
        setReceiveData(receive as ReceiveRecord[]);
        setTopDispense(top as TopDispenseData[]);
        setUsageBySubject(usage as UsageSubjectData[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchAll();
  }, []);

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive mb-2">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <RecentDispenseTable data={dispenseData} />
        <RecentReceiveTable data={receiveData} />
      </div>
    </>
  );
}
