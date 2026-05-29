"use client";

import { useState, useEffect } from "react";
import { RecentDispenseTable } from "./recent-dispense-table";
import { RecentReceiveTable } from "./recent-receive-table";
import { TopDispenseChart } from "./top-dispense-chart";
import { UsageBySubjectChart } from "./usage-by-subject-chart";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { Button } from "@/components/ui/button";

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
        const [dispenseRes, receiveRes, topRes, usageRes] = await Promise.all([
          fetch("/api/dashboard/recent-dispense"),
          fetch("/api/dashboard/recent-receive"),
          fetch("/api/dashboard/top-dispense"),
          fetch("/api/dashboard/usage-by-subject"),
        ]);

        if (!dispenseRes.ok || !receiveRes.ok || !topRes.ok || !usageRes.ok) {
          throw new Error("Failed to fetch dashboard data");
        }

        const [dispense, receive, top, usage] = await Promise.all([
          dispenseRes.json(),
          receiveRes.json(),
          topRes.json(),
          usageRes.json(),
        ]);

        setDispenseData(dispense);
        setReceiveData(receive);
        setTopDispense(top);
        setUsageBySubject(usage);
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
