"use client";

import { useState, useEffect } from "react";
import { TopDispenseChart } from "./top-dispense-chart";
import { UsageBySubjectChart } from "./usage-by-subject-chart";

interface TopDispenseData { code: string; name: string; totalQuantity: number }
interface UsageSubjectData { usageType: string | null; label: string; totalQuantity: number }

export function DashboardBarCharts() {
  const [topDispense, setTopDispense] = useState<TopDispenseData[]>([]);
  const [usageBySubject, setUsageBySubject] = useState<UsageSubjectData[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard/top-dispense").then((r) => r.json()),
      fetch("/api/dashboard/usage-by-subject").then((r) => r.json()),
    ]).then(([top, usage]) => {
      setTopDispense(top);
      setUsageBySubject(usage);
    });
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TopDispenseChart data={topDispense} />
      <UsageBySubjectChart data={usageBySubject} />
    </div>
  );
}
